using System.Diagnostics;
using System.Text.Json;

namespace ApexShell;

/// <summary>本地源码验证与安装版同步。任务不占用 WebView 消息线程，状态落盘供重启后查看。</summary>
public sealed class UpdateService
{
    public static UpdateService Shared { get; } = new(ConsoleConfig.ProjectDir,
        @"D:\Apps\ControlPod", Path.Combine(ConsoleConfig.RuntimeDir, "updates"), true);
    private readonly string _source, _install, _root;
    private readonly object _gate = new();
    private bool _busy;
    private string? _activeTarget;
    public bool IsBusy { get { lock (_gate) return _busy; } }
    private readonly Timer? _timer;
    private record Preferences(bool dailyCheck = false, bool autoUpdate = false);
    private Preferences ReadPreferences() => File.Exists(Path.Combine(_root, "preferences.json"))
        ? JsonSerializer.Deserialize<Preferences>(File.ReadAllText(Path.Combine(_root, "preferences.json"))) ?? new()
        : new();

    public UpdateService(string source, string install, string root, bool schedule = false)
    {
        _source = source; _install = install; _root = root;
        if (schedule) _timer = new Timer(_ => AutomaticCheck(), null, TimeSpan.FromSeconds(15), TimeSpan.FromMinutes(30));
    }

    public object Status()
    {
        lock (_gate)
        {
            var prefs = ReadPreferences();
            var path = Path.Combine(_root, "status.json");
            JsonElement? state = File.Exists(path) ? JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path)) : null;
            var reportPath = Path.Combine(_root, "validation.log");
            var report = File.Exists(reportPath) ? File.ReadAllText(reportPath) : "";
            if (report.Length > 6000) report = report[^6000..];
            return new { available = File.Exists(Path.Combine(_source, "tools", "update-local.ps1")),
                busy = _busy, activeTarget = _busy ? _activeTarget : null,
                dailyCheck = prefs.dailyCheck, autoUpdate = prefs.autoUpdate, state,
                platformOutput = report,
                platform = File.Exists(Path.Combine(_root, "controlpod-status.json"))
                    ? JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(_root, "controlpod-status.json"))) : (JsonElement?)null,
                external = File.Exists(Path.Combine(_root, "external.json"))
                    ? JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(_root, "external.json"))) : (JsonElement?)null };
        }
    }

    public object Configure(bool dailyCheck, bool autoUpdate)
    {
        if (autoUpdate && !dailyCheck) throw new LocalApi.RequestInvalidError("自动更新需要同时开启每日检查");
        lock (_gate)
        {
            Directory.CreateDirectory(_root);
            File.WriteAllText(Path.Combine(_root, "preferences.json"), JsonSerializer.Serialize(new Preferences(dailyCheck, autoUpdate)));
            return Status();
        }
    }

    public object Start(string mode, string target = "all")
    {
        if (target is not ("all" or "controlpod" or "external" or "apex-launcher" or "dou-link" or "run-analytics" or "Bili-Peek"))
            throw new LocalApi.RequestInvalidError("未知的更新项目");
        if (mode == "apply") return Finish();
        if (mode is not ("check" or "test" or "update")) throw new LocalApi.RequestInvalidError("操作必须是 check、test 或 update");
        lock (_gate)
        {
            if (_busy) throw new ProjectConflictError("验证或更新正在进行，请等待完成");
            var status = Path.Combine(_root, "status.json");
            if (File.Exists(status) && JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(status))
                .TryGetProperty("phase", out var phase) && phase.GetString() == "pending")
                throw new ProjectConflictError("新版已准备好，请退出并完成更新");
            var script = Path.Combine(_source, "tools", "update-local.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("本地更新工具不存在，请检查源码目录", script);
            Directory.CreateDirectory(_root);
            _busy = true;
            _activeTarget = target;
            WriteFailureOrProgress("running", "正在" + (mode == "check" ? "检查本地变化" : "验证当前改动"));
            _ = Task.Run(async () =>
            {
                try
                {
                    var psi = new ProcessStartInfo("powershell.exe") { UseShellExecute = false,
                        CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                    // PowerShell 7 / 桌面宿主的模块路径不能交给 Windows PowerShell 5。
                    psi.Environment.Remove("PSModulePath");
                    foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
                        "-Mode", mode, "-Target", target, "-Source", _source, "-Install", _install, "-StateDir", _root,
                        "-OwnerId", Environment.ProcessId.ToString() }) psi.ArgumentList.Add(arg);
                    using var process = Process.Start(psi) ?? throw new IOException("无法启动更新工具");
                    var stdout = process.StandardOutput.ReadToEndAsync();
                    var stderr = process.StandardError.ReadToEndAsync();
                    using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(30));
                    try { await process.WaitForExitAsync(timeout.Token); }
                    catch (OperationCanceledException) { process.Kill(true); throw new TimeoutException("验证超过 30 分钟，已停止；安装版未标记成功"); }
                    var output = await stdout + "\n" + await stderr;
                    File.WriteAllText(Path.Combine(_root, "worker.log"), output);
                    if (process.ExitCode != 0) throw new IOException(output.Length > 1800 ? output[^1800..] : output);
                }
                catch (Exception ex)
                {
                    lock (_gate)
                    {
                        var stateFile = Path.Combine(_root, "status.json");
                        var failed = File.Exists(stateFile) && JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(stateFile))
                            .TryGetProperty("phase", out var phase) && phase.GetString() == "failed";
                        if (!failed) WriteFailureOrProgress("failed", ex.Message);
                    }
                }
                finally { lock (_gate) _busy = false; }
            });
            return Status();
        }
    }

    private object Finish()
    {
        lock (_gate)
        {
            if (_busy) throw new ProjectConflictError("请等待验证完成后再退出更新");
            var stateFile = Path.Combine(_root, "status.json");
            if (!File.Exists(stateFile) || !JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(stateFile))
                .TryGetProperty("phase", out var phase) || phase.GetString() != "pending")
                throw new ProjectConflictError("没有等待安装的新版");
            var pendingPath = Path.Combine(_root, "pending.json");
            using var pending = JsonDocument.Parse(File.ReadAllText(pendingPath));
            var root = pending.RootElement;
            if (root.TryGetProperty("applyPid", out var pid))
            {
                try { using var running = Process.GetProcessById(pid.GetInt32()); if (!running.HasExited && running.ProcessName == "powershell") return Status(); }
                catch (ArgumentException) { }
            }
            var prepared = Path.GetFullPath(root.GetProperty("prepared").GetString()!);
            var helper = Path.GetFullPath(root.GetProperty("helper").GetString()!);
            if (!string.Equals(Path.GetDirectoryName(prepared), Path.GetDirectoryName(_install), StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(prepared).StartsWith(".ControlPod-update-", StringComparison.Ordinal)
                || !helper.StartsWith(Path.GetFullPath(_root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || !File.Exists(helper) || !File.Exists(Path.Combine(prepared, "ApexShell.exe")))
                throw new IOException("待安装文件不完整，请查看更新日志");
            var psi = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true };
            psi.Environment.Remove("PSModulePath");
            foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper,
                "-Prepared", prepared, "-Install", _install, "-StateDir", _root, "-OwnerId", Environment.ProcessId.ToString() }) psi.ArgumentList.Add(arg);
            using var process = Process.Start(psi) ?? throw new IOException("无法启动安装替换工具");
            File.WriteAllText(pendingPath, JsonSerializer.Serialize(new { prepared, helper, applyPid = process.Id }));
            return Status();
        }
    }

    private void WriteFailureOrProgress(string phase, string message) =>
        File.WriteAllText(Path.Combine(_root, "status.json"), JsonSerializer.Serialize(new { phase, message, at = DateTimeOffset.UtcNow }));

    private void AutomaticCheck()
    {
        try
        {
            lock (_gate)
            {
                if (_busy) return;
                var stamp = Path.Combine(_root, "auto-check.txt");
                if (File.Exists(stamp) && DateTimeOffset.TryParse(File.ReadAllText(stamp), out var last)
                    && DateTimeOffset.UtcNow - last < TimeSpan.FromHours(24)) return;
                // 后台只检查；安装必须由用户在界面确认。旧偏好不再触发自动安装。
                Start("check");
                File.WriteAllText(stamp, DateTimeOffset.UtcNow.ToString("O"));
            }
        }
        catch (Exception ex)
        {
            // 待重启时保留 pending 状态，不覆盖已经准备好的更新。
            Debug.WriteLine("自动检查未启动：" + ex.Message);
        }
    }
}
