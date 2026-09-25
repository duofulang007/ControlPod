using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ApexShell;

/* 异常与 Python 版 HTTPException 映射一致：
   LookupError→404  ValueError/FileNotFoundError→422  RuntimeError→409 */

public sealed class ModuleMissingError : Exception
{
    public ModuleMissingError(string m) : base(m) { }
}

public sealed class ModuleInvalidError : Exception
{
    public ModuleInvalidError(string m) : base(m) { }
}

public sealed class ModuleBusyError : Exception
{
    public ModuleBusyError(string m) : base(m) { }
}

/// <summary>
/// 二期 C# 版 backend/app/module_runner.py：三类模块（web / application / script 落地子进程）
/// 的启动、等待、取消与运行记录。并发模型：asyncio.Task → Task.Run + CancellationTokenSource，
/// 进程超时/取消都走 Kill(entireProcessTree)。
/// </summary>
public sealed class ModuleRunner
{
    private sealed record RunTask(Task Task, CancellationTokenSource Cts);

    private static readonly string[] RunningStates = { "queued", "running" };

    private readonly Db _db;
    private readonly ModuleRegistry _registry;
    private readonly string _runsDir;
    private readonly Func<string, bool> _webOpener;
    private readonly ApplicationCatalog? _applicationCatalog;
    private readonly ConcurrentDictionary<string, RunTask> _tasks = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, string> _moduleRuns = new(StringComparer.Ordinal);

    /// <summary>webOpener 可注入：自测环境传假开启器（真 ShellExecute 会真开浏览器窗口）。</summary>
    public ModuleRunner(Db db, ModuleRegistry registry, string runsDir,
        Func<string, bool>? webOpener = null, ApplicationCatalog? applicationCatalog = null)
    {
        _db = db;
        _registry = registry;
        _runsDir = Path.GetFullPath(runsDir);
        _webOpener = webOpener ?? DefaultWebOpener;
        _applicationCatalog = applicationCatalog;
    }

    /* ---------- manifest → 数据库同步（sync_registry 逐条对齐） ---------- */

    public void SyncRegistry()
    {
        var now = Db.UtcNow();
        foreach (var item in _registry.All())
        {
            _db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES(@p0,@p1,'script','',@p2,'',@p3,@p4,1,@p5) " +
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, type='script', entry=excluded.entry, " +
                "version=excluded.version, manifest_path=excluded.manifest_path, enabled=1, updated_at=excluded.updated_at",
                item.Id, item.Name, item.Id, item.Version, item.ManifestPath, now);
            // 模块登记的项目的排在末尾，不插到用户已排好的卡片顺序最前面
            _db.Execute(
                "INSERT OR IGNORE INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
                "VALUES(@p0,@p1,@p2,'正常',@p3,@p4,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM projects))",
                item.ProjectId, item.ProjectName, item.ProjectDescription, now, now);
            _db.Execute(
                "INSERT OR IGNORE INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(@p0,@p1,0,1)",
                item.ProjectId, item.Id);
        }
    }

    /* ---------- 前置校验（validate_module_action 逐条对齐） ---------- */

    public Dictionary<string, object?> ValidateModuleAction(string moduleId, string action)
    {
        var stored = _db.FetchOne("SELECT * FROM modules WHERE id=@p0 AND enabled=1", moduleId);
        if (stored is null)
            throw new ModuleMissingError("模块不存在或已停用");
        var type = (stored.GetValueOrDefault("type") as string) ?? "";
        if (type == "web")
        {
            if (action != "run")
                throw new ModuleMissingError($"网页模块不支持动作：{action}");
            return stored;
        }
        if (type == "application")
        {
            if (action != "run")
                throw new ModuleMissingError($"应用模块不支持动作：{action}");
            if (_applicationCatalog is null)
                throw new ModuleBusyError("应用启动器未配置");
            _applicationCatalog.ValidateLaunch((stored.GetValueOrDefault("entry") as string) ?? "");
            return stored;
        }
        var module = _registry.Get(moduleId);
        if (module is null)
            throw new ModuleMissingError("模块定义不存在");
        if (!module.Actions.TryGetValue(action, out var actionDef))
            throw new ModuleMissingError($"模块不支持动作：{action}");
        if (module.SingleInstance)
        {
            var activeId = _moduleRuns.TryGetValue($"{moduleId}:{action}", out var id) ? id : null;
            var active = activeId is null ? null : GetRun(activeId);
            if (active is not null && RunningStates.Contains((active.GetValueOrDefault("status") as string) ?? ""))
                throw new ModuleBusyError($"该模块的 {action} 动作已在运行");
        }
        if (!Directory.Exists(module.ProjectRoot))
            throw new ModuleInvalidError($"项目目录不存在：{module.ProjectRoot}");
        if (!Directory.Exists(actionDef.Cwd))
            throw new ModuleInvalidError($"模块工作目录不存在：{actionDef.Cwd}");
        return stored;
    }

    public bool SupportsAction(string moduleId, string action)
    {
        var stored = _db.FetchOne("SELECT type,enabled FROM modules WHERE id=@p0", moduleId);
        if (stored is null || AsLong(stored.GetValueOrDefault("enabled")) == 0)
            return false;
        var type = (stored.GetValueOrDefault("type") as string) ?? "";
        if (type == "web") return action == "run";
        if (type == "application") return action == "run" && _applicationCatalog is not null;
        var module = _registry.Get(moduleId);
        return module is not null && module.Actions.ContainsKey(action);
    }

    /* ---------- 启动 ---------- */

    public Dictionary<string, object?> StartModule(string projectId, string moduleId, string action = "run")
    {
        var stored = ValidateModuleAction(moduleId, action);
        var type = (stored.GetValueOrDefault("type") as string) ?? "";
        var runId = Guid.NewGuid().ToString();
        var runDir = NewRunDir();
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) VALUES(@p0,@p1,@p2,@p3,'queued',@p4,@p5)",
            runId, projectId, moduleId, action, now, runDir);

        // cts 必须在 worker 启动前注册（执行体与 CancelRun 都要从字典里拿到它）
        var cts = new CancellationTokenSource();
        _ctsByRun[runId] = cts;
        Task worker;
        if (type == "web")
            worker = Task.Run(() => ExecuteWebAsync(runId, stored, runDir));
        else if (type == "application")
            worker = Task.Run(() => ExecuteApplicationAsync(runId, stored, runDir));
        else
        {
            var module = _registry.Get(moduleId)
                ?? throw new ModuleMissingError("模块定义不存在");
            var activeKey = $"{moduleId}:{action}";
            _moduleRuns[activeKey] = runId;   // 提前占位：single_instance 的并发拦截靠它
            worker = Task.Run(() => ExecuteScriptAsync(runId, module, action, module.Actions[action], runDir));
        }
        _tasks[runId] = new RunTask(worker, cts);
        worker.ContinueWith(done =>
        {
            _ = done;
            _tasks.TryRemove(runId, out _);
            _ctsByRun.TryRemove(runId, out _);
        }, TaskScheduler.Default);
        return GetRun(runId) ?? new Dictionary<string, object?>();
    }

    private string NewRunDir()
    {
        var runDir = Path.Combine(_runsDir, Guid.NewGuid().ToString());
        if (Directory.Exists(runDir))
            throw new ModuleInvalidError($"运行目录已存在：{runDir}");
        Directory.CreateDirectory(runDir);
        return runDir;
    }

    private readonly ConcurrentDictionary<string, CancellationTokenSource> _ctsByRun =
        new(StringComparer.Ordinal);

    /* ---------- 存活 / 取消 ---------- */

    /// <summary>这个 run 在本进程里是否还有活着的执行任务。任务结束就意味着不会再有
    /// 新的落库状态，等待方必须据此收手，不能对着一个不再变化的 running 行无限空转。</summary>
    public bool RunIsLive(string runId) =>
        _tasks.TryGetValue(runId, out var runTask) && !runTask.Task.IsCompleted;

    public async Task CancelRunAsync(string runId, string reason)
    {
        if (_tasks.TryGetValue(runId, out var runTask) && !runTask.Task.IsCompleted)
        {
            runTask.Cts.Cancel();
            try { await runTask.Task.ConfigureAwait(false); }
            catch { /* 任务内部的取消语义自己兜底 */ }
        }
        var run = GetRun(runId);
        if (run is not null && RunningStates.Contains((run.GetValueOrDefault("status") as string) ?? ""))
            _db.Execute(
                "UPDATE runs SET status='interrupted',finished_at=@p0,error=@p1 WHERE id=@p2",
                Db.UtcNow(), reason, runId);
    }

    /* ---------- web 模块 ---------- */

    private async Task ExecuteWebAsync(string runId, Dictionary<string, object?> module, string runDir)
    {
        _db.Execute("UPDATE runs SET status='running' WHERE id=@p0", runId);
        var logPath = Path.Combine(runDir, "module.log");
        var resultPath = Path.Combine(runDir, "result.json");
        var url = (module.GetValueOrDefault("entry") as string) ?? "";
        string status = "failed";
        string? error = null;
        long? exitCode = null;
        try
        {
            File.WriteAllText(logPath, $"[STEP] 正在打开网页：{url}\n", new UTF8Encoding(false));
            var opened = await Task.Run(() => _webOpener(url)).ConfigureAwait(false);
            if (!opened)
                throw new ModuleBusyError("系统浏览器未接受打开请求");
            File.AppendAllText(logPath, $"[OK] 已请求系统浏览器打开：{url}\n", new UTF8Encoding(false));
            File.WriteAllText(resultPath,
                JsonSerializer.Serialize(new Dictionary<string, object?> { ["ok"] = true, ["type"] = "web", ["url"] = url }),
                new UTF8Encoding(false));
            status = "succeeded";
            exitCode = 0;
        }
        catch (Exception ex)
        {
            error = $"{ex.GetType().Name}: {ex.Message}";
            File.AppendAllText(logPath, $"[ERROR] {error}\n", new UTF8Encoding(false));
        }
        finally
        {
            _db.Execute(
                "UPDATE runs SET status=@p0,finished_at=@p1,exit_code=@p2,error=@p3 WHERE id=@p4",
                status, Db.UtcNow(), exitCode, error, runId);
        }
    }

    /* ---------- application 模块 ---------- */

    private async Task ExecuteApplicationAsync(string runId, Dictionary<string, object?> module, string runDir)
    {
        _db.Execute("UPDATE runs SET status='running' WHERE id=@p0", runId);
        var logPath = Path.Combine(runDir, "module.log");
        var resultPath = Path.Combine(runDir, "result.json");
        var applicationId = (module.GetValueOrDefault("entry") as string) ?? "";
        var name = (module.GetValueOrDefault("name") as string) ?? "";
        string status = "failed";
        string? error = null;
        long? exitCode = null;
        try
        {
            if (_applicationCatalog is null)
                throw new ModuleBusyError("应用启动器未配置");
            File.WriteAllText(logPath, $"[STEP] 正在启动应用：{name}\n", new UTF8Encoding(false));
            await Task.Run(() => _applicationCatalog.Launch(applicationId)).ConfigureAwait(false);
            File.AppendAllText(logPath, $"[OK] 已请求 Windows 启动应用：{name}\n", new UTF8Encoding(false));
            File.WriteAllText(resultPath,
                JsonSerializer.Serialize(new Dictionary<string, object?>
                {
                    ["ok"] = true, ["type"] = "application", ["application_id"] = applicationId,
                }),
                new UTF8Encoding(false));
            status = "succeeded";
            exitCode = 0;
        }
        catch (Exception ex)
        {
            error = $"{ex.GetType().Name}: {ex.Message}";
            File.AppendAllText(logPath, $"[ERROR] {error}\n", new UTF8Encoding(false));
        }
        finally
        {
            _db.Execute(
                "UPDATE runs SET status=@p0,finished_at=@p1,exit_code=@p2,error=@p3 WHERE id=@p4",
                status, Db.UtcNow(), exitCode, error, runId);
        }
    }

    /* ---------- script 模块：落地子进程 ---------- */

    private async Task ExecuteScriptAsync(string runId, ModuleDefinition module, string action,
        ModuleActionDef actionDef, string runDir)
    {
        _db.Execute("UPDATE runs SET status='running' WHERE id=@p0", runId);
        var resultPath = Path.Combine(runDir, "result.json");
        var logPath = Path.Combine(runDir, "module.log");
        var stdoutPath = Path.Combine(runDir, "process.stdout.log");
        var stderrPath = Path.Combine(runDir, "process.stderr.log");
        var values = RunValues(module, runDir);
        long? exitCode = null;
        string? error = null;
        string status = "failed";
        var cts = _ctsByRun.GetOrAdd(runId, _ => new CancellationTokenSource());
        Process? proc = null;
        try
        {
            // 占位符展开必须留在这道 try 里面：manifest 写了未知占位符时，异常若从 try 前面
            // 逃出去，finally 不会执行，run 永远停在 running（Python 版踩过：项目卡死「运行中」）。
            var program = Expand(actionDef.Program, values);
            var args = actionDef.Args.Select(a => Expand(a, values)).ToList();

            if (!OperatingSystem.IsWindows())
                throw new ModuleInvalidError("模块子进程仅支持 Windows");
            // 一律 CREATE_NO_WINDOW（不接受 requiresAdmin 的旧分支）。旧写法 CreateNoWindow = !requiresAdmin
            // 是从 Python 版逐字搬过来的，但两边父进程的处境根本不同：Python 后端跑在控制台里，requiresAdmin
            // 分支「不传 CREATE_NO_WINDOW」只是让子进程沿用后端那个已经存在的控制台；壳是 WinUI GUI 进程，
            // 自己没有控制台可以让子进程继承，于是系统给子进程**新分配**一个控制台窗口——而子进程的
            // stdout/stderr 又全被重定向进 process.stdout.log / process.stderr.log，那个窗口永远一个字都没有，
            // 用户看到的就是一块悬在桌面上的「黑屏」。
            // 2026-09-25 无控制台父进程 A/B 实测：flags=0 → 子进程拿到可见控制台（GetConsoleWindow 非 0、
            // IsWindowVisible=1）；CREATE_NO_WINDOW → 根本不分配控制台。所以壳这边必须是 true。
            var psi = new ProcessStartInfo
            {
                FileName = program,
                WorkingDirectory = actionDef.Cwd,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            foreach (var arg in args) psi.ArgumentList.Add(arg);

            // requiresAdmin 在壳里不再影响窗口标志（见上），但它是真话：带这个声明的模块会自己用
            // runas 提权（apex-launcher 就是），运行时会弹 UAC。提前写一行进运行日志，
            // 免得用户以为那个提权确认是别人弹的。这里也是本字段在壳里的唯一读取点。
            if (module.RequiresAdmin)
                File.AppendAllText(logPath,
                    "[INFO] 该模块声明需要管理员权限，运行时会弹出 UAC 提权确认\n", new UTF8Encoding(false));

            await using var stdoutFile = new FileStream(stdoutPath, FileMode.Create, FileAccess.Write, FileShare.Read);
            await using var stderrFile = new FileStream(stderrPath, FileMode.Create, FileAccess.Write, FileShare.Read);
            proc = Process.Start(psi) ?? throw new ModuleBusyError("子进程启动失败");
            var stdoutCopy = proc.StandardOutput.BaseStream.CopyToAsync(stdoutFile);
            var stderrCopy = proc.StandardError.BaseStream.CopyToAsync(stderrFile);

            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(module.TimeoutSeconds));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cts.Token, timeoutCts.Token);
            try
            {
                await proc.WaitForExitAsync(linked.Token).ConfigureAwait(false);
                exitCode = SafeExitCode(proc);
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !cts.Token.IsCancellationRequested)
            {
                await KillTreeAsync(proc).ConfigureAwait(false);
                exitCode = SafeExitCode(proc);
                error = $"模块运行超时（{module.TimeoutSeconds} 秒）";
            }
            catch (OperationCanceledException)
            {
                // 外部取消（ExecutionService 关闭/重启）：Python 版语义 = interrupted + 杀进程
                await KillTreeAsync(proc).ConfigureAwait(false);
                exitCode = SafeExitCode(proc);
                error = "项目操作已被关闭或重启请求强制中断";
                status = "interrupted";
            }

            await Task.WhenAll(stdoutCopy, stderrCopy).ConfigureAwait(false);
            stdoutFile.Flush(); stderrFile.Flush();

            if (error is null)
            {
                var payload = ReadResult(resultPath);
                var okFlag = payload.ValueKind == JsonValueKind.Object
                    && payload.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
                if (exitCode == 0 && okFlag)
                {
                    status = "succeeded";
                }
                else
                {
                    var processError = ReadProcessOutput(stderrPath);
                    if (processError.Length == 0) processError = ReadProcessOutput(stdoutPath);
                    var payloadError = payload.ValueKind == JsonValueKind.Object
                        && payload.TryGetProperty("error", out var errEl)
                        && errEl.ValueKind == JsonValueKind.String ? errEl.GetString() : null;
                    error = payloadError ?? (processError.Length > 0 ? processError : $"模块退出码 {FormatExit(exitCode)}");
                    if (processError.Length > 0)
                    {
                        var builder = new StringBuilder();
                        foreach (var line in processError.Split('\n'))
                            builder.Append("[ERROR] ").Append(line.TrimEnd('\r')).Append('\n');
                        File.AppendAllText(logPath, builder.ToString(), new UTF8Encoding(false));
                    }
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            error = $"{ex.GetType().Name}: {ex.Message}";
        }
        finally
        {
            // status/error/exit_code 已在上面各分支定案；这里只负责落库与清理（对齐 Python 的 finally）
            _db.Execute(
                "UPDATE runs SET status=@p0,finished_at=@p1,exit_code=@p2,error=@p3 WHERE id=@p4",
                status, Db.UtcNow(), exitCode, error, runId);
            var activeKey = $"{module.Id}:{action}";
            if (_moduleRuns.TryGetValue(activeKey, out var current) && current == runId)
                _moduleRuns.TryRemove(activeKey, out _);
            proc?.Dispose();
        }
    }

    private static async Task KillTreeAsync(Process proc)
    {
        try
        {
            if (!proc.HasExited) proc.Kill(entireProcessTree: true);
            await proc.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is InvalidOperationException or SystemException)
        {
            // 进程恰好自行退出：忽略竞态
        }
    }

    private static long? SafeExitCode(Process proc)
    {
        try { return proc.HasExited ? proc.ExitCode : null; }
        catch (InvalidOperationException) { return null; }
    }

    private static string FormatExit(long? code) => code?.ToString(CultureInfo.InvariantCulture) ?? "未知";

    /* ---------- 占位符 / 结果文件 / 输出解码 ---------- */

    /// <summary>动作参数的可用占位符集合。manifest 里能写哪些名字，全看这里。</summary>
    private Dictionary<string, string> RunValues(ModuleDefinition module, string runDir) => new()
    {
        ["module_dir"] = module.ModuleDir,
        ["project_root"] = module.ProjectRoot,
        ["console_root"] = _registry.ConsoleRoot,
        ["run_dir"] = runDir,
        ["result_path"] = Path.Combine(runDir, "result.json"),
        ["log_path"] = Path.Combine(runDir, "module.log"),
    };

    internal static string Expand(string value, IReadOnlyDictionary<string, string> values)
    {
        var result = value;
        foreach (var (key, replacement) in values)
            result = result.Replace("{" + key + "}", replacement);
        if (result.Contains('{') || result.Contains('}'))
            throw new ModuleInvalidError($"模块参数包含未知占位符：{value}");
        return result;
    }

    private static JsonElement ReadResult(string path)
    {
        if (!File.Exists(path)) return default;
        try
        {
            // Clone() 让 element 脱离 document 的内存，document 立刻释放不泄漏
            using var doc = JsonDocument.Parse(StripBom(File.ReadAllText(path)));
            return doc.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.Clone() : default;
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            return default;
        }
    }

    private static string StripBom(string text) =>
        text.Length > 0 && text[0] == '\uFEFF' ? text[1..] : text;

    /// <summary>utf-8-sig → utf-16 → gb18030 逐个尝试，全失败按替换解码（与 Python 版同序）。</summary>
    internal static string ReadProcessOutput(string path)
    {
        byte[] raw;
        try
        {
            raw = File.ReadAllBytes(path);
        }
        catch (IOException)
        {
            return "";
        }
        if (raw.Length == 0) return "";
        foreach (var encoding in new[] { new UTF8Encoding(false, true), new UnicodeEncoding(bigEndian: false, byteOrderMark: true, throwOnInvalidBytes: true), TryGb18030() })
        {
            if (encoding is null) continue;
            try { return encoding.GetString(raw).Trim(); }
            catch (DecoderFallbackException) { continue; }
        }
        return Encoding.UTF8.GetString(raw).Trim();
    }

    private static Encoding? TryGb18030()
    {
        try { return Encoding.GetEncoding("GB18030"); }
        catch (ArgumentException) { return null; }   // 未注册 CodePages 时的兜底
    }

    private static bool DefaultWebOpener(string url)
    {
        if (!OperatingSystem.IsWindows()) return false;
        try
        {
            using var proc = new Process();
            proc.StartInfo = new ProcessStartInfo { FileName = url, UseShellExecute = true };
            proc.Start();
            return true;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return false;
        }
    }

    /* ---------- 运行记录读取 ---------- */

    public Dictionary<string, object?>? GetRun(string runId)
    {
        var row = _db.FetchOne("SELECT * FROM runs WHERE id=@p0", runId);
        if (row is null) return null;
        var runDir = (row.GetValueOrDefault("run_dir") as string) ?? "";
        row["logs"] = ReadLog(Path.Combine(runDir, "module.log"));
        var result = ReadResult(Path.Combine(runDir, "result.json"));
        row["result"] = result.ValueKind == JsonValueKind.Object ? result : null;
        return row;
    }

    private static List<string> ReadLog(string path, int limit = 300)
    {
        try
        {
            if (!File.Exists(path)) return new List<string>();
            var lines = File.ReadAllLines(path).ToList();
            return lines.Count <= limit ? lines : lines.Skip(lines.Count - limit).ToList();
        }
        catch (IOException)
        {
            return new List<string>();
        }
    }

    private static long AsLong(object? v) => Convert.ToInt64(v ?? 0);
}
