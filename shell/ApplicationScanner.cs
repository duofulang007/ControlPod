using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ApexShell;

/// <summary>
/// 二期 C# 版 backend/app/application_scanner.py，扫描规则与 ID 算法逐条对齐
/// （对照 backend/tests 里 applications 组用例）。两处刻意升级：
/// ①快捷方式解析从 PowerShell 子进程改为进程内 WScript.Shell COM（快一个量级，行为相同）；
/// ②扫描结果带 60 秒缓存（Python 每次现扫，图标路由会重复全扫；C# 侧同值复用，判定结果一致）。
/// </summary>
public sealed class ApplicationScanError : Exception
{
    public ApplicationScanError(string message) : base(message) { }
}

public sealed class ApplicationScanner
{
    public sealed record ScanCandidate(
        string Id, string Name, string Category, string Icon, string IconSource, string LaunchPath);

    private static readonly string[] ExcludedNames =
    {
        "uninstall", "unins", "remove", "repair", "setup", "readme", "release notes",
        "documentation", "help", "website", "support", "license", "install manager",
        "recovery", "卸载", "修复", "帮助", "说明",
    };
    private static readonly string[] ExcludedParts = { "startup", "启动" };
    private static readonly HashSet<string> ExcludedTargets = new(StringComparer.Ordinal)
    {
        "explorer.exe", "rundll32.exe", "control.exe", "mmc.exe",
    };

    private List<ScanCandidate>? _cache;
    private DateTimeOffset _cacheAt = DateTimeOffset.MinValue;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);
    private readonly object _cacheLock = new();

    /// <summary>默认扫描根（自测注入用）；null = 真系统开始菜单。</summary>
    private readonly IEnumerable<string>? _defaultRoots;
    /// <summary>是否拉 PowerShell Get-StartApps 拿 UWP 清单。工具会话的自测环境里
    /// 派生 PowerShell 会被安全软件连根掐掉，所以自测要关；生产壳保持开。</summary>
    private readonly bool _useShellLists;

    public ApplicationScanner(IEnumerable<string>? defaultRoots = null, bool useShellLists = true)
    {
        _defaultRoots = defaultRoots;
        _useShellLists = useShellLists;
    }

    /* ---------- 入口 ---------- */

    public static List<string> StartMenuRoots()
    {
        var roots = new List<string>();
        foreach (var key in new[] { "APPDATA", "PROGRAMDATA" })
        {
            var baseDir = Environment.GetEnvironmentVariable(key);
            if (string.IsNullOrEmpty(baseDir)) continue;
            var root = Path.Combine(baseDir, "Microsoft", "Windows", "Start Menu", "Programs");
            if (Directory.Exists(root))
                roots.Add(Path.GetFullPath(root));
        }
        return roots;
    }

    /// <summary>全量扫描。注入参数仅供自测；生产用真根目录 + 真 COM 解析 + 真系统清单。</summary>
    public List<ScanCandidate> Scan(
        IEnumerable<string>? roots = null,
        Func<List<string>, Dictionary<string, string>>? resolver = null,
        List<KeyValuePair<string, string>>? startApps = null,
        List<KeyValuePair<string, string>>? appPaths = null)
    {
        var sourceRoots = (roots ?? _defaultRoots ?? StartMenuRoots()).Select(Path.GetFullPath).ToList();
        var shortcuts = new List<string>();
        foreach (var root in sourceRoots)
        {
            if (!Directory.Exists(root)) continue;
            shortcuts.AddRange(Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories));
        }
        shortcuts = shortcuts
            .Select(p => Path.GetFullPath(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var targets = (resolver ?? ResolveShortcutTargets)(shortcuts);

        var candidates = new List<ScanCandidate>();
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var shortcut in shortcuts)
        {
            var name = Path.GetFileNameWithoutExtension(shortcut).Trim();
            var folded = name.ToLowerInvariant();
            var parent = Path.GetDirectoryName(Path.GetFullPath(shortcut)) ?? "";
            var relativeParts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var root in sourceRoots)
            {
                if (IsRelativeTo(parent, root))
                    foreach (var part in Path.GetRelativePath(root, parent).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
                        if (part.Length > 0) relativeParts.Add(part.ToLowerInvariant());
            }
            var target = (targets.GetValueOrDefault(shortcut) ?? "").Trim().Trim('"');
            var targetName = Path.GetFileName(target).ToLowerInvariant();
            if (name.Length == 0 || name.StartsWith(".")
                || ExcludedNames.Any(word => folded.Contains(word, StringComparison.Ordinal))
                || relativeParts.Overlaps(ExcludedParts)
                || !string.Equals(Path.GetExtension(target), ".exe", StringComparison.OrdinalIgnoreCase)
                || targetName.StartsWith("unins", StringComparison.OrdinalIgnoreCase)
                || targetName.StartsWith("uninstall", StringComparison.OrdinalIgnoreCase)
                || ExcludedTargets.Contains(targetName)
                || !seenNames.Add(folded))
                continue;
            var scanId = ShortcutId(shortcut);
            candidates.Add(new ScanCandidate(scanId, name, Category(name), NativeIcon(scanId), shortcut, shortcut));
        }

        foreach (var (name0, appId) in startApps ?? (_useShellLists ? ListStartApps() : new()))
        {
            var name = name0.Trim();
            var id = appId.Trim();
            var folded = name.ToLowerInvariant();
            if (name.Length == 0 || seenNames.Contains(folded)
                || ExcludedNames.Any(word => folded.Contains(word, StringComparison.Ordinal))
                || !IsLaunchableStartApp(id))
                continue;
            var scanId = SourceId("start-app", id);
            var shellPath = $"shell:AppsFolder\\{id}";
            candidates.Add(new ScanCandidate(scanId, name, Category(name), NativeIcon(scanId), shellPath, shellPath));
            seenNames.Add(folded);
        }

        foreach (var (name0, executable) in appPaths ?? ListAppPaths())
        {
            var name = name0.Trim();
            var exePath = executable.Trim();
            var folded = name.ToLowerInvariant();
            if (name.Length == 0 || seenNames.Contains(folded)
                || !string.Equals(Path.GetExtension(exePath), ".exe", StringComparison.OrdinalIgnoreCase)
                || !File.Exists(exePath))
                continue;
            var scanId = SourceId("app-path", Path.GetFullPath(exePath));
            candidates.Add(new ScanCandidate(scanId, name, Category(name), NativeIcon(scanId), exePath, exePath));
            seenNames.Add(folded);
        }

        return candidates.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>带缓存的扫描（图标路由会高频调它；Python 无缓存每次全扫）。加锁防图标并发请求重复全扫。</summary>
    public List<ScanCandidate> ScanCached()
    {
        lock (_cacheLock)
        {
            if (_cache is not null && DateTimeOffset.UtcNow - _cacheAt < CacheTtl)
                return _cache;
            _cache = Scan();
            _cacheAt = DateTimeOffset.UtcNow;
            return _cache;
        }
    }

    /* ---------- 排查：--scan 打印扫描的分层结果（哪一层掉链子一眼可见） ---------- */

    /// <summary>逐层打印扫描：开始菜单根 → 快捷方式 → 目标解析 → 商店清单 → App Paths → 最终候选，
    /// 并把库里每个「有真实入口」的应用逐个对照扫描结果，直接点出谁会撞 409。
    /// 以前这类问题只能靠猜（清单被静默吞成空列表），所以把这条排查路径固化下来。</summary>
    public List<string> Diagnose()
    {
        var lines = new List<string>();
        var roots = (_defaultRoots ?? StartMenuRoots()).Select(Path.GetFullPath).ToList();
        lines.Add($"[开始菜单根] {roots.Count} 个（useShellLists={_useShellLists}）");
        var shortcuts = new List<string>();
        foreach (var root in roots)
        {
            var exists = Directory.Exists(root);
            var found = exists
                ? Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories).ToList()
                : new List<string>();
            lines.Add($"  {(exists ? "有" : "无")} {found.Count,4} 个 .lnk  {root}");
            shortcuts.AddRange(found);
        }
        var targets = ResolveShortcutTargets(shortcuts);
        lines.Add($"[快捷方式] {shortcuts.Count} 个，其中解析到目标的 {targets.Count} 个");

        var startApps = ListStartApps(out var error);
        lines.Add($"[商店清单] Get-StartApps 返回 {startApps.Count} 条"
            + (error is null ? "" : $"  *** 取不到：{error} ***"));
        lines.Add($"[App Paths] {ListAppPaths().Count} 条");

        var candidates = Scan();
        lines.Add($"[最终候选] {candidates.Count} 个");
        var byId = candidates.ToDictionary(c => c.Id, c => c, StringComparer.Ordinal);
        try
        {
            var db = new Db(ConsoleConfig.DbPath);
            db.Init();
            var rows = db.FetchAll("SELECT id,name,icon,source_key,launch_path FROM applications WHERE source_key<>''");
            lines.Add($"[库内带真实入口的应用] {rows.Count} 个");
            foreach (var row in rows)
            {
                var name = (row.GetValueOrDefault("name") as string) ?? "";
                var key = (row.GetValueOrDefault("source_key") as string) ?? "";
                var stored = (row.GetValueOrDefault("launch_path") as string) ?? "";
                if (!byId.TryGetValue(key, out var hit))
                    lines.Add($"  *** {name}: 扫描结果里没有 {key} → 运行这个项目会 409（入口已失效）");
                else if (!string.Equals(hit.LaunchPath, stored, StringComparison.Ordinal))
                    lines.Add($"  *** {name}: 入口路径变了\n        库内 {stored}\n        扫描 {hit.LaunchPath}");
                else
                    lines.Add($"  OK  {name}: 入口可复验");

                // 图标单独报一格：入口可复验 ≠ 图标出得来。历史上这两件事被混为一谈，
                // 结果是应用行全部渲染成破图，而 --scan 依然一路 OK。
                var iconSource = (row.GetValueOrDefault("icon") as string) ?? "";
                var iconFail = IconDiagnose(name, stored, iconSource, out var iconDetail);
                lines.Add(iconFail ? $"  *** {name}: {iconDetail}" : $"  OK  {name}: 图标可出图（{iconDetail}）");
            }

            // 图标路由的图源是「扫描候选」而不是库内 icon 字段，两处都可能掉链子：
            // 这里把每个候选的图源也过一遍抽图，直接定位到是哪一个 app 出不了图。
            var broken = new List<string>();
            foreach (var c in candidates)
            {
                var src = c.IconSource.Length > 0 ? c.IconSource : c.LaunchPath;
                if (src.Length == 0 || ExtractIconPng(src) is null) broken.Add($"{c.Name}（{c.Id}）");
            }
            lines.Add(broken.Count == 0
                ? $"[图标扫描] {candidates.Count} 个候选全部可出图"
                : $"[图标扫描] {broken.Count}/{candidates.Count} 个候选抽图失败：{string.Join("、", broken.Take(10))}"
                  + (broken.Count > 10 ? " …" : ""));
        }
        catch (Exception ex)
        {
            lines.Add($"[库内应用] 读取失败：{ex.GetType().Name}: {ex.Message}");
        }
        return lines;
    }

    /// <summary>诊断单个应用的图标可出图性（--scan 用）。返回 true 表示抽图失败。
    /// 同时把「icon 字段形态不对」单独点出来 —— 这是最隐蔽的一类：icon 既不是内置 SVG 键
    /// 也不是 native:{source_key}，前端就渲染成兜底方块，看着像「图标坏了」但其实是数据问题。</summary>
    private static bool IconDiagnose(string name, string launchPath, string iconField, out string detail)
    {
        if (iconField.Length == 0)
        {
            detail = "icon 字段为空 → 前端走兜底图标";
            return true;
        }
        if (!iconField.StartsWith("native:", StringComparison.Ordinal))
        {
            // 非 native: 会被前端当内置 SVG 键查表；查不到就退回 add 占位图
            detail = $"icon=\"{iconField}\" 不是 native:{{source_key}} 形态，"
                   + "前端会按内置图标键渲染（大概率渲染成占位方块）";
            return true;
        }
        if (launchPath.Length == 0)
        {
            detail = "没有 launch_path，无图源可抽";
            return true;
        }
        var png = ExtractIconPng(launchPath);
        if (png is null)
        {
            detail = $"从 {launchPath} 抽图失败（SHGetFileInfoW 取不到图标）";
            return true;
        }
        detail = $"{png.Length}B PNG";
        return false;
    }

    /* ---------- 分类 / ID / 过滤（与 Python 版逐条对齐） ---------- */

    public static string Category(string name)
    {
        var value = name.ToLowerInvariant();
        (string Category, string[] Words)[] groups =
        {
            ("开发", new[] { "code", "visual studio", "pycharm", "intellij", "git", "docker", "postman", "terminal", "powershell", "autohotkey", "python" }),
            ("浏览", new[] { "chrome", "edge", "firefox", "brave", "browser", "浏览器", "夸克" }),
            ("设计", new[] { "figma", "photoshop", "illustrator", "blender", "adobe", "canva", "pixso" }),
            ("娱乐", new[] { "steam", "epic", "game", "游戏", "音乐", "bilibili", "哔哩", "抖音", "spotify", "wegame" }),
        };
        foreach (var (category, words) in groups)
            if (words.Any(word => value.Contains(word, StringComparison.Ordinal)))
                return category;
        return "效率";
    }

    public static string ShortcutId(string path) =>
        "scan-" + Hash(Resolve(path).Replace('\\', '/').ToLowerInvariant());

    public static string SourceId(string kind, string value) =>
        "scan-" + Hash($"{kind}:{value}".Replace('\\', '/').ToLowerInvariant());

    private static string Hash(string text)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
        var hex = Convert.ToHexString(bytes).ToLowerInvariant();
        return hex[..20];
    }

    /// <summary>Path.resolve() 的近似：取全路径。不存在时不报错（Python resolve 默认非 strict）。</summary>
    private static string Resolve(string path) => Path.GetFullPath(path);

    private static string NativeIcon(string scanId) => $"native:{scanId}";

    private static bool IsLaunchableStartApp(string appId)
    {
        var value = appId.Trim();
        if (value.Length == 0) return false;
        var lower = value.ToLowerInvariant();
        if (lower.StartsWith("http:") || lower.StartsWith("https:")
            || lower.StartsWith("microsoft.autogenerated."))
            return false;
        if (Regex.IsMatch(value, @"^[a-z]:\\", RegexOptions.IgnoreCase))
            return string.Equals(Path.GetExtension(value), ".exe", StringComparison.OrdinalIgnoreCase);
        return !value.StartsWith('\\') && !value.StartsWith('/');
    }

    private static bool IsRelativeTo(string path, string root)
    {
        var normPath = path.Replace('/', '\\').TrimEnd('\\');
        var normRoot = root.Replace('/', '\\').TrimEnd('\\');
        if (normPath.Length < normRoot.Length) return false;
        if (!normPath.StartsWith(normRoot, StringComparison.OrdinalIgnoreCase)) return false;
        return normPath.Length == normRoot.Length || normPath[normRoot.Length] == '\\';
    }

    /* ---------- 快捷方式解析：进程内 WScript.Shell COM（替代 Python 的 PowerShell 子进程） ---------- */

    public static Dictionary<string, string> ResolveShortcutTargets(List<string> paths)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (paths.Count == 0) return result;
        if (!OperatingSystem.IsWindows())
            throw new ApplicationScanError("本机应用扫描仅支持 Windows");
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null)
            throw new ApplicationScanError("无法读取 Windows 应用快捷方式：WScript.Shell 不可用");
        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            foreach (var path in paths)
            {
                object? link = null;
                try
                {
                    link = shellType.InvokeMember("CreateShortcut",
                        System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { path });
                    var target = (string)(link!.GetType().InvokeMember("TargetPath",
                        System.Reflection.BindingFlags.GetProperty, null, link, null) ?? "");
                    result[path] = target;
                }
                catch { /* 单个坏快捷方式跳过，与 Python 版一致 */ }
                finally
                {
                    if (link is not null) Marshal.ReleaseComObject(link);
                }
            }
        }
        catch (Exception ex) when (ex is COMException or System.Reflection.TargetInvocationException)
        {
            throw new ApplicationScanError($"无法读取 Windows 应用快捷方式：{ex.Message}");
        }
        finally
        {
            if (shell is not null) Marshal.ReleaseComObject(shell);
        }
        return result;
    }

    /* ---------- UWP / 商店应用清单：沿用 PowerShell Get-StartApps（一次性扫描动作，非热路径） ---------- */

    public static List<KeyValuePair<string, string>> ListStartApps() => ListStartApps(out _);

    /// <summary>取商店/UWP 清单（Get-StartApps）。**任何失败都必须留下原因**：
    /// 以前这里是 `catch { return new(); }` 一律静默返回空清单，后果是商店应用从扫描结果里无声消失——
    /// 用户看到的是「添加应用里搜不到这些应用」，而已绑定它们的项目在运行时会撞
    /// `ValidateLaunch` 的「入口已失效」(409)，排查时完全看不出真正原因是「清单没取到」。</summary>
    public static List<KeyValuePair<string, string>> ListStartApps(out string? error)
    {
        error = null;
        if (!OperatingSystem.IsWindows()) { error = "非 Windows 平台"; return new(); }
        const string script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n" +
            "Get-StartApps | Select-Object @{n='name';e={$_.Name}},@{n='app_id';e={$_.AppID}} | ConvertTo-Json -Compress";
        string stdout;
        try
        {
            // 脚本含换行，裸传命令行不可靠：走 -EncodedCommand（UTF-16LE base64）
            var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            using var proc = new System.Diagnostics.Process();
            proc.StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -NonInteractive -EncodedCommand " + encoded,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            proc.Start();
            // 必须先并发把两个管道读走，再等退出。这条命令会往 stdout 写 17KB 上下（本机 203 条清单），
            // stderr 还有 PowerShell 的 CLIXML 进度流，而匿名管道缓冲区只有 4KB：
            // 旧写法「先 WaitForExit(15000) 再 ReadToEnd()」会让子进程卡在自己那次写操作上永不退出，
            // 于是必然超时、清单被判失败。2026-09-25 实测：同一命令用 Python 的 communicate（并发读）
            // 0.74s 就返回 203 条，而 C# 这条路上永远 15s 超时 → 商店应用静默消失。
            var stdoutTask = proc.StandardOutput.ReadToEndAsync();
            var stderrTask = proc.StandardError.ReadToEndAsync();
            if (!proc.WaitForExit(15000))
            {
                try { proc.Kill(true); } catch { }
                error = "PowerShell 15 秒未退出（已终止）";
                ShellLog.Log("[scan] Get-StartApps 取不到清单：" + error);
                return new();
            }
            if (proc.ExitCode != 0)
            {
                error = $"PowerShell 退出码 {proc.ExitCode}";
                ShellLog.Log("[scan] Get-StartApps 取不到清单：" + error);
                return new();
            }
            stdout = stdoutTask.GetAwaiter().GetResult();
            _ = stderrTask.GetAwaiter().GetResult();   // 读走即可，PowerShell 的进度流不进错误处理
        }
        catch (Exception ex)
        {
            error = $"{ex.GetType().Name}: {ex.Message}";
            ShellLog.Log("[scan] Get-StartApps 起不来：" + error);
            return new();
        }
        try
        {
            var payload = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(
                string.IsNullOrWhiteSpace(stdout) ? "[]" : stdout);
            if (payload.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                var single = Pair(payload);
                ShellLog.Log($"[scan] Get-StartApps 清单 {single.Count} 条");
                return single;
            }
            var rows = new List<KeyValuePair<string, string>>();
            foreach (var item in payload.EnumerateArray()) rows.AddRange(Pair(item));
            ShellLog.Log($"[scan] Get-StartApps 清单 {rows.Count} 条");
            return rows;
        }
        catch (System.Text.Json.JsonException ex)
        {
            error = $"JSON 解析失败：{ex.Message}";
            ShellLog.Log("[scan] Get-StartApps 清单解析失败：" + error);
            return new();
        }

        static List<KeyValuePair<string, string>> Pair(System.Text.Json.JsonElement item)
        {
            var rows = new List<KeyValuePair<string, string>>();
            if (item.ValueKind != System.Text.Json.JsonValueKind.Object) return rows;
            var name = item.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
            var appId = item.TryGetProperty("app_id", out var a) ? a.GetString() ?? "" : "";
            rows.Add(new(name.Trim(), appId.Trim()));
            return rows;
        }
    }

    /* ---------- App Paths 注册表清单 ---------- */

    public static List<KeyValuePair<string, string>> ListAppPaths()
    {
        if (!OperatingSystem.IsWindows()) return new();
        const string root = @"Software\Microsoft\Windows\CurrentVersion\App Paths";
        (Microsoft.Win32.RegistryHive Hive, Microsoft.Win32.RegistryView View)[] sources =
        {
            (Microsoft.Win32.RegistryHive.CurrentUser, Microsoft.Win32.RegistryView.Default),
            (Microsoft.Win32.RegistryHive.LocalMachine, Microsoft.Win32.RegistryView.Registry64),
            (Microsoft.Win32.RegistryHive.LocalMachine, Microsoft.Win32.RegistryView.Registry32),
        };
        var rows = new List<KeyValuePair<string, string>>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (hive, view) in sources)
        {
            Microsoft.Win32.RegistryKey? baseKey = null;
            try
            {
                baseKey = Microsoft.Win32.RegistryKey.OpenBaseKey(hive, view).OpenSubKey(root);
                if (baseKey is null) continue;
                foreach (var subName in baseKey.GetSubKeyNames())
                {
                    string? rawPath = null;
                    try
                    {
                        using var sub = baseKey.OpenSubKey(subName);
                        rawPath = sub?.GetValue(null) as string;
                    }
                    catch { continue; }
                    var pathText = (rawPath ?? "").Trim().Trim('"');
                    if (Path.GetExtension(pathText).ToLowerInvariant() != ".exe"
                        || !File.Exists(pathText)
                        || !seen.Add(pathText.ToLowerInvariant()))
                        continue;
                    rows.Add(new(Path.GetFileNameWithoutExtension(pathText), pathText));
                }
            }
            catch { continue; }
            finally { baseKey?.Dispose(); }
        }
        return rows;
    }

    /* ---------- 图标提取：SHGetFileInfoW + DrawIconEx + 手写 PNG 编码（与 Python 版同构） ---------- */

    public static byte[]? ExtractIconPng(string source, int size = 32)
    {
        if (!OperatingSystem.IsWindows() || string.IsNullOrEmpty(source)) return null;
        try { return ExtractIconPngWindows(source, size); }
        catch { return null; }
    }

    private static byte[]? ExtractIconPngWindows(string source, int size)
    {
        var info = new SHFILEINFOW();
        const uint SHGFI_ICON = 0x00000100, SHGFI_LARGEICON = 0x00000000;
        var ok = Native.SHGetFileInfoW(source, 0, ref info, (uint)Marshal.SizeOf<SHFILEINFOW>(),
            SHGFI_ICON | SHGFI_LARGEICON);
        if (ok == IntPtr.Zero || info.hIcon == IntPtr.Zero) return null;

        IntPtr screenDc = IntPtr.Zero, memDc = IntPtr.Zero, bitmap = IntPtr.Zero, oldBitmap = IntPtr.Zero;
        IntPtr bits = IntPtr.Zero;
        try
        {
            screenDc = Native.GetDC(IntPtr.Zero);
            memDc = Native.CreateCompatibleDC(screenDc);
            var bmi = new Native.BITMAPINFO();
            bmi.bmiHeader.biSize = (uint)Marshal.SizeOf<Native.BITMAPINFOHEADER>();
            bmi.bmiHeader.biWidth = size;
            bmi.bmiHeader.biHeight = -size;   // top-down
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bitmap = Native.CreateDIBSection(memDc, ref bmi, 0, out bits, IntPtr.Zero, 0);
            if (memDc == IntPtr.Zero || bitmap == IntPtr.Zero || bits == IntPtr.Zero) return null;
            oldBitmap = Native.SelectObject(memDc, bitmap);
            // DI_NORMAL = 0x0003（图像 + 掩码）
            if (!Native.DrawIconEx(memDc, 0, 0, info.hIcon, size, size, 0, IntPtr.Zero, 0x0003))
                return null;

            var bgra = new byte[size * size * 4];
            Marshal.Copy(bits, bgra, 0, bgra.Length);
            var rgba = new byte[size * size * 4];
            for (var i = 0; i < bgra.Length; i += 4)
            {
                rgba[i] = bgra[i + 2];      // R
                rgba[i + 1] = bgra[i + 1];  // G
                rgba[i + 2] = bgra[i];      // B
                rgba[i + 3] = bgra[i + 3];  // A
            }

            // PNG：每行前置 filter byte 0x00，zlib 压缩
            var raw = new byte[size * (size * 4 + 1)];
            for (var row = 0; row < size; row++)
            {
                raw[row * (size * 4 + 1)] = 0;
                Buffer.BlockCopy(rgba, row * size * 4, raw, row * (size * 4 + 1) + 1, size * 4);
            }
            return PngEncode(raw, size, size);
        }
        finally
        {
            if (oldBitmap != IntPtr.Zero) Native.SelectObject(memDc, oldBitmap);
            if (bitmap != IntPtr.Zero) Native.DeleteObject(bitmap);
            if (memDc != IntPtr.Zero) Native.DeleteDC(memDc);
            if (screenDc != IntPtr.Zero) Native.ReleaseDC(IntPtr.Zero, screenDc);
            Native.DestroyIcon(info.hIcon);
        }
    }

    private static byte[] PngEncode(byte[] filtered, int width, int height)
    {
        byte[] Chunk(string kind, byte[] data)
        {
            var chunk = new byte[12 + data.Length];
            WriteBigEndian(chunk, 0, data.Length);
            var kindBytes = Encoding.ASCII.GetBytes(kind);
            Buffer.BlockCopy(kindBytes, 0, chunk, 4, 4);
            Buffer.BlockCopy(data, 0, chunk, 8, data.Length);
            var crcInput = new byte[4 + data.Length];
            Buffer.BlockCopy(kindBytes, 0, crcInput, 0, 4);
            Buffer.BlockCopy(data, 0, crcInput, 4, data.Length);
            WriteBigEndian(chunk, 8 + data.Length, Crc32(crcInput));
            return chunk;
        }

        using var zlib = new MemoryStream();
        zlib.WriteByte(0x78);                       // zlib 头（CMF/FLG，默认压缩级别即可）
        zlib.WriteByte(0x9C);
        using (var deflate = new System.IO.Compression.DeflateStream(
                   zlib, System.IO.Compression.CompressionLevel.Optimal, leaveOpen: true))
            deflate.Write(filtered, 0, filtered.Length);
        WriteBigEndian(zlib, Adler32(filtered));    // zlib 流尾的 adler32

        using var png = new MemoryStream();
        png.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }); // PNG 签名
        var ihdr = new byte[13];
        WriteBigEndian(ihdr, 0, width);
        WriteBigEndian(ihdr, 4, height);
        ihdr[8] = 8;   // bit depth
        ihdr[9] = 6;   // color type RGBA
        png.Write(Chunk("IHDR", ihdr));
        png.Write(Chunk("IDAT", zlib.ToArray()));
        png.Write(Chunk("IEND", Array.Empty<byte>()));
        return png.ToArray();
    }

    private static void WriteBigEndian(MemoryStream stream, int value)
    {
        stream.WriteByte((byte)(value >> 24));
        stream.WriteByte((byte)(value >> 16));
        stream.WriteByte((byte)(value >> 8));
        stream.WriteByte((byte)value);
    }

    private static void WriteBigEndian(byte[] buf, int offset, int value)
    {
        buf[offset] = (byte)(value >> 24);
        buf[offset + 1] = (byte)(value >> 16);
        buf[offset + 2] = (byte)(value >> 8);
        buf[offset + 3] = (byte)value;
    }

    private static int Crc32(byte[] data)
    {
        const uint polynomial = 0xEDB88320;
        var table = new uint[256];
        for (var i = 0; i < 256; i++)
        {
            var entry = (uint)i;
            for (var bit = 0; bit < 8; bit++)
                entry = (entry & 1) != 0 ? polynomial ^ (entry >> 1) : entry >> 1;
            table[i] = entry;
        }
        uint crc = 0xFFFFFFFF;
        foreach (var b in data) crc = table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return (int)(crc ^ 0xFFFFFFFF);
    }

    private static int Adler32(byte[] data)
    {
        uint a = 1, b = 0;
        foreach (var t in data) { a = (a + t) % 65521; b = (b + a) % 65521; }
        return (int)((b << 16) | a);
    }

    /* ---------- Win32 导入（W 结尾一律 CharSet.Unicode，一期托盘轮的教训） ---------- */

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFOW
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
    }

    private static class Native
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr SHGetFileInfoW(string path, uint attributes, ref SHFILEINFOW info,
            uint sizeOfFileinfo, uint flags);

        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr hdc,
            ref BITMAPINFO bitmapInfo, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("user32.dll")] public static extern bool DrawIconEx(IntPtr hdc, int x, int y,
            IntPtr icon, int width, int height, uint step, IntPtr brush, uint flags);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFOHEADER
        {
            public uint biSize;
            public int biWidth;
            public int biHeight;
            public ushort biPlanes;
            public ushort biBitCount;
            public uint biCompression;
            public uint biSizeImage;
            public int biXPelsPerMeter;
            public int biYPelsPerMeter;
            public uint biClrUsed;
            public uint biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFO
        {
            public BITMAPINFOHEADER bmiHeader;
            public uint bmiColors;
        }
    }
}
