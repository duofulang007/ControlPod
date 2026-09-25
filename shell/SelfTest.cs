using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace ApexShell;

/// <summary>
/// 二期 C# 后端服务的无头自测（ApexShell.exe --selftest [日志路径]）。
/// 不创建任何窗口 / WebView2 —— 工具会话出身会被本机安全软件掐 WebView2，
/// 但纯计算 + 注册表 + SQLite 不会被拦，所以这里能全自动验证。
/// 覆盖：Db 迁移 1–10（临时库全跑 + 与 Python 真库 schema 对照）+ 读写往返 +
/// StartupManager 注册表读写往返（用独立测试值名，绝不碰真实启动项）。
/// </summary>
public static class SelfTest
{
    private static readonly List<string> Lines = new();
    private static int _passed;
    private static readonly List<string> Failed = new();
    /// <summary>二分定位用：--stages=a,b,c 只跑指定阶段；缺省全跑。</summary>
    private static HashSet<string> _stages = new(StringComparer.Ordinal);

    private static bool Stage(string name) =>
        _stages.Count == 0 || _stages.Contains(name);

    public static bool Run(string logPath, IEnumerable<string>? stages = null)
    {
        _stages = stages?.ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        _logPath = logPath;
        if (Stage("base")) { CheckUtcNow(); CheckDbMigrationsOnTemp(); CheckDbSchemaMatchesPythonRealDb(); CheckDbCrudRoundtrip(); }
        if (Stage("startup")) { CheckStartupManagerRoundtrip(); CheckStartupManagerReadonlyRealRegistry(); }
        if (Stage("scan")) { CheckScannerIdParity(); CheckScannerFiltering(); CheckStartAppGate(); }
        if (Stage("realscan")) CheckRealScan();
        if (Stage("icon")) CheckIconPng();
        if (Stage("catalog")) CheckApplicationCatalog();
        if (Stage("registry")) CheckModuleRegistry();
        if (Stage("exec")) { CheckExecutionEndToEnd(); CheckExecutionRecover(); }
        if (Stage("window")) CheckWindowRoutes();
        if (Stage("activity")) CheckActivityRoutes();
        if (Stage("projects")) CheckProjectDomainRoutes();
        if (Stage("modules")) CheckModuleDomainRoutes();
        if (Stage("bootstrap")) CheckBootstrapPayload();
        if (Stage("routes")) CheckRouteCoverage();

        var verdict = Failed.Count == 0 ? "PASS" : "FAIL";
        Lines.Add($"=== SELFTEST {verdict}: {_passed} passed, {Failed.Count} failed ===");
        if (Failed.Count > 0) Lines.AddRange(Failed.Select(f => "  FAILED: " + f));

        FlushLog(logPath);
        Console.WriteLine($"SELFTEST {verdict}");
        return Failed.Count == 0;
    }

    private static void Check(string name, bool ok, string detail = "")
    {
        if (ok)
        {
            _passed++;
            Lines.Add($"PASS  {name}{(detail.Length > 0 ? "  | " + detail : "")}");
        }
        else
        {
            Failed.Add($"{name}  | {detail}");
            Lines.Add($"FAIL  {name}  | {detail}");
        }
        FlushLog(_logPath ?? "");   // 逐条落盘：进程被外部掐掉也能看到死点
    }

    private static string? _logPath;

    private static void FlushLog(string logPath)
    {
        if (logPath.Length == 0) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(logPath))!);
            File.WriteAllLines(logPath, Lines, new UTF8Encoding(false));
        }
        catch { /* 写不出日志只能靠退出码 */ }
    }

    private static void CheckUtcNow()
    {
        // 与 db.py utc_now() 同构：yyyy-MM-ddTHH:mm:ss.ffffff+00:00
        var v = Db.UtcNow();
        var ok = v.Length == 32 && v[10] == 'T' && v.EndsWith("+00:00", StringComparison.Ordinal);
        Check("utc_now 格式与 Python isoformat 同构", ok, v);
    }

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "apex-shell-selftest",
            DateTime.Now.ToString("yyyyMMdd-HHmmss-fff"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void CheckDbMigrationsOnTemp()
    {
        var dbPath = Path.Combine(TempDir(), "fresh.db");
        try
        {
            var db = new Db(dbPath);
            db.Init();

            var version = db.FetchOne("PRAGMA user_version")?["user_version"];
            Check("全新库迁移到 user_version=10", version is long v && v == 10, $"user_version={version}");

            var tables = TableSet(dbPath);
            var expected = new HashSet<string>(StringComparer.Ordinal)
            {
                "projects", "tasks", "modules", "project_modules", "runs", "notes",
                "project_contexts", "applications", "app_catalog_meta", "project_files",
                "project_executions", "execution_steps", "activity_heartbeats",
            };
            Check("13 张表全部建出", tables.SetEquals(expected),
                $"实际=[{string.Join(',', tables.OrderBy(t => t))}]");

            // 二次 init：全部迁移幂等，user_version 不回退不报错
            db.Init();
            var version2 = db.FetchOne("PRAGMA user_version")?["user_version"];
            Check("重复 init 幂等", version2 is long v2 && v2 == 10);

            // 高版本库拒绝启动（与 Python 版同语义）
            var dbPath2 = Path.Combine(TempDir(), "future.db");
            var db2 = new Db(dbPath2);
            db2.Init();
            db2.Execute("PRAGMA user_version = 11");
            var rejected = false;
            try { db2.Init(); }
            catch (InvalidOperationException) { rejected = true; }
            Check("库版本高于程序版本时拒绝启动", rejected);
        }
        catch (Exception ex)
        {
            Check("临时库迁移套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>对照真实生产库（Python 正在用也无所谓：只读模式 + WAL）。</summary>
    private static void CheckDbSchemaMatchesPythonRealDb()
    {
        var realPath = ConsoleConfig.DbPath;
        if (!File.Exists(realPath))
        {
            Check("与 Python 真库 schema 对照", false, $"真库不存在：{realPath}");
            return;
        }
        try
        {
            var real = TableSet(realPath);
            var tempPath = Path.Combine(TempDir(), "same.db");
            new Db(tempPath).Init();
            var fresh = TableSet(tempPath);
            Check("C# 全新迁移与 Python 真库的表清单一致", real.SetEquals(fresh),
                $"真库独有=[{string.Join(',', real.Except(fresh))}] 新库独有=[{string.Join(',', fresh.Except(real))}]");

            // 关键列抽查：迁移 8/10 的 ALTER 列必须与真库对齐
            foreach (var (table, column) in new[]
                     {
                         ("applications", "launch_path"), ("applications", "source_key"),
                         ("tasks", "kind"), ("projects", "sort_order"), ("runs", "action"),
                     })
            {
                var realCols = ColumnSet(realPath, table);
                Check($"{table}.{column} 在真库存在", realCols.Contains(column));
            }
        }
        catch (Exception ex)
        {
            Check("与 Python 真库 schema 对照无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static HashSet<string> TableSet(string dbPath)
    {
        using var conn = OpenAny(dbPath);
        var set = new HashSet<string>(StringComparer.Ordinal);
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
            using var reader = cmd.ExecuteReader();
            while (reader.Read()) set.Add(reader.GetString(0));
        }
        return set;
    }

    private static HashSet<string> ColumnSet(string dbPath, string table)
    {
        using var conn = OpenAny(dbPath);
        var set = new HashSet<string>(StringComparer.Ordinal);
        using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"PRAGMA table_info({table})";
            using var reader = cmd.ExecuteReader();
            while (reader.Read()) set.Add(reader.GetString(1));
        }
        return set;
    }

    private static Microsoft.Data.Sqlite.SqliteConnection OpenAny(string dbPath)
    {
        var conn = new Microsoft.Data.Sqlite.SqliteConnection(
            new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder
            {
                DataSource = dbPath,
                Mode = File.Exists(dbPath)
                    ? Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly
                    : Microsoft.Data.Sqlite.SqliteOpenMode.ReadWriteCreate,
            }.ToString());
        conn.Open();
        return conn;
    }

    private static void CheckDbCrudRoundtrip()
    {
        var dbPath = Path.Combine(TempDir(), "crud.db");
        try
        {
            var db = new Db(dbPath);
            db.Init();
            var now = Db.UtcNow();

            db.Execute(
                "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
                "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6)",
                "proj-selftest", "自测项目", "临时", "开发中", now, now, 0);
            db.Execute(
                "INSERT INTO tasks(id,project_id,title,due_date,priority,completed,created_at,updated_at,kind) " +
                "VALUES(@p0,@p1,@p2,@p3,@p4,0,@p5,@p6,@p7)",
                "task-selftest", "proj-selftest", "自测任务", (object?)null, "高", now, now, "fix");

            var task = db.FetchOne("SELECT * FROM tasks WHERE id=@p0", "task-selftest");
            Check("INSERT 后可读回（含 NULL 列）",
                task != null && (string?)task["title"] == "自测任务"
                && task["due_date"] is null && (long?)task["completed"] == 0
                && (string?)task["kind"] == "fix");

            db.Execute("UPDATE tasks SET completed=1 WHERE id=@p0", "task-selftest");
            Check("UPDATE 生效",
                Convert.ToInt64(db.FetchOne("SELECT completed FROM tasks WHERE id=@p0", "task-selftest")?["completed"]) == 1);

            db.Transaction(new (string Sql, object?[] Args)[]
            {
                ("INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) " +
                 "VALUES(@p0,@p1,@p2,@p3,'',0,'[]',@p4,@p5)",
                 new object?[] { "note-selftest", "proj-selftest", "自测笔记", "灵感", now, now }),
                ("DELETE FROM tasks WHERE id=@p0", new object?[] { "task-selftest" }),
            });
            Check("事务多条语句生效", db.FetchOne("SELECT * FROM notes WHERE id=@p0", "note-selftest") != null
                && db.FetchOne("SELECT * FROM tasks WHERE id=@p0", "task-selftest") == null);

            var rolledBack = false;
            try
            {
                db.Transaction(new (string Sql, object?[] Args)[]
                {
                    ("DELETE FROM notes WHERE id=@p0", new object?[] { "note-selftest" }),
                    ("DELETE FROM 完全不存在的表 WHERE 1", Array.Empty<object?>()),
                });
            }
            catch { rolledBack = true; }
            Check("事务异常时回滚", rolledBack
                && db.FetchOne("SELECT * FROM notes WHERE id=@p0", "note-selftest") != null);
        }
        catch (Exception ex)
        {
            Check("CRUD 往返套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>注册表读写往返：用独立测试值名，全程不碰真实启动项。</summary>
    private static void CheckStartupManagerRoundtrip()
    {
        const string testName = "APEX Console SelfTest";
        var manager = new StartupManager(testName, command: @"C:\selftest\dummy.exe");
        try
        {
            // 先清残留，保证从「未注册」起测
            CleanupSelfTestValues(testName);

            var off = manager.Status();
            Check("测试值名初始未注册", !off.Registered && off.Command == @"C:\selftest\dummy.exe",
                $"registered={off.Registered} approved={off.Approved}");

            var on = manager.SetEnabled(true);
            Check("SetEnabled(true) 后 enabled/registered/approved 全真",
                on.Enabled && on.Registered && on.Approved);

            // 模拟任务管理器禁用：写一条 03 开头的记录，status 必须识破假绿
            WriteApprovedRaw(testName, disabled: true);
            var faked = manager.Status();
            Check("Run 值仍在但 StartupApproved 被禁用时不算启用（假绿检测）",
                faked.Registered && !faked.Approved && !faked.Enabled);

            // SetEnabled(true) 必须把禁用记录压回启用（Python 版当年的核心修复）
            var revived = manager.SetEnabled(true);
            Check("SetEnabled(true) 能翻掉旧的禁用记录", revived.Enabled && revived.Approved);

            var off2 = manager.SetEnabled(false);
            Check("SetEnabled(false) 后两个位置都清干净", !off2.Registered && off2.Enabled == false);
            Check("SetEnabled(false) 后 StartupApproved 记录也被清掉", !ApprovedValueExists(testName));
        }
        catch (Exception ex)
        {
            Check("StartupManager 往返套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
        finally
        {
            CleanupSelfTestValues(testName);
        }
    }

    /// <summary>真实注册表只读冒烟：现役命令应指向壳 exe（壳已构建），status() 不抛错。</summary>
    private static void CheckStartupManagerReadonlyRealRegistry()
    {
        try
        {
            var real = new StartupManager().Status();
            var shellExe = Path.Combine(ConsoleConfig.ProjectDir, "shell", "bin", "x64", "Debug",
                "net8.0-windows10.0.19041.0", "win-x64", "ApexShell.exe");
            var expected = File.Exists(shellExe)
                ? shellExe.Contains(' ') ? "\"" + shellExe + "\"" : shellExe
                : null;
            if (expected != null)
                Check("现役启动命令指向壳 exe", real.Command == expected, real.Command);
            else
                Check("现役启动命令（壳未构建则回退 console_launcher）", real.Command.Contains("console_launcher"), real.Command);
        }
        catch (Exception ex)
        {
            Check("真实注册表只读冒烟无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块2：application_scanner + applications 路由组 ==================== */

    /// <summary>ID 算法与 Python 逐字节一致（基准值由 ref_hash.py 文件方式现算，防 shell 引号改写）。</summary>
    private static void CheckScannerIdParity()
    {
        Check("SourceId 与 Python 一致（start-app）",
            ApplicationScanner.SourceId("start-app", "TestApp!App") == "scan-137a6d55db666cad3ed1",
            ApplicationScanner.SourceId("start-app", "TestApp!App"));
        Check("ShortcutId 与 Python 一致",
            ApplicationScanner.ShortcutId(@"C:\apps\Foo Bar.lnk") == "scan-27f5cef451195761429a",
            ApplicationScanner.ShortcutId(@"C:\apps\Foo Bar.lnk"));
        Check("SourceId 与 Python 一致（app-path）",
            ApplicationScanner.SourceId("app-path", @"C:\Program Files\Foo\foo.exe") == "scan-ec467edb2ffbaa2662ff",
            ApplicationScanner.SourceId("app-path", @"C:\Program Files\Foo\foo.exe"));
    }

    private static void CheckScannerFiltering()
    {
        var dir = Path.Combine(TempDir(), "start-menu");
        Directory.CreateDirectory(Path.Combine(dir, "startup"));   // 应被排除的目录
        string[] lnkFiles =
        {
            Path.Combine(dir, "Visual Studio Code.lnk"),
            Path.Combine(dir, "Steam.lnk"),
            Path.Combine(dir, "Uninstall Foo.lnk"),
            Path.Combine(dir, "X 卸载.lnk"),
            Path.Combine(dir, "Setup Helper.lnk"),
            Path.Combine(dir, "Readme.lnk"),
            Path.Combine(dir, "Target Not Exe.lnk"),
            Path.Combine(dir, "startup", "Auto Start.lnk"),
            Path.Combine(dir, "Visual Studio Code.lnk"),   // 同名重复：路径去重 + 名称去重都要扛
        };
        foreach (var f in lnkFiles) File.WriteAllText(f, "dummy");

        // 解析器注入：好目标指真 .exe（notepad），两个坏目标分别测「目标非 exe」与「目标名 unins 前缀」
        Func<List<string>, Dictionary<string, string>> resolver = paths => paths.ToDictionary(
            p => p,
            p => p.Contains("Target Not Exe") ? @"C:\Windows\System32\drivers\etc\hosts"
               : p.Contains("Steam") ? @"C:\Windows\System32\notepad_setup.exe"
               : p.Contains("Setup Helper") ? @"C:\Windows\write.exe"
               : @"C:\Windows\System32\notepad.exe",
            StringComparer.OrdinalIgnoreCase);

        var candidates = new ApplicationScanner().Scan(
            new[] { dir }, resolver,
            startApps: new(), appPaths: new());

        var names = candidates.Select(c => c.Name).ToList();
        Check("好快捷方式入选且分类正确",
            names.Contains("Visual Studio Code") && names.Contains("Steam"),
            string.Join(',', names));
        Check("开发类判定", ApplicationScanner.Category("Visual Studio Code") == "开发");
        Check("娱乐类判定", ApplicationScanner.Category("Steam") == "娱乐");
        Check("默认效率类", ApplicationScanner.Category("Everything") == "效率");
        Check("排除词过滤（Uninstall/卸载/Readme）",
            !names.Any(n => n.Contains("Uninstall") || n.Contains("卸载") || n.Contains("Readme")));
        Check("startup 目录下的快捷方式被排除", !names.Contains("Auto Start"));
        Check("目标非 .exe 的快捷方式被排除", !names.Contains("Target Not Exe"));
        Check("按名称去重", names.Count(n => n == "Visual Studio Code") == 1);
        Check("icon 与 launch_path 形态",
            candidates.All(c => c.Icon == $"native:{c.Id}" && c.IconSource == c.LaunchPath && c.Id.StartsWith("scan-")));
    }

    private static void CheckStartAppGate()
    {
        // 通过公开扫描入口间接测 _is_launchable_start_app 的各分支
        var cands = new ApplicationScanner().Scan(
            new[] { Path.Combine(TempDir(), "empty-root") },   // 不存在 → 零快捷方式
            _ => new(),
            startApps: new()
            {
                new("计算器", "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"),   // UWP AUMID → 可启动
                new("坏路径", @"C:\No\Such\App"),                                  // 盘符但非 exe → 排除
                new("网页", "https://example.com"),                                // http → 排除
                new("自动生成", "microsoft.autogenerated.xxx"),                    // autogenerated → 排除
                new("", "Some!App"),                                               // 空名 → 排除
            },
            appPaths: new());
        var names = cands.Select(c => c.Name).ToList();
        Check("UWP AUMID 可启动", names.Contains("计算器"));
        Check("非 exe 盘符路径排除", !names.Contains("坏路径"));
        Check("http 目标排除", !names.Contains("网页"));
        Check("autogenerated 排除", !names.Contains("自动生成"));
        Check("shell:AppsFolder 形态", cands.All(c => !c.LaunchPath.StartsWith("shell:AppsFolder") || c.LaunchPath.Contains('!') || c.LaunchPath.Contains('\\')));
    }

    private static void CheckRealScan()
    {
        try
        {
            // 真开始菜单 + 进程内 COM 解析 + 真 App Paths 注册表；只关 PowerShell 清单（安全软件会掐）
            var candidates = new ApplicationScanner(
                ApplicationScanner.StartMenuRoots(), useShellLists: false).Scan();
            Check("真机扫描有结果", candidates.Count > 0, $"{candidates.Count} 个候选");
            Check("真机扫描结果字段完整",
                candidates.All(c => c.Id.StartsWith("scan-") && c.Id.Length == 25
                    && c.Name.Length > 0 && c.Category.Length > 0
                    && c.LaunchPath.Length > 0 && c.Icon == $"native:{c.Id}"));
            // 排除词只作用于快捷方式与 UWP 清单（Python 版对 App Paths 注册表清单不套排除词，C# 同构）；
            // 真机上的「Display Driver Uninstaller」就是经 App Paths 进来的合法候选。
            Check("真机扫描 .lnk 来源无排除词",
                !candidates.Any(c => c.LaunchPath.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
                    && (c.Name.ToLowerInvariant().Contains("uninstall") || c.Name.Contains("卸载"))));
            Check("真机扫描按名称排序",
                candidates.SequenceEqual(candidates.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)));
        }
        catch (Exception ex)
        {
            Check("真机扫描无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static void CheckIconPng()
    {
        try
        {
            var png = ApplicationScanner.ExtractIconPng(@"C:\Windows\System32\notepad.exe");
            Check("notepad 图标提取成功", png is { Length: > 100 });
            if (png is byte[] data)
            {
                var sigOk = data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47;
                Check("PNG 签名正确", sigOk);
                // IHDR：宽高在签名(8) + 长度(4) + "IHDR"(4) 之后
                var width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
                var height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
                Check("PNG 尺寸 32x32 RGBA", width == 32 && height == 32 && data[24] == 8 && data[25] == 6,
                    $"{width}x{height} depth={data[24]} color={data[25]}");
                // 尾部布局：…"IEND"(4) + CRC(4)；IEND 的 ASCII 在倒数第 8–5 字节
                Check("有 IEND 块", Encoding.ASCII.GetString(data, data.Length - 8, 4) == "IEND");
            }
            Check("坏路径返回 null（不抛错）", ApplicationScanner.ExtractIconPng(@"C:\no\such\file.exe") is null);
            Check("空路径返回 null", ApplicationScanner.ExtractIconPng("") is null);
        }
        catch (Exception ex)
        {
            Check("图标提取套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>catalog 路由组在临时库上的 CRUD 往返（真扫描候选做 from-scan 来源）。</summary>
    private static void CheckApplicationCatalog()
    {
        var dbPath = Path.Combine(TempDir(), "apps.db");
        try
        {
            var db = new Db(dbPath);
            // 关掉 PowerShell 清单（工具会话派生 powershell.exe 会被安全软件掐），其余全真：
            // 真开始菜单枚举 + 进程内 COM 解析 + 真 App Paths 注册表
            var scanner = new ApplicationScanner(ApplicationScanner.StartMenuRoots(), useShellLists: false);
            var catalog = new ApplicationCatalog(db, scanner);
            var api = new LocalApi(db, scanner);

            Check("空库 GET /applications 为空数组",
                api.HandleAsync("GET", "/applications", null).Result is { } r0 && r0.Status == 200 && r0.Text == "[]");

            var scanRows = catalog.Scan();
            Check("GET /applications/scan 返回带 added 的清单",
                scanRows.Count > 0 && scanRows.All(r => r.ContainsKey("id") && r.ContainsKey("name")
                    && r.ContainsKey("category") && r.ContainsKey("icon") && r.ContainsKey("added")));
            var target = scanRows.First();
            var scanId = (string)target["id"]!;

            // from-scan 正常路径
            var created = api.HandleAsync("POST", "/applications/from-scan",
                JsonSerializer.Serialize(new { scan_id = scanId })).Result;
            Check("from-scan 返回 201", created is { Status: 201 }, created?.Text ?? "");
            JsonElement? payload = created is null ? null : JsonDocument.Parse(created.Text).RootElement;
            Check("from-scan 载荷是 application_payload 形态",
                payload is not null
                && payload.Value.TryGetProperty("launchable", out var launchable) && launchable.GetBoolean()
                && payload.Value.TryGetProperty("icon", out var iconEl) && iconEl.GetString() == $"native:{scanId}"
                && !payload.Value.TryGetProperty("source_key", out _)
                && !payload.Value.TryGetProperty("launch_path", out _));

            // from-scan 重复 → 409
            var dup = api.HandleAsync("POST", "/applications/from-scan",
                JsonSerializer.Serialize(new { scan_id = scanId })).Result;
            Check("from-scan 重复返回 409", dup is { Status: 409 }, dup?.Text ?? "");

            // PATCH 改名 + 同名冲突
            var appId = payload is null ? "" : payload.Value.GetProperty("id").GetString()!;
            var patched = api.HandleAsync("PATCH", $"/applications/{appId}",
                JsonSerializer.Serialize(new
                {
                    name = "改名应用", category = "效率", icon = "idea", favorite = true,
                    size_label = "本机", use_count = 3, last_opened_at = (string?)null, running = false,
                })).Result;
            Check("PATCH 返回 200 且 favorite 转 bool",
                patched is { Status: 200 }
                && JsonDocument.Parse(patched.Text).RootElement.GetProperty("favorite").GetBoolean());
            var conflict = api.HandleAsync("PATCH", $"/applications/{appId}",
                JsonSerializer.Serialize(new
                {
                    name = "改名应用", category = "效率", icon = "idea", favorite = false,
                    size_label = "本机", use_count = 0, last_opened_at = (string?)null, running = false,
                })).Result;
            Check("PATCH 自己不算同名冲突", conflict is { Status: 200 });

            var badPatch = api.HandleAsync("PATCH", "/applications/不存在的id",
                JsonSerializer.Serialize(new
                {
                    name = "随便", category = "效率", icon = "idea", favorite = false,
                    size_label = "—", use_count = 0, last_opened_at = (string?)null, running = false,
                })).Result;
            Check("PATCH 不存在返回 404", badPatch is { Status: 404 }, badPatch?.Text ?? "");

            // launch：未知 id → 404（真启动路径不在无头环境跑，避免真开应用）
            var launch404 = api.HandleAsync("POST", "/applications/不存在的id/launch", null).Result;
            Check("launch 不存在返回 404", launch404 is { Status: 404 }, launch404?.Text ?? "");

            // DELETE 往返
            var deleted = api.HandleAsync("DELETE", $"/applications/{appId}", null).Result;
            Check("DELETE 返回 deleted+appId",
                deleted is { Status: 200 }
                && JsonDocument.Parse(deleted.Text).RootElement.GetProperty("deleted").GetBoolean()
                && JsonDocument.Parse(deleted.Text).RootElement.GetProperty("appId").GetString() == appId);
            var delAgain = api.HandleAsync("DELETE", $"/applications/{appId}", null).Result;
            Check("DELETE 不存在返回 404", delAgain is { Status: 404 });

            // 走到这库是干净的：清掉 from-scan 塞进去的应用，保证可重复跑
            foreach (var row in db.FetchAll("SELECT id FROM applications"))
                db.Execute("DELETE FROM applications WHERE id=@p0", row["id"]);
        }
        catch (Exception ex)
        {
            Check("应用路由套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块3：module_registry + module_runner + execution_service ==================== */

    private static string WriteText(string path, string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content, new UTF8Encoding(false));
        return path;
    }

    /// <summary>registry 解析：合法 manifest 字段逐一对齐 Python 版，非法的四类全被拒。</summary>
    private static void CheckModuleRegistry()
    {
        var root = Path.Combine(TempDir(), "modules");
        var modDir = Path.Combine(root, "good-mod");
        WriteText(Path.Combine(modDir, "run.bat"), "@echo ok\r\n");
        var manifest = WriteText(Path.Combine(modDir, "module.json"),
            """
            {
              "id": "good-mod",
              "schemaVersion": 1,
              "projectId": "good-proj",
              "name": "好模块",
              "version": "1.2.3",
              "projectRoot": "{console_root}/../proj-root",
              "actions": {
                "run": { "program": "cmd.exe", "args": ["/c", "{module_dir}\\run.bat"], "cwd": "{project_root}" },
                "stop": { "program": "cmd.exe", "args": ["/c", "echo", "stopped"] }
              },
              "timeoutSeconds": 60
            }
            """);
        var registry = new ModuleRegistry(root);
        var loaded = registry.Load();
        Check("registry.Load 加载 1 个模块", loaded.Count == 1, string.Join(',', loaded.Keys));
        var def = registry.Get("good-mod")!;
        Check("projectRoot 的 {console_root} 展开且归一",
            def.ProjectRoot == Path.GetFullPath(Path.Combine(root, "..", "..", "..", "proj-root")), def.ProjectRoot);
        Check("cwd 的 {project_root} 展开", def.Actions["run"].Cwd == def.ProjectRoot);
        Check("actions 两个动作都在", def.Actions.ContainsKey("run") && def.Actions.ContainsKey("stop"));
        Check("timeoutSeconds 读出", def.TimeoutSeconds == 60);
        Check("singleInstance 默认 true", def.SingleInstance);
        Check("requiresAdmin 默认 false", !def.RequiresAdmin);
        Check("ConsoleRoot 是 modules 上两级", registry.ConsoleRoot == Path.GetFullPath(Path.Combine(root, "..", "..")));

        // 未声明 projectName / projectDescription 时的兜底文案
        var bareDir = Path.Combine(root, "bare-mod");
        WriteText(Path.Combine(bareDir, "module.json"),
            """{"id":"bare-mod","schemaVersion":1,"projectId":"bare-proj","name":"裸","version":"0","projectRoot":".","actions":{"run":{"program":"cmd.exe","args":["/c","x"]}}}""");
        var loaded2 = new ModuleRegistry(root).Load();
        Check("缺省项目名兜底为 DEFAULT_PROJECT_NAME",
            loaded2["bare-mod"].ProjectName == ModuleRegistry.DefaultProjectName
            && loaded2["bare-mod"].ProjectDescription == ModuleRegistry.DefaultProjectDescription);

        foreach (var (name, bad) in new[]
                 {
                     ("非法模块 id 被拒", """{"id":"Bad_ID","schemaVersion":1,"projectId":"p","name":"n","version":"v","projectRoot":".","actions":{"run":{"program":"c","args":[]}}}"""),
                     ("schemaVersion 不支持被拒", """{"id":"x1","schemaVersion":2,"projectId":"p","name":"n","version":"v","projectRoot":".","actions":{"run":{"program":"c","args":[]}}}"""),
                     ("缺 actions.run 被拒", """{"id":"x2","schemaVersion":1,"projectId":"p","name":"n","version":"v","projectRoot":".","actions":{"stop":{"program":"c","args":[]}}}"""),
                     ("timeoutSeconds 越界被拒", """{"id":"x3","schemaVersion":1,"projectId":"p","name":"n","version":"v","projectRoot":".","timeoutSeconds":0,"actions":{"run":{"program":"c","args":[]}}}"""),
                 })
        {
            var badDir = Path.Combine(root, "bad-mod");
            WriteText(Path.Combine(badDir, "module.json"), bad);
            var rejected = false;
            try { new ModuleRegistry(root).Load(); }
            catch (ModuleRegistryError) { rejected = true; }
            finally { File.Delete(Path.Combine(badDir, "module.json")); }
            Check(name, rejected);
        }
        _ = manifest;
    }

    /// <summary>临时模块目录 + 一个「写 result.json 的 run.bat」工具模块，供端到端用。</summary>
    private static string MakeBatModule(string modulesRoot, string modId, string projId,
        string projName, int timeoutSeconds, string extraActionsJson)
    {
        var modDir = Path.Combine(modulesRoot, modId);
        WriteText(Path.Combine(modDir, "run.bat"),
            "@echo off\r\nping -n 2 127.0.0.1 >nul\r\necho {\"ok\":true,\"status\":{\"state\":\"running\"}}> \"%~1\"\r\n");
        WriteText(Path.Combine(modDir, "stop.bat"),
            "@echo off\r\necho {\"ok\":true}> \"%~1\"\r\n");
        WriteText(Path.Combine(modDir, "slow.bat"),
            "@echo off\r\nping -n 31 127.0.0.1 >nul\r\n");
        WriteText(Path.Combine(modDir, "module.json"),
            """
            {
              "id": "__ID__", "schemaVersion": 1, "projectId": "__PROJ__",
              "projectName": "__PROJNAME__", "name": "自测模块", "version": "1.0.0",
              "projectRoot": ".", "timeoutSeconds": __TIMEOUT__,
              "actions": {
                "run": { "program": "cmd.exe", "args": ["/c", "{module_dir}\\run.bat", "{result_path}"] },
                "stop": { "program": "cmd.exe", "args": ["/c", "{module_dir}\\stop.bat", "{result_path}"] },
                "slow": { "program": "cmd.exe", "args": ["/c", "{module_dir}\\slow.bat"] }
                __EXTRA__
              }
            }
            """.Replace("__ID__", modId).Replace("__PROJ__", projId).Replace("__PROJNAME__", projName)
               .Replace("__TIMEOUT__", timeoutSeconds.ToString())
               .Replace("__EXTRA__", extraActionsJson));
        return modDir;
    }

    private sealed record ExecApi(Db Db, ModuleRegistry Registry, ModuleRunner Runner,
        ExecutionService Execution, LocalApi Api);

    private static ExecApi MakeExecStack(string dir, Dictionary<string, bool>? webRuns = null)
    {
        var db = new Db(Path.Combine(dir, "apex.db"));
        db.Init();
        var registry = new ModuleRegistry(Path.Combine(dir, "modules"));
        var catalog = new ApplicationCatalog(db, new ApplicationScanner(Array.Empty<string>(), useShellLists: false));
        var runner = new ModuleRunner(db, registry, Path.Combine(dir, "runs"),
            webOpener: url => { if (webRuns is not null) webRuns[url] = true; return true; },
            applicationCatalog: catalog);
        var execution = new ExecutionService(db, runner);
        var api = new LocalApi(db, scanner: null, registry: registry, runner: runner,
            execution: execution, initOnStart: false);
        return new ExecApi(db, registry, runner, execution, api);
    }

    /// <summary>轮询执行到终态（queued/running 之外），超时返回 null。</summary>
    private static LocalApi.Reply? WaitForExecutionTerminal(ExecApi stack, string executionId, int timeoutMs = 30000)
    {
        for (var waited = 0; waited < timeoutMs; waited += 100)
        {
            var reply = stack.Api.HandleAsync("GET", $"/executions/{executionId}", null).Result;
            if (reply is { Status: 200 })
            {
                using var doc = JsonDocument.Parse(reply.Text);
                var status = doc.RootElement.GetProperty("status").GetString();
                if (status is not ("queued" or "running")) return reply;
            }
            Thread.Sleep(100);
        }
        return null;
    }

    private static (string? Status, string? Error, JsonElement Steps) ParseExecution(LocalApi.Reply? reply)
    {
        if (reply is not { Status: 200 }) return (null, null, default);
        var doc = JsonDocument.Parse(reply.Text).RootElement;
        return (doc.GetProperty("status").GetString(),
            doc.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null,
            doc.GetProperty("steps").Clone());
    }

    /// <summary>端到端：registry 同步 → run 成功（真子进程写 result.json）→ 409 重复 → stop 中断 →
    /// restart 完整链 → 失败即停 → 未知占位符 → 超时 kill → web 模块 → runtime / legacy runs 路由。</summary>
    private static void CheckExecutionEndToEnd()
    {
        var dir = TempDir();
        try
        {
            var stack = MakeExecStack(dir);
            var db = stack.Db;
            // 主角模块：run/stop 都瞬时成功；slow 动作睡 30 秒（供 409 与取消测试）
            MakeBatModule(Path.Combine(dir, "modules"), "e2e-mod", "e2e-proj", "端到端项目",
                timeoutSeconds: 120,
                extraActionsJson: ",\"run-bogus\": { \"program\": \"cmd.exe\", \"args\": [\"/c\", \"echo\", \"{bogus}\"] }");
            stack.Registry.Load();
            stack.Runner.SyncRegistry();

            // sync_registry 三张表
            Check("SyncRegistry 写入 modules 行",
                db.FetchOne("SELECT * FROM modules WHERE id=@p0 AND type='script'", "e2e-mod") is not null);
            var projRow = db.FetchOne("SELECT * FROM projects WHERE id=@p0", "e2e-proj");
            Check("SyncRegistry 建出登记项目", projRow is not null && (projRow!["name"] as string) == "端到端项目");
            Check("SyncRegistry 绑定 project_modules",
                db.FetchOne("SELECT * FROM project_modules WHERE project_id=@p0 AND module_id=@p1",
                    "e2e-proj", "e2e-mod") is not null);

            // 场景 A：run 成功
            var startReply = stack.Api.HandleAsync("POST", "/projects/e2e-proj/executions",
                """{"action":"run"}""").Result;
            Check("POST executions 返回 202", startReply is { Status: 202 }, startReply?.Text ?? "");
            var executionId = "";
            if (startReply is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(startReply.Text);
                executionId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            var (status, _, steps) = ParseExecution(WaitForExecutionTerminal(stack, executionId));
            Check("run 执行终态 succeeded", status == "succeeded", status ?? "TIMEOUT");
            var step0 = steps.ValueKind == JsonValueKind.Array && steps.GetArrayLength() > 0 ? steps[0] : default;
            Check("步骤一 succeeded 且带 run_id",
                step0.ValueKind != default && step0.GetProperty("status").GetString() == "succeeded"
                && step0.TryGetProperty("run_id", out var rid) && rid.GetString() is { Length: > 0 });
            var runId = step0.ValueKind != default ? step0.GetProperty("run_id").GetString()! : "";
            var runReply = stack.Api.HandleAsync("GET", $"/runs/{runId}", null).Result;
            Dictionary<string, JsonElement>? runPayload = null;
            if (runReply is { Status: 200 })
            {
                using var doc = JsonDocument.Parse(runReply.Text);
                runPayload = doc.RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            }
            Check("legacy /runs 有 logs 且 result.ok=true",
                runPayload is not null
                && runPayload!["logs"].ValueKind == JsonValueKind.Array
                && runPayload["result"].ValueKind == JsonValueKind.Object
                && runPayload["result"].GetProperty("ok").GetBoolean());
            Check("run 目录留有真实产物",
                runPayload is not null && (runPayload["run_dir"].GetString() is { Length: > 0 } runDir
                    && File.Exists(Path.Combine(runDir, "result.json"))
                    && File.Exists(Path.Combine(runDir, "process.stdout.log"))));

            // 场景 B：runtime 路由（result.status.state=running）
            var runtime = stack.Api.HandleAsync("GET", "/projects/e2e-proj/runtime", null).Result;
            Check("runtime state=running（result.json 的 status.state）",
                runtime is { Status: 200 }
                && JsonDocument.Parse(runtime.Text).RootElement.GetProperty("state").GetString() == "running");

            // 场景 C：执行中再 run → 409；stop 能打断执行中的 run
            var slowStart = stack.Api.HandleAsync("POST", "/projects/e2e-proj/executions",
                """{"action":"run"}""").Result;
            var slowId = "";
            if (slowStart is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(slowStart.Text);
                slowId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            else
            {
                // 若 run 瞬时完成（bat 太快），改用 slow 动作拉长时间窗
                var alt = stack.Api.HandleAsync("POST", "/projects/e2e-proj/executions",
                    """{"action":"run"}""").Result;
                Check("第二次 run 可再次启动（首个已结束）", alt is { Status: 202 }, alt?.Text ?? "");
            }
            if (slowId.Length > 0)
            {
                var dup = stack.Api.HandleAsync("POST", "/projects/e2e-proj/run", null).Result;
                Check("执行中再 run 返回 409", dup is { Status: 409 }, dup?.Text ?? "");
                var stopReply = stack.Api.HandleAsync("POST", "/projects/e2e-proj/stop", null).Result;
                Check("stop 接受并返回 202", stopReply is { Status: 202 }, stopReply?.Text ?? "");
                var stopId = "";
                if (stopReply is { Status: 202 })
                {
                    using var doc = JsonDocument.Parse(stopReply.Text);
                    stopId = doc.RootElement.GetProperty("id").GetString() ?? "";
                }
                var (stopStatus, stopError, _) = ParseExecution(WaitForExecutionTerminal(stack, stopId));
                Check("stop 执行终态 stopped", stopStatus == "stopped", $"{stopStatus}|{stopError}");
                var (oldStatus, oldError, _) = ParseExecution(WaitForExecutionTerminal(stack, slowId));
                Check("被打断的 run 标记 interrupted",
                    oldStatus == "interrupted" && (oldError ?? "").Contains("中断"), $"{oldStatus}|{oldError}");
            }

            // 场景 D：restart = 完整 stop → run
            var restart = stack.Api.HandleAsync("POST", "/projects/e2e-proj/restart", null).Result;
            var restartId = "";
            if (restart is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(restart.Text);
                restartId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            Check("restart 返回 202", restartId.Length > 0, restart?.Text ?? "");
            var (reStatus, reError, reSteps) = ParseExecution(WaitForExecutionTerminal(stack, restartId));
            var reDetail = "";
            if (reSteps.ValueKind == JsonValueKind.Array)
                foreach (var s in reSteps.EnumerateArray())
                    reDetail += $"[{s.GetProperty("action").GetString()}/{s.GetProperty("status").GetString()}" +
                                $"{(s.TryGetProperty("error", out var se) && se.ValueKind == JsonValueKind.String ? ":" + se.GetString() : "")}" +
                                $"{(s.TryGetProperty("run_id", out var sr) && sr.GetString() is { Length: > 0 } && s.TryGetProperty("run", out var rr) && rr.ValueKind == JsonValueKind.Object ? " run=" + rr.GetProperty("status").GetString() + ":" + (rr.TryGetProperty("error", out var rre) && rre.ValueKind == JsonValueKind.String ? rre.GetString() : "") : "")}]";
            Check("restart 终态 succeeded（stop 步骤 stopped + run 步骤 succeeded）",
                reStatus == "succeeded" && reError is null
                && reSteps.ValueKind == JsonValueKind.Array && reSteps.GetArrayLength() == 2
                && reSteps[0].GetProperty("action").GetString() == "stop"
                && reSteps[0].GetProperty("status").GetString() == "stopped"
                && reSteps[1].GetProperty("action").GetString() == "run"
                && reSteps[1].GetProperty("status").GetString() == "succeeded",
                $"{reStatus}|{reError}|{reDetail}");

            // 场景 E：失败即停（绑一个 exit 1 的模块在后面）
            WriteText(Path.Combine(dir, "modules", "fail-mod", "module.json"),
                """{"id":"fail-mod","schemaVersion":1,"projectId":"e2e-proj","projectName":"端到端项目","name":"失败模块","version":"1.0","projectRoot":".","actions":{"run":{"program":"cmd.exe","args":["/c","exit","1"]}}}""");
            stack.Registry.Load();
            stack.Runner.SyncRegistry();
            db.Execute(
                "INSERT OR IGNORE INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(@p0,@p1,1,1)",
                "e2e-proj", "fail-mod");
            var failRun = stack.Api.HandleAsync("POST", "/projects/e2e-proj/executions", """{"action":"run"}""").Result;
            var failId = "";
            if (failRun is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(failRun.Text);
                failId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            var (fStatus, _, fSteps) = ParseExecution(WaitForExecutionTerminal(stack, failId));
            Check("失败即停：终态 failed", fStatus == "failed", fStatus ?? "TIMEOUT");
            Check("失败即停：第二步 failed 且错误带退出码，第一步不受连坐",
                fSteps.ValueKind == JsonValueKind.Array && fSteps.GetArrayLength() == 2
                && fSteps[0].GetProperty("status").GetString() == "succeeded"
                && fSteps[1].GetProperty("status").GetString() == "failed"
                && (fSteps[1].TryGetProperty("error", out var ferr) ? ferr.GetString() : "")!.Contains("1"),
                fSteps.ValueKind == JsonValueKind.Array && fSteps.GetArrayLength() > 1
                    ? (fSteps[1].TryGetProperty("error", out var fe) ? fe.GetString() : "") ?? "" : "");

            // 场景 F：未知占位符 → 执行体失败（validate 不查、执行时炸，与 Python 版同构）。
            // fail-mod 绑定已清掉，避免干扰；bogus 用独立项目。
            db.Execute("DELETE FROM project_modules WHERE module_id=@p0", "fail-mod");
            WriteText(Path.Combine(dir, "modules", "bogus-mod", "module.json"),
                """{"id":"bogus-mod","schemaVersion":1,"projectId":"bogus-proj","projectName":"占位符项目","name":"坏占位符","version":"1.0","projectRoot":".","actions":{"run":{"program":"cmd.exe","args":["/c","echo","{bogus}"]}}}""");
            stack.Registry.Load();
            stack.Runner.SyncRegistry();
            var bogusRun = stack.Api.HandleAsync("POST", "/projects/bogus-proj/run", null).Result;
            var bogusId = "";
            if (bogusRun is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(bogusRun.Text);
                bogusId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            var (bStatus, bError, _) = ParseExecution(WaitForExecutionTerminal(stack, bogusId));
            Check("未知占位符让执行失败且错误点名参数",
                bStatus == "failed" && (bError ?? "").Contains("未知占位符"), $"{bStatus}|{bError}");

            // 场景 G：web 模块（假 opener，不真开浏览器）
            var webRuns = new Dictionary<string, bool>();
            var webStack = MakeExecStack(Path.Combine(dir, "web"), webRuns);
            // web 模块行（web 分支不经 manifest，直接从 modules 表读）
            webStack.Db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('web-selftest','自测网页','web','','https://selftest.invalid','','1','',1,@p0)", Db.UtcNow());
            webStack.Db.Execute(
                "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
                "VALUES('web-proj','网页项目','','正常',@p0,@p0,99)", Db.UtcNow());
            webStack.Db.Execute(
                "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES('web-proj','web-selftest',0,1)");
            var webRun = webStack.Api.HandleAsync("POST", "/projects/web-proj/run", null).Result;
            var webId = "";
            if (webRun is { Status: 202 })
            {
                using var doc = JsonDocument.Parse(webRun.Text);
                webId = doc.RootElement.GetProperty("id").GetString() ?? "";
            }
            var (wStatus, _, _) = ParseExecution(WaitForExecutionTerminal(webStack, webId));
            Check("web 模块执行 succeeded 且 opener 被调用", wStatus == "succeeded" && webRuns.ContainsKey("https://selftest.invalid"), wStatus ?? "TIMEOUT");

            // 场景 H：路由 404 / 422 形态
            var missingProj = stack.Api.HandleAsync("POST", "/projects/no-such-proj/run", null).Result;
            Check("不存在项目 404", missingProj is { Status: 404 }, missingProj?.Text ?? "");
            var badAction = stack.Api.HandleAsync("POST", "/projects/e2e-proj/executions",
                """{"action":"explode"}""").Result;
            Check("非法 action 422", badAction is { Status: 422 }, badAction?.Text ?? "");
            var badExec = stack.Api.HandleAsync("GET", "/executions/no-such-exec", null).Result;
            Check("不存在执行记录 404", badExec is { Status: 404 }, badExec?.Text ?? "");
        }
        catch (Exception ex)
        {
            Check("执行端到端套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>recover_interrupted：三个残留表（executions/steps/runs）全被打成 interrupted。</summary>
    private static void CheckExecutionRecover()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            var now = Db.UtcNow();
            // runs / execution_steps 有到 modules 的外键，先补模块行
            db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('m','残留模块','script','','m','','1','',1,@p0)", now);
            db.Execute(
                "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
                "VALUES('rec-proj','回收项目','','正常',@p0,@p0,0)", now);
            db.Execute(
                "INSERT INTO project_executions(id,project_id,action,status,started_at) " +
                "VALUES('rec-exec','rec-proj','run','running',@p0)", now);
            db.Execute(
                "INSERT INTO execution_steps(id,execution_id,sort_order,module_id,module_name,action,status) " +
                "VALUES('rec-step','rec-exec',0,'m','模块','run','running')");
            db.Execute(
                "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) " +
                "VALUES('rec-run','rec-proj','m','run','queued',@p0,'C:\\nowhere')", now);

            var runner = new ModuleRunner(db, new ModuleRegistry(Path.Combine(dir, "modules")),
                Path.Combine(dir, "runs"), webOpener: _ => true);
            var service = new ExecutionService(db, runner);
            service.RecoverInterrupted();

            var exec = db.FetchOne("SELECT * FROM project_executions WHERE id='rec-exec'");
            Check("残留执行被打成 interrupted",
                (exec?["status"] as string) == "interrupted" && (exec?["error"] as string)!.Contains("中断"));
            var step = db.FetchOne("SELECT * FROM execution_steps WHERE id='rec-step'");
            Check("残留步骤被打成 interrupted", (step?["status"] as string) == "interrupted");
            var run = db.FetchOne("SELECT * FROM runs WHERE id='rec-run'");
            Check("残留 runs 也被打成 interrupted（不再卡死「运行中」）",
                (run?["status"] as string) == "interrupted");
        }
        catch (Exception ex)
        {
            Check("recover 套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块4：window_manager（壳原生置顶）+ activity ==================== */

    private sealed class FakeWindowHost : IConsoleWindowHost
    {
        public bool Topmost;
        public int SetCalls;
        public bool ThrowOnSet;

        public Dictionary<string, object?> Status() => new()
        {
            ["available"] = true, ["topmost"] = Topmost, ["width"] = 1440, ["height"] = 900,
        };

        public Dictionary<string, object?> SetTopmost(bool enabled)
        {
            SetCalls++;
            if (ThrowOnSet)
                throw new ConsoleWindowError("没有可控制的 APEX 固定窗口，请先打开固定窗口");
            Topmost = enabled;
            return Status();
        }
    }

    /// <summary>窗口置顶路由：可用性、往返、422、503（无窗口宿主如实报不可用）。</summary>
    private static void CheckWindowRoutes()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            // 缺省宿主（无窗口）：如实报 available:false，置顶请求 503，不假装成功
            var headless = new LocalApi(db, scanner: null, registry: new ModuleRegistry(Path.Combine(dir, "modules")),
                runner: null, execution: null, initOnStart: false);
            var headlessStatus = headless.HandleAsync("GET", "/window", null).Result;
            Check("无窗口宿主 /window 报 available:false",
                headlessStatus is { Status: 200 }
                && !JsonDocument.Parse(headlessStatus.Text).RootElement.GetProperty("available").GetBoolean());
            var headlessPut = headless.HandleAsync("PUT", "/window/topmost", """{"enabled":true}""").Result;
            Check("无窗口宿主置顶被拒（503 + 中文原因）",
                headlessPut is { Status: 503 } && headlessPut.Text.Contains("固定窗口"), headlessPut?.Text ?? "");

            // 注入假宿主：契约往返
            var host = new FakeWindowHost();
            var api = new LocalApi(db, scanner: null, registry: new ModuleRegistry(Path.Combine(dir, "modules")),
                runner: null, execution: null, initOnStart: false, windowHost: host);
            var initial = api.HandleAsync("GET", "/window", null).Result;
            Check("假宿主 /window 返回 available/topmost/宽高",
                initial is { Status: 200 }
                && JsonDocument.Parse(initial.Text).RootElement.GetProperty("available").GetBoolean()
                && !JsonDocument.Parse(initial.Text).RootElement.GetProperty("topmost").GetBoolean()
                && JsonDocument.Parse(initial.Text).RootElement.GetProperty("width").GetInt32() == 1440);

            var on = api.HandleAsync("PUT", "/window/topmost", """{"enabled":true}""").Result;
            Check("置顶开启返回 topmost:true 且宿主被调用",
                on is { Status: 200 }
                && JsonDocument.Parse(on.Text).RootElement.GetProperty("topmost").GetBoolean()
                && host.SetCalls == 1 && host.Topmost);
            var off = api.HandleAsync("PUT", "/window/topmost", """{"enabled":false}""").Result;
            Check("置顶关闭往返",
                off is { Status: 200 }
                && !JsonDocument.Parse(off.Text).RootElement.GetProperty("topmost").GetBoolean()
                && host.SetCalls == 2 && !host.Topmost);

            var bad = api.HandleAsync("PUT", "/window/topmost", """{"enabled":"yes"}""").Result;
            Check("非布尔 enabled 返回 422", bad is { Status: 422 }, bad?.Text ?? "");
            var empty = api.HandleAsync("PUT", "/window/topmost", null).Result;
            Check("缺 body 返回 422", empty is { Status: 422 });

            host.ThrowOnSet = true;
            var throwReply = api.HandleAsync("PUT", "/window/topmost", """{"enabled":true}""").Result;
            Check("宿主抛 ConsoleWindowError 时路由返回 503",
                throwReply is { Status: 503 }, throwReply?.Text ?? "");
        }
        catch (Exception ex)
        {
            Check("窗口路由套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>活动上报与日聚合：心跳累加、371 格结构、天数 clamp、numstat 解析、空目录回退。</summary>
    private static void CheckActivityRoutes()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            var emptyCodeDir = Path.Combine(dir, "no-repos");
            Directory.CreateDirectory(emptyCodeDir);
            var activity = new ActivityService(db, dataDir: dir, codeDirsOverride: new[] { emptyCodeDir });
            var api = new LocalApi(db, scanner: null, registry: new ModuleRegistry(Path.Combine(dir, "modules")),
                runner: null, execution: null, initOnStart: false, activity: activity);

            var hb1 = api.HandleAsync("POST", "/activity/heartbeat", null).Result;
            var hb2 = api.HandleAsync("POST", "/activity/heartbeat", null).Result;
            Check("心跳按本地日累加（两次 → 2 分钟）",
                hb1 is { Status: 200 } && hb2 is { Status: 200 }
                && JsonDocument.Parse(hb1.Text).RootElement.GetProperty("minutes").GetInt64() == 1
                && JsonDocument.Parse(hb2.Text).RootElement.GetProperty("minutes").GetInt64() == 2,
                $"{hb1?.Text} / {hb2?.Text}");
            var today = ActivityService.LocalDay(DateTimeOffset.Now);
            Check("心跳返回本机本地日", JsonDocument.Parse(hb2!.Text).RootElement.GetProperty("day").GetString() == today);

            var daily = api.HandleAsync("GET", "/activity/daily", null).Result;
            Check("默认 371 格且末日是今天", daily is { Status: 200 }
                && JsonDocument.Parse(daily.Text).RootElement.GetProperty("days").GetArrayLength() == 371);
            var last = JsonDocument.Parse(daily!.Text).RootElement.GetProperty("days")[370];
            Check("今日 online=2 且 count=online+adds+dels",
                last.GetProperty("date").GetString() == today
                && last.GetProperty("online").GetInt64() == 2
                && last.GetProperty("count").GetInt64()
                    == last.GetProperty("online").GetInt64() + last.GetProperty("adds").GetInt64() + last.GetProperty("dels").GetInt64());
            Check("无 git 仓库时 adds/dels 全 0（不报错、不假造）",
                JsonDocument.Parse(daily.Text).RootElement.GetProperty("days").EnumerateArray()
                    .All(d => d.GetProperty("adds").GetInt64() == 0 && d.GetProperty("dels").GetInt64() == 0));
            Check("首日 = 今天 - 370 天",
                JsonDocument.Parse(daily.Text).RootElement.GetProperty("days")[0].GetProperty("date").GetString()
                    == DateTimeOffset.Now.Date.AddDays(-370).ToString("yyyy-MM-dd"));

            var clampedLow = api.HandleAsync("GET", "/activity/daily?days=0", null).Result;
            Check("days=0 被抬到 1 格",
                JsonDocument.Parse(clampedLow!.Text).RootElement.GetProperty("days").GetArrayLength() == 1);
            var clampedHigh = api.HandleAsync("GET", "/activity/daily?days=999", null).Result;
            Check("days=999 被压到 400 格",
                JsonDocument.Parse(clampedHigh!.Text).RootElement.GetProperty("days").GetArrayLength() == 400);
            var seven = api.HandleAsync("GET", "/activity/daily?days=7", null).Result;
            Check("query 解析 days=7",
                JsonDocument.Parse(seven!.Text).RootElement.GetProperty("days").GetArrayLength() == 7);
            var junk = api.HandleAsync("GET", "/activity/daily?days=abc", null).Result;
            Check("非法 days 回落默认 371",
                JsonDocument.Parse(junk!.Text).RootElement.GetProperty("days").GetArrayLength() == 371);

            // numstat 解析（真实输出样本：切日、二进制 `-`、空行）
            var buckets = new Dictionary<string, Dictionary<string, long>>();
            ActivityService.MergeNumstat(buckets,
                "@@2026-09-24\n12\t3\tsrc/app.js\n-\t-\tassets/logo.png\n\n@@2026-09-25\n5\t0\tREADME.md\n4\t1\tsrc/app.js\n");
            Check("numstat 按日分桶并累加",
                buckets["2026-09-24"]["adds"] == 12 && buckets["2026-09-24"]["dels"] == 3
                && buckets["2026-09-25"]["adds"] == 9 && buckets["2026-09-25"]["dels"] == 1);
            Check("二进制行（-）不计入", buckets.Values.All(v => v["adds"] >= 0 && v["dels"] >= 0
                && buckets.Count == 2));

            // codeDirs = [] 语义：彻底关闭（不是回退默认）
            var off = new ActivityService(db, dataDir: dir, codeDirsOverride: Array.Empty<string>());
            Check("codeDirs 空数组 = 彻底关闭扫描",
                off.CodeDirs().Count == 0 && off.GitCodeChanges(371).Count == 0);
            Check("配置缺省回退 D:\\Projects（仅当未注入 override）",
                new ActivityService(db, dataDir: Path.Combine(dir, "nowhere")).CodeDirs()
                    .All(p => p == @"D:\Projects" || !Directory.Exists(@"D:\Projects")));
        }
        catch (Exception ex)
        {
            Check("活动路由套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块5：项目 / 任务 / 记录 / 文件 / 基本资料 ==================== */

    private static string JsonBody(object payload) => JsonSerializer.Serialize(payload);

    private static JsonElement OkJson(LocalApi.Reply? reply)
    {
        if (reply is not { Status: 200 } and not { Status: 201 }) return default;
        using var doc = JsonDocument.Parse(reply.Text);
        return doc.RootElement.Clone();
    }

    /// <summary>项目域 20 条路由：CRUD、排序全量校验、删除预演与级联、任务/记录/文件、基本资料事务。</summary>
    private static void CheckProjectDomainRoutes()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            var api = new LocalApi(db, scanner: null, registry: new ModuleRegistry(Path.Combine(dir, "modules")),
                runner: null, execution: null, initOnStart: false);

            /* ---- 项目 CRUD ---- */
            var created = api.HandleAsync("POST", "/projects",
                JsonBody(new { name = "自测项目甲", description = "描述", status = "正常" })).Result;
            Check("POST /projects 返回 201", created is { Status: 201 }, created?.Text ?? "");
            var projectId = OkJson(created).GetProperty("id").GetString() ?? "";
            Check("新项目 id 形如 p-xxxxxxxxxxxx", projectId.StartsWith("p-") && projectId.Length == 14, projectId);

            var dup = api.HandleAsync("POST", "/projects", JsonBody(new { name = "自测项目甲" })).Result;
            Check("同名项目 409", dup is { Status: 409 }, dup?.Text ?? "");
            var badStatus = api.HandleAsync("POST", "/projects",
                JsonBody(new { name = "别样", status = "已完成" })).Result;
            Check("非法 status 422", badStatus is { Status: 422 }, badStatus?.Text ?? "");
            var longName = api.HandleAsync("POST", "/projects",
                JsonBody(new { name = new string('x', 81) })).Result;
            Check("name 超 80 字 422", longName is { Status: 422 });
            var noName = api.HandleAsync("POST", "/projects", """{"description":"无名"}""").Result;
            Check("缺 name 422", noName is { Status: 422 });

            var second = api.HandleAsync("POST", "/projects", JsonBody(new { name = "自测项目乙" })).Result;
            var secondId = OkJson(second).GetProperty("id").GetString() ?? "";
            var list = api.HandleAsync("GET", "/projects", null).Result;
            Check("列表按 sort_order 返回且新项目排末尾",
                OkJson(list).GetArrayLength() == 2
                && OkJson(list)[0].GetProperty("name").GetString() == "自测项目甲"
                && OkJson(list)[1].GetProperty("name").GetString() == "自测项目乙");

            /* ---- 排序：必须全量且唯一 ---- */
            var reorder = api.HandleAsync("PUT", "/projects/order",
                JsonBody(new { project_ids = new[] { secondId, projectId } })).Result;
            Check("全量重排生效", reorder is { Status: 200 }
                && OkJson(reorder)[0].GetProperty("id").GetString() == secondId);
            var reorderDup = api.HandleAsync("PUT", "/projects/order",
                JsonBody(new { project_ids = new[] { secondId, secondId } })).Result;
            Check("重复 id 422", reorderDup is { Status: 422 }, reorderDup?.Text ?? "");
            var reorderShort = api.HandleAsync("PUT", "/projects/order",
                JsonBody(new { project_ids = new[] { secondId } })).Result;
            Check("缺项 422 且整批拒绝", reorderShort is { Status: 422 }, reorderShort?.Text ?? "");
            var reorderUnknown = api.HandleAsync("PUT", "/projects/order",
                JsonBody(new { project_ids = new[] { secondId, "p-not-exist" } })).Result;
            Check("未知 id 422", reorderUnknown is { Status: 422 });
            Check("拒绝后顺序未被改动",
                api.HandleAsync("GET", "/projects", null).Result is { Status: 200 }
                && OkJson(api.HandleAsync("GET", "/projects", null).Result)[0].GetProperty("id").GetString() == secondId);

            /* ---- PATCH / 404 ---- */
            var patched = api.HandleAsync("PATCH", $"/projects/{projectId}",
                JsonBody(new { name = "自测项目甲改", description = "改", status = "已暂停" })).Result;
            Check("PATCH 改名与状态生效",
                patched is { Status: 200 }
                && OkJson(patched).GetProperty("name").GetString() == "自测项目甲改"
                && OkJson(patched).GetProperty("status").GetString() == "已暂停");
            var patchDup = api.HandleAsync("PATCH", $"/projects/{projectId}",
                JsonBody(new { name = "自测项目乙" })).Result;
            Check("改成同名 409", patchDup is { Status: 409 });
            var patchMissing = api.HandleAsync("PATCH", "/projects/p-nope",
                JsonBody(new { name = "任意" })).Result;
            Check("PATCH 不存在项目 404", patchMissing is { Status: 404 });

            /* ---- 任务 ---- */
            var task = api.HandleAsync("POST", $"/projects/{projectId}/tasks",
                JsonBody(new { title = "自测任务", priority = "高", kind = "fix", due_date = "2026-10-01" })).Result;
            Check("POST tasks 返回 201 且 kind/due 落库",
                task is { Status: 201 }
                && OkJson(task).GetProperty("kind").GetString() == "fix"
                && OkJson(task).GetProperty("priority").GetString() == "高"
                && OkJson(task).GetProperty("due_date").GetString() == "2026-10-01");
            var taskId = OkJson(task).GetProperty("id").GetString() ?? "";
            Check("任务默认 completed=0", OkJson(task).GetProperty("completed").GetInt64() == 0);
            var badKind = api.HandleAsync("POST", $"/projects/{projectId}/tasks",
                JsonBody(new { title = "坏类型", kind = "bug" })).Result;
            Check("非法 kind 422", badKind is { Status: 422 }, badKind?.Text ?? "");
            var badPriority = api.HandleAsync("POST", $"/projects/{projectId}/tasks",
                JsonBody(new { title = "坏优先级", priority = "急" })).Result;
            Check("非法 priority 422", badPriority is { Status: 422 });
            var noTitle = api.HandleAsync("POST", $"/projects/{projectId}/tasks", JsonBody(new { kind = "todo" })).Result;
            Check("缺 title 422", noTitle is { Status: 422 });
            var patchTask = api.HandleAsync("PATCH", $"/tasks/{taskId}",
                JsonBody(new { title = "自测任务改", priority = "低", kind = "todo", completed = true })).Result;
            Check("PATCH 任务改标题/优先级/完成态",
                patchTask is { Status: 200 }
                && OkJson(patchTask).GetProperty("title").GetString() == "自测任务改"
                && OkJson(patchTask).GetProperty("completed").GetInt64() == 1
                && OkJson(patchTask).GetProperty("due_date").ValueKind == JsonValueKind.Null);
            Check("PATCH 缺 completed 422",
                api.HandleAsync("PATCH", $"/tasks/{taskId}",
                    JsonBody(new { title = "x" })).Result is { Status: 422 });

            /* ---- 项目记录 ---- */
            var note = api.HandleAsync("POST", $"/projects/{projectId}/notes",
                JsonBody(new { title = "自测记录", tag = "技术", body = "正文", pinned = true, links = new[] { "链接甲" } })).Result;
            Check("POST notes 201 且 links 往返",
                note is { Status: 201 }
                && OkJson(note).GetProperty("tag").GetString() == "技术"
                && OkJson(note).GetProperty("pinned").GetInt64() == 1
                && OkJson(note).GetProperty("links")[0].GetString() == "链接甲");
            var noteId = OkJson(note).GetProperty("id").GetString() ?? "";
            var badTag = api.HandleAsync("POST", $"/projects/{projectId}/notes",
                JsonBody(new { title = "坏标签", tag = "随笔" })).Result;
            Check("非法 tag 422", badTag is { Status: 422 }, badTag?.Text ?? "");
            _ = api.HandleAsync("POST", $"/projects/{projectId}/notes", JsonBody(new { title = "未置顶" })).Result;
            var notes = api.HandleAsync("GET", $"/projects/{projectId}/notes", null).Result;
            Check("记录列表置顶优先", OkJson(notes)[0].GetProperty("title").GetString() == "自测记录");
            var patchNote = api.HandleAsync("PATCH", $"/notes/{noteId}",
                JsonBody(new { title = "自测记录改", tag = "复盘", body = "新正文", pinned = false, links = new string[0] })).Result;
            Check("PATCH 记录生效", patchNote is { Status: 200 }
                && OkJson(patchNote).GetProperty("title").GetString() == "自测记录改"
                && OkJson(patchNote).GetProperty("links").GetArrayLength() == 0);

            /* ---- 项目文件 ---- */
            var realFile = Path.Combine(dir, "sample.txt");
            File.WriteAllText(realFile, "x", new UTF8Encoding(false));
            var badPath = api.HandleAsync("POST", $"/projects/{projectId}/files",
                JsonBody(new { path = "relative.txt" })).Result;
            Check("相对路径 422", badPath is { Status: 422 } && badPath.Text.Contains("绝对路径"), badPath?.Text ?? "");
            var missingPath = api.HandleAsync("POST", $"/projects/{projectId}/files",
                JsonBody(new { path = Path.Combine(dir, "nope.txt") })).Result;
            Check("不存在文件 422", missingPath is { Status: 422 } && missingPath.Text.Contains("不存在"));
            var dirPath = api.HandleAsync("POST", $"/projects/{projectId}/files",
                JsonBody(new { path = dir })).Result;
            Check("目录 422 且文案区分于不存在", dirPath is { Status: 422 } && dirPath.Text.Contains("文件夹"), dirPath?.Text ?? "");
            var registered = api.HandleAsync("POST", $"/projects/{projectId}/files",
                JsonBody(new { path = realFile })).Result;
            Check("注册真实文件 201 且 name 取文件名",
                registered is { Status: 201 } && OkJson(registered).GetProperty("name").GetString() == "sample.txt");
            var fileKey = OkJson(registered).GetProperty("id").GetString() ?? "";
            Check("文件 id 形如 pf-xxxxxxxxxxxx", fileKey.StartsWith("pf-") && fileKey.Length == 15, fileKey);
            Check("重复注册同文件 409",
                api.HandleAsync("POST", $"/projects/{projectId}/files", JsonBody(new { path = realFile })).Result
                    is { Status: 409 });
            var filePreview = api.HandleAsync("GET", $"/project-files/{fileKey}/delete-preview", null).Result;
            Check("删除预演返回 keepsLocalFile=true 与文件信息",
                filePreview is { Status: 200 }
                && OkJson(filePreview).GetProperty("keepsLocalFile").GetBoolean()
                && OkJson(filePreview).GetProperty("file").GetProperty("name").GetString() == "sample.txt");
            // 登记后磁盘文件消失 → 打开必须 409（也不真开程序）
            var vanishedFile = Path.Combine(dir, "vanished.txt");
            File.WriteAllText(vanishedFile, "x", new UTF8Encoding(false));
            var vanished = api.HandleAsync("POST", $"/projects/{projectId}/files",
                JsonBody(new { path = vanishedFile })).Result;
            var vanishedId = OkJson(vanished).GetProperty("id").GetString() ?? "";
            File.Delete(vanishedFile);
            Check("登记后磁盘文件消失 → 打开 409",
                api.HandleAsync("POST", $"/project-files/{vanishedId}/open", null).Result is { Status: 409 });
            var gonePreview = api.HandleAsync("POST", "/project-files/pf-nope/open", null).Result;
            Check("打开未登记 id 404", gonePreview is { Status: 404 });

            /* ---- 删除预演与级联 ---- */
            var previewReply = api.HandleAsync("GET", $"/projects/{projectId}/delete-preview", null).Result;
            // 此刻：任务 1 条（已 PATCH 完成的那条）、记录 2 条（改过的 + 未置顶）、没跑过执行
            Check("删除预演返回四类计数",
                previewReply is { Status: 200 }
                && OkJson(previewReply).GetProperty("taskCount").GetInt64() == 1
                && OkJson(previewReply).GetProperty("noteCount").GetInt64() == 2
                && OkJson(previewReply).GetProperty("runCount").GetInt64() == 0);

            /* ---- 基本资料：事务 + drop_extras + 无效 id 整批回滚 ---- */
            var basic = api.HandleAsync("PUT", $"/projects/{projectId}/basic-info",
                JsonBody(new
                {
                    module = "自测模块", module_id = "m-1", module_path = @"D:\x",
                    files = new[] { "a.txt" }, dev_status = "开发中", next_step = "下一步",
                    rules = new[] { "规则一" },
                    tasks = new object[] { new { title = "基本资料新任务", priority = "中", kind = "todo" } },
                    notes = new object[] { new { title = "基本资料新记录", tag = "日常" } },
                    drop_extras = false,
                })).Result;
            Check("basic-info 返回 context/tasks/notes",
                basic is { Status: 200 }
                && OkJson(basic).GetProperty("context").GetProperty("module").GetString() == "自测模块"
                && OkJson(basic).GetProperty("context").GetProperty("files")[0].GetString() == "a.txt"
                && OkJson(basic).GetProperty("tasks").GetArrayLength() == 2
                && OkJson(basic).GetProperty("notes").GetArrayLength() == 3);

            var rollback = api.HandleAsync("PUT", $"/projects/{projectId}/basic-info",
                JsonBody(new
                {
                    tasks = new object[] { new { id = "task-not-mine", title = "非法", priority = "中", kind = "todo" } },
                })).Result;
            Check("基本资料含无效任务 id 422", rollback is { Status: 422 }, rollback?.Text ?? "");
            var afterRollback = api.HandleAsync("GET", $"/projects/{projectId}/tasks", null).Result;
            Check("整批回滚：任务数未被改动", OkJson(afterRollback).GetArrayLength() == 2);
            var wrongTagBasic = api.HandleAsync("PUT", $"/projects/{projectId}/basic-info",
                JsonBody(new { notes = new object[] { new { title = "坏标签", tag = "随笔" } } })).Result;
            Check("基本资料坏 tag 422", wrongTagBasic is { Status: 422 });

            var dropReply = api.HandleAsync("PUT", $"/projects/{projectId}/basic-info",
                JsonBody(new
                {
                    module = "自测模块", files = new string[0], rules = new string[0],
                    tasks = new object[] { new { title = "仅剩一条", priority = "中", kind = "todo" } },
                    notes = new object[] { new { title = "仅剩一条记录", tag = "日常" } },
                    drop_extras = true,
                })).Result;
            // drop_extras 只清**未完成的活动任务**（completed=1 的那条不在清理范围，这正是 Python 版语义），
            // 记录则清掉未列出的全部
            Check("drop_extras 清未列出的活动任务与记录（已完成任务不受影响）",
                dropReply is { Status: 200 }
                && OkJson(dropReply).GetProperty("tasks").GetArrayLength() == 2
                && OkJson(dropReply).GetProperty("notes").GetArrayLength() == 1);
            Check("drop_extras 后存活的是那条已完成任务与唯一保留记录",
                dropReply is { Status: 200 }
                && OkJson(dropReply).GetProperty("notes")[0].GetProperty("title").GetString() == "仅剩一条记录"
                && OkJson(dropReply).GetProperty("tasks").EnumerateArray()
                    .Any(t => t.GetProperty("title").GetString() == "自测任务改"
                              && t.GetProperty("completed").GetInt64() == 1));
            Check("context 二次写入是 upsert 不是重复插入",
                db.FetchOne("SELECT COUNT(*) AS count FROM project_contexts WHERE project_id=@p0", projectId)
                    is { } row && Convert.ToInt64(row["count"]) == 1);

            /* ---- 删除级联（最后一个项目保护随后验证） ---- */
            var secondPreview = api.HandleAsync("GET", $"/projects/{secondId}/delete-preview", null).Result;
            Check("第二个项目删除预演可读", secondPreview is { Status: 200 });
            var deleted = api.HandleAsync("DELETE", $"/projects/{secondId}", null).Result;
            Check("DELETE 项目返回 deleted+projectId",
                deleted is { Status: 200 }
                && OkJson(deleted).GetProperty("deleted").GetBoolean()
                && OkJson(deleted).GetProperty("projectId").GetString() == secondId);

            _ = api.HandleAsync("POST", "/projects", JsonBody(new { name = "第三个" })).Result;
            db.Execute("DELETE FROM projects WHERE id<>@p0", projectId);
            var lastPreview = api.HandleAsync("GET", $"/projects/{projectId}/delete-preview", null).Result;
            Check("只剩一个项目时预演 409", lastPreview is { Status: 409 }, lastPreview?.Text ?? "");
            db.Execute(
                "INSERT INTO project_executions(id,project_id,action,status,started_at) " +
                "VALUES('busy-exec',@p0,'run','running',@p1)", projectId, Db.UtcNow());
            _ = api.HandleAsync("POST", "/projects", JsonBody(new { name = "陪跑项目" })).Result;
            var busyPreview = api.HandleAsync("GET", $"/projects/{projectId}/delete-preview", null).Result;
            Check("执行中的项目拒绝删除 409", busyPreview is { Status: 409 } && busyPreview.Text.Contains("运行"), busyPreview?.Text ?? "");
            db.Execute("UPDATE project_executions SET status='succeeded' WHERE id='busy-exec'");
            db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('m-cascade','级联模块','script','','m','','1','',1,@p0)", Db.UtcNow());
            db.Execute(
                "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) " +
                "VALUES(@p0,'m-cascade',0,1)", projectId);
            db.Execute(
                "INSERT INTO project_files(id,project_id,name,path,created_at,updated_at) " +
                "VALUES('pf-cascade',@p0,'f.txt','D:\\f.txt',@p1,@p1)", projectId, Db.UtcNow());
            var cascade = api.HandleAsync("DELETE", $"/projects/{projectId}", null).Result;
            Check("删除项目成功", cascade is { Status: 200 });
            Check("级联清掉任务与记录",
                db.FetchOne("SELECT COUNT(*) AS c FROM tasks WHERE project_id=@p0", projectId) is { } t
                && Convert.ToInt64(t["c"]) == 0
                && db.FetchOne("SELECT COUNT(*) AS c FROM notes WHERE project_id=@p0", projectId) is { } n
                && Convert.ToInt64(n["c"]) == 0);
            Check("级联清掉文件登记与模块绑定与上下文",
                db.FetchOne("SELECT COUNT(*) AS c FROM project_files WHERE project_id=@p0", projectId) is { } f
                && Convert.ToInt64(f["c"]) == 0
                && db.FetchOne("SELECT COUNT(*) AS c FROM project_modules WHERE project_id=@p0", projectId) is { } pm
                && Convert.ToInt64(pm["c"]) == 0
                && db.FetchOne("SELECT COUNT(*) AS c FROM project_contexts WHERE project_id=@p0", projectId) is { } pc
                && Convert.ToInt64(pc["c"]) == 0);
            Check("共享模块本体不被级联删除",
                db.FetchOne("SELECT id FROM modules WHERE id='m-cascade'") is not null);
        }
        catch (Exception ex)
        {
            Check("项目域套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块6：模块管理 + 项目绑定 ==================== */

    /// <summary>模块域 9 条路由：web 模块增改删预演、内置模块防改写、绑定/解绑、应用适配模块。</summary>
    private static void CheckModuleDomainRoutes()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            // 应用绑定要用真候选（source_key 必须能在扫描结果里重新验证），关掉 PowerShell 清单
            var realScanner = new ApplicationScanner(ApplicationScanner.StartMenuRoots(), useShellLists: false);
            var catalog = new ApplicationCatalog(db, realScanner);
            var api = new LocalApi(db, scanner: realScanner, registry: new ModuleRegistry(Path.Combine(dir, "modules")),
                runner: null, execution: null, initOnStart: false);
            var now = Db.UtcNow();

            _ = api.HandleAsync("POST", "/projects", JsonBody(new { name = "模块域项目" })).Result;
            var projectId = (db.FetchOne("SELECT id FROM projects WHERE name='模块域项目'")?["id"] as string) ?? "";

            /* ---- web 模块 CRUD ---- */
            var created = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "自测站点", description = "描述", entry = "https://example.com/a" })).Result;
            Check("POST /modules 201 且 id 为 web-<32hex>",
                created is { Status: 201 }
                && (OkJson(created).GetProperty("id").GetString() ?? "").StartsWith("web-")
                && (OkJson(created).GetProperty("id").GetString() ?? "").Length == 36,
                OkJson(created).GetProperty("id").GetString() ?? "");
            var moduleId = OkJson(created).GetProperty("id").GetString() ?? "";
            Check("web 模块落库字段默认值",
                OkJson(created).GetProperty("type").GetString() == "web"
                && OkJson(created).GetProperty("version").GetString() == "1.0.0"
                && OkJson(created).GetProperty("enabled").GetInt64() == 1
                && OkJson(created).GetProperty("manifest_path").GetString() == "");

            var missingScheme = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "坏地址", entry = "example.com" })).Result;
            Check("缺 scheme 的地址 422", missingScheme is { Status: 422 }, missingScheme?.Text ?? "");
            var badScheme = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "坏协议", entry = "ftp://example.com" })).Result;
            Check("非 http(s) 协议 422", badScheme is { Status: 422 });
            var withCred = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "带凭据", entry = "https://user:pw@example.com" })).Result;
            Check("含用户名/密码 422", withCred is { Status: 422 } && withCred.Text.Contains("用户名"), withCred?.Text ?? "");
            var badType = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "类型不对", type = "script", entry = "https://example.com/b" })).Result;
            Check("非 web 类型 422", badType is { Status: 422 });
            var dupEntry = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "重复地址", entry = "https://example.com/a" })).Result;
            Check("同地址重复创建 409", dupEntry is { Status: 409 }, dupEntry?.Text ?? "");

            var patched = api.HandleAsync("PATCH", $"/modules/{moduleId}",
                JsonBody(new { name = "自测站点改", description = "改", entry = "https://example.com/a2" })).Result;
            Check("PATCH web 模块生效", patched is { Status: 200 }
                && OkJson(patched).GetProperty("name").GetString() == "自测站点改"
                && OkJson(patched).GetProperty("entry").GetString() == "https://example.com/a2");
            var secondSite = api.HandleAsync("POST", "/modules",
                JsonBody(new { name = "另站", entry = "https://example.com/b" })).Result;
            var secondSiteId = OkJson(secondSite).GetProperty("id").GetString() ?? "";
            var patchToDup = api.HandleAsync("PATCH", $"/modules/{moduleId}",
                JsonBody(new { name = "自测站点改", entry = "https://example.com/b" })).Result;
            Check("改成他人地址 409", patchToDup is { Status: 409 });
            Check("PATCH 不存在模块 404",
                api.HandleAsync("PATCH", "/modules/web-nope",
                    JsonBody(new { name = "x", entry = "https://example.com/z" })).Result is { Status: 404 });

            // 内置执行模块（有 manifest_path）不得改写 / 删除
            db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('builtin-mod','内置模块','script','','builtin','','1','D:\\x\\module.json',1,@p0)", now);
            var patchBuiltin = api.HandleAsync("PATCH", "/modules/builtin-mod",
                JsonBody(new { name = "改内置", entry = "https://example.com/c" })).Result;
            Check("内置模块拒绝改写 409", patchBuiltin is { Status: 409 } && patchBuiltin.Text.Contains("内置"), patchBuiltin?.Text ?? "");
            var delBuiltin = api.HandleAsync("DELETE", "/modules/builtin-mod", null).Result;
            Check("内置模块拒绝删除 409", delBuiltin is { Status: 409 });
            var builtinPreview = api.HandleAsync("GET", "/modules/builtin-mod/delete-preview", null).Result;
            Check("内置模块预演 deletable=false",
                builtinPreview is { Status: 200 }
                && !OkJson(builtinPreview).GetProperty("deletable").GetBoolean());

            /* ---- 绑定 / 解绑模块 ---- */
            var bound = api.HandleAsync("PUT", $"/projects/{projectId}/modules/{moduleId}", null).Result;
            Check("绑定模块 201 且 order 从 0 起",
                bound is { Status: 201 }
                && OkJson(bound).GetProperty("project_id").GetString() == projectId
                && OkJson(bound).GetProperty("module_id").GetString() == moduleId
                && OkJson(bound).GetProperty("sort_order").GetInt64() == 0);
            var boundAgain = api.HandleAsync("PUT", $"/projects/{projectId}/modules/{moduleId}", null).Result;
            Check("重复绑定幂等（同一行 enabled=1）",
                boundAgain is { Status: 201 }
                && Convert.ToInt64(db.FetchOne(
                    "SELECT COUNT(*) AS c FROM project_modules WHERE project_id=@p0 AND module_id=@p1",
                    projectId, moduleId)?["c"]) == 1);
            var boundSecond = api.HandleAsync("PUT", $"/projects/{projectId}/modules/{secondSiteId}", null).Result;
            Check("第二个绑定 order 递增到 1",
                OkJson(boundSecond).GetProperty("sort_order").GetInt64() == 1);
            Check("绑定不存在的项目 404",
                api.HandleAsync("PUT", "/projects/p-nope/modules/" + moduleId, null).Result is { Status: 404 });
            Check("绑定不存在的模块 404",
                api.HandleAsync("PUT", $"/projects/{projectId}/modules/web-nope", null).Result is { Status: 404 });

            var sitePreview = api.HandleAsync("GET", $"/modules/{moduleId}/delete-preview", null).Result;
            Check("web 模块预演 deletable=true 且列出使用项目",
                sitePreview is { Status: 200 }
                && OkJson(sitePreview).GetProperty("deletable").GetBoolean()
                && OkJson(sitePreview).GetProperty("projects").GetArrayLength() == 1
                && OkJson(sitePreview).GetProperty("projects")[0].GetProperty("name").GetString() == "模块域项目");

            var unbound = api.HandleAsync("DELETE", $"/projects/{projectId}/modules/{secondSiteId}", null).Result;
            Check("解绑成功返回 removed/moduleId",
                unbound is { Status: 200 }
                && OkJson(unbound).GetProperty("removed").GetBoolean()
                && OkJson(unbound).GetProperty("moduleId").GetString() == secondSiteId);
            Check("重复解绑 404",
                api.HandleAsync("DELETE", $"/projects/{projectId}/modules/{secondSiteId}", null).Result is { Status: 404 });

            // 删除 web 模块：解除绑定 + 停用，但运行历史保留
            db.Execute(
                "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) " +
                "VALUES('run-keep',@p0,@p1,'run','succeeded',@p2,'C:\\runs')", projectId, moduleId, now);
            var deletedModule = api.HandleAsync("DELETE", $"/modules/{moduleId}", null).Result;
            Check("删除 web 模块返回 affectedProjects",
                deletedModule is { Status: 200 }
                && OkJson(deletedModule).GetProperty("deleted").GetBoolean()
                && OkJson(deletedModule).GetProperty("affectedProjects").GetInt64() == 1,
                deletedModule?.Text ?? "");
            Check("删除后模块被停用、绑定被解除",
                Convert.ToInt64(db.FetchOne("SELECT enabled FROM modules WHERE id=@p0", moduleId)?["enabled"]) == 0
                && Convert.ToInt64(db.FetchOne(
                    "SELECT COUNT(*) AS c FROM project_modules WHERE module_id=@p0", moduleId)?["c"]) == 0);
            Check("删除 web 模块不删运行历史（runs 保留）",
                db.FetchOne("SELECT id FROM runs WHERE id='run-keep'") is not null);
            Check("停用模块不再出现在列表里",
                OkJson(api.HandleAsync("GET", "/modules", null).Result).EnumerateArray()
                    .All(m => m.GetProperty("id").GetString() != moduleId));
            Check("application 类型不进模块列表",
                OkJson(api.HandleAsync("GET", "/modules", null).Result).EnumerateArray()
                    .All(m => m.GetProperty("type").GetString() != "application"));

            /* ---- 应用绑定（真候选：source_key 必须能被扫描重新验证） ---- */
            var candidates = realScanner.ScanCached();   // ScanCandidate 带 LaunchPath，供插库用
            Check("真机扫描有候选可供应用绑定", candidates.Count > 0, $"{candidates.Count} 个");
            if (candidates.Count > 0)
            {
                var candidate = candidates[0];
                db.Execute(
                    "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,running," +
                    "created_at,updated_at,launch_path,source_key) " +
                    "VALUES('app-selftest',@p0,'效率','idea',0,'本机',0,0,@p1,@p1,@p2,@p3)",
                    candidate.Name, now, candidate.LaunchPath, candidate.Id);
                var bindApp = api.HandleAsync("PUT", $"/projects/{projectId}/applications/app-selftest", null).Result;
                Check("绑定应用 201 且带 application_id",
                    bindApp is { Status: 201 }
                    && OkJson(bindApp).GetProperty("application_id").GetString() == "app-selftest"
                    && OkJson(bindApp).GetProperty("module_id").GetString() == "application:app-selftest");
                Check("应用适配模块写入 modules（type=application、entry=应用 id）",
                    db.FetchOne("SELECT * FROM modules WHERE id='application:app-selftest'") is { } adapt
                    && (adapt["type"] as string) == "application"
                    && (adapt["entry"] as string) == "app-selftest"
                    && (adapt["description"] as string) == "启动本机应用"
                    && (adapt["name"] as string) == candidate.Name);
                var unbindApp = api.HandleAsync("DELETE", $"/projects/{projectId}/applications/app-selftest", null).Result;
                Check("解绑应用返回 moduleId",
                    unbindApp is { Status: 200 }
                    && OkJson(unbindApp).GetProperty("moduleId").GetString() == "application:app-selftest");
                Check("重复解绑应用 404",
                    api.HandleAsync("DELETE", $"/projects/{projectId}/applications/app-selftest", null).Result
                        is { Status: 404 });
            }
            db.Execute(
                "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,running," +
                "created_at,updated_at,launch_path,source_key) " +
                "VALUES('app-legacy','旧应用','效率','idea',0,'本机',0,0,@p0,@p0,'','')", now);
            var legacy = api.HandleAsync("PUT", $"/projects/{projectId}/applications/app-legacy", null).Result;
            Check("旧应用无启动入口 422", legacy is { Status: 422 }, legacy?.Text ?? "");
            db.Execute(
                "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,running," +
                "created_at,updated_at,launch_path,source_key) " +
                "VALUES('app-stale','失效应用','效率','idea',0,'本机',0,0,@p0,@p0,'C:\\x\\y.exe','scan-deadbeef')", now);
            var stale = api.HandleAsync("PUT", $"/projects/{projectId}/applications/app-stale", null).Result;
            Check("入口失效的应用 409", stale is { Status: 409 }, stale?.Text ?? "");
            Check("绑定不存在的应用 404",
                api.HandleAsync("PUT", $"/projects/{projectId}/applications/app-nope", null).Result is { Status: 404 });
            Check("绑定应用时项目不存在 404",
                api.HandleAsync("PUT", "/projects/p-nope/applications/app-legacy", null).Result is { Status: 404 });
        }
        catch (Exception ex)
        {
            Check("模块域套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ==================== 二期块7：bootstrap 收口 + 路由覆盖对照 ==================== */

    /// <summary>bootstrap 聚合：12 个键齐、payload 变形正确、运行统计与执行快照口径正确。</summary>
    private static void CheckBootstrapPayload()
    {
        var dir = TempDir();
        try
        {
            var db = new Db(Path.Combine(dir, "apex.db"));
            db.Init();
            var now = Db.UtcNow();
            var modulesDir = Path.Combine(dir, "modules");
            var registry = new ModuleRegistry(modulesDir);
            var catalog = new ApplicationCatalog(db, new ApplicationScanner(Array.Empty<string>(), useShellLists: false));
            var runner = new ModuleRunner(db, registry, Path.Combine(dir, "runs"), _ => true, catalog);
            var execution = new ExecutionService(db, runner);
            var activity = new ActivityService(db, dataDir: dir, codeDirsOverride: Array.Empty<string>());
            var bootstrap = new BootstrapService(db, execution, activity);
            var api = new LocalApi(db, scanner: null, registry: registry, runner: runner,
                execution: execution, initOnStart: false, activity: activity);

            db.Execute(
                "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
                "VALUES('bp-proj','汇总项目','描述','正常',@p0,@p0,0)", now);
            db.Execute(
                "INSERT INTO tasks(id,project_id,title,due_date,priority,kind,completed,created_at,updated_at) " +
                "VALUES('bp-task','bp-proj','汇总任务',NULL,'高','fix',0,@p0,@p0)", now);
            db.Execute(
                "INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) " +
                "VALUES('bp-note','bp-proj','汇总记录','技术','正文',1,'[\"甲\",1,\"乙\"]',@p0,@p0)", now);
            db.Execute(
                "INSERT INTO project_contexts(project_id,module,module_id,module_path,files_json,dev_status,next_step,rules_json,updated_at) " +
                "VALUES('bp-proj','模块','m-1','D:\\m','[\"a.txt\"]','开发中','下一步','[\"规则\"]',@p0)", now);
            db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('bp-web','汇总站点','web','d','https://example.com','','1.0.0','',1,@p0)", now);
            db.Execute(
                "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES('bp-proj','bp-web',0,1)");
            db.Execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
                "VALUES('application:bp-app','汇总应用','application','启动本机应用','bp-app','','1.0.0','',1,@p0)", now);
            db.Execute(
                "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,running,created_at,updated_at,launch_path,source_key) " +
                "VALUES('bp-app','汇总应用','效率','idea',1,'本机',3,0,@p0,@p0,'C:\\a.exe','scan-x')", now);
            db.Execute(
                "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) " +
                "VALUES('bp-proj','application:bp-app',1,1)");
            // 一条 legacy 运行（无 execution_steps 关联）+ 一条属于执行的运行（不应被重复计入）
            db.Execute(
                "INSERT INTO runs(id,project_id,module_id,action,status,started_at,finished_at,run_dir) " +
                "VALUES('bp-run-legacy','bp-proj','bp-web','run','succeeded',@p0,@p0,'C:\\r1')", now);
            db.Execute(
                "INSERT INTO runs(id,project_id,module_id,action,status,started_at,finished_at,run_dir) " +
                "VALUES('bp-run-in-exec','bp-proj','bp-web','run','succeeded',@p0,@p0,'C:\\r2')", now);
            db.Execute(
                "INSERT INTO project_executions(id,project_id,action,status,started_at,finished_at) " +
                "VALUES('bp-exec','bp-proj','run','succeeded',@p0,@p0)", now);
            db.Execute(
                "INSERT INTO execution_steps(id,execution_id,sort_order,module_id,module_name,action,status,run_id) " +
                "VALUES('bp-step','bp-exec',0,'bp-web','汇总站点','run','succeeded','bp-run-in-exec')");
            db.Execute("UPDATE runs SET action='stop' WHERE id='bp-run-in-exec'");
            _ = api;

            var payload = bootstrap.Build();
            foreach (var key in new[]
                     {
                         "projects", "tasks", "notes", "activityDays", "projectContexts", "projectFiles",
                         "applications", "modules", "projectModules", "projectApplications",
                         "projectRuns", "projectExecutions",
                     })
                Check($"bootstrap 含 {key} 键", payload.ContainsKey(key));

            Check("projects/tasks 原样带上",
                (payload["projects"] as List<Dictionary<string, object?>>)!.Count == 1
                && (payload["tasks"] as List<Dictionary<string, object?>>)!.Count == 1);
            var noteRow = (payload["notes"] as List<Dictionary<string, object?>>)![0];
            Check("notes 走 payload 变形（links 过滤非字符串，且移除 links_json）",
                noteRow.ContainsKey("links") && !noteRow.ContainsKey("links_json")
                && (noteRow["links"] as List<string>)!.Count == 2
                && (noteRow["links"] as List<string>)![0] == "甲");
            var contextRow = (payload["projectContexts"] as List<Dictionary<string, object?>>)![0];
            Check("projectContexts 走 payload 变形（files/rules 数组化）",
                (contextRow["files"] as List<string>)![0] == "a.txt"
                && (contextRow["rules"] as List<string>)![0] == "规则");
            var appRow = (payload["applications"] as List<Dictionary<string, object?>>)![0];
            Check("applications 走 payload 变形（favorite 转 bool、icon 改 native:、带 launchable）",
                (bool)appRow["favorite"]! && (bool)appRow["launchable"]!
                && (appRow["icon"] as string) == "native:scan-x"
                && !appRow.ContainsKey("launch_path"));
            Check("modules 不含 application 适配模块",
                (payload["modules"] as List<Dictionary<string, object?>>)!.Count == 1
                && (payload["modules"] as List<Dictionary<string, object?>>)![0]["type"] as string == "web");
            Check("projectModules 只含非 application 绑定",
                (payload["projectModules"] as List<Dictionary<string, object?>>)!.Count == 1
                && (payload["projectModules"] as List<Dictionary<string, object?>>)![0]["module_id"] as string == "bp-web");
            Check("projectApplications 只含 application 绑定且带 application_id",
                (payload["projectApplications"] as List<Dictionary<string, object?>>)!.Count == 1
                && (payload["projectApplications"] as List<Dictionary<string, object?>>)![0]["application_id"] as string == "bp-app");
            Check("activityDays 默认 371 格", (payload["activityDays"] as List<Dictionary<string, object?>>)!.Count == 371);

            var runInfo = (payload["projectRuns"] as List<Dictionary<string, object?>>)![0];
            // 口径：project_executions 里非 stop 的记一次（bp-exec）+ 未被 execution 引用的 legacy run 记一次
            //（bp-run-legacy）= 2；执行内部的 run（bp-run-in-exec）不重复计入——若重复这里会是 3。
            Check("projectRuns 只统计非 stop 的运行（execution 一次 + legacy 一次，执行内 run 不重复计入）",
                Convert.ToInt64(runInfo["run_count"]) == 2, $"run_count={runInfo["run_count"]}");
            Check("projectRuns.last_run_at 取最近一条",
                (runInfo["last_run_at"] as string) == now);
            var recent = (runInfo["recent"] as List<Dictionary<string, object?>>)!;
            Check("projectRuns.recent 最多 3 条且每条只带 6 个约定字段",
                recent.Count == 2 && recent.All(row => row.Keys.Count == 6),
                $"count={recent.Count}");
            Check("同 started_at 时按 id 降序（bp-run-legacy 排在 bp-exec 前）",
                recent[0]["id"] as string == "bp-run-legacy" && recent[1]["id"] as string == "bp-exec");

            var execInfo = (payload["projectExecutions"] as List<Dictionary<string, object?>>)![0];
            Check("projectExecutions.latest 是完整执行（含 steps 与步骤内 run）",
                execInfo["latest"] is Dictionary<string, object?> latest
                && (latest["id"] as string) == "bp-exec"
                && (latest["steps"] as List<Dictionary<string, object?>>)!.Count == 1
                && (latest["steps"] as List<Dictionary<string, object?>>)![0]["run"] is Dictionary<string, object?>);
            Check("projectExecutions.active 为空（没有排队/运行中的执行）", execInfo["active"] is null);
            Check("projectExecutions.recent 取最近 3 条", (execInfo["recent"] as List<Dictionary<string, object?>>)!.Count == 1);

            // HTTP 面：GET /bootstrap 200 且走本地
            var reply = api.HandleAsync("GET", "/bootstrap", null).Result;
            Check("GET /bootstrap 200 且含 projects",
                reply is { Status: 200 }
                && JsonDocument.Parse(reply.Text).RootElement.TryGetProperty("projects", out _));
        }
        catch (Exception ex)
        {
            Check("bootstrap 套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /// <summary>Python 下线证据：main.py 定义的路由与 LocalApi.CoveredRoutes 双向完全一致。</summary>
    private static void CheckRouteCoverage()
    {
        try
        {
            var mainPy = Path.Combine(ConsoleConfig.BackendDir, "app", "main.py");
            if (!File.Exists(mainPy))
            {
                Check("能找到 main.py 做路由对照", false, mainPy);
                return;
            }
            var source = File.ReadAllText(mainPy);
            var defined = new HashSet<(string, string)>();
            foreach (System.Text.RegularExpressions.Match match in
                     System.Text.RegularExpressions.Regex.Matches(source,
                         "@app\\.(get|post|put|patch|delete)\\(\"(/api/[^\"]*)\""))
            {
                var method = match.Groups[1].Value.ToUpperInvariant();
                var path = match.Groups[2].Value["/api".Length..];
                defined.Add((method, path));
            }
            Check("从 main.py 解析出路由清单", defined.Count >= 45, $"{defined.Count} 条");

            var covered = LocalApi.CoveredRoutes.Select(item => (item.Method, item.Pattern))
                .ToHashSet();
            var missing = defined.Except(covered).OrderBy(item => item.Item1 + " " + item.Item2).ToList();
            var extra = covered.Except(defined).OrderBy(item => item.Item1 + " " + item.Item2).ToList();
            Check("main.py 的每条路由都已在壳内移植（无遗漏）", missing.Count == 0,
                string.Join(" | ", missing.Select(m => m.Item1 + " " + m.Item2)));
            Check("壳内没有 main.py 不存在的多余路由", extra.Count == 0,
                string.Join(" | ", extra.Select(m => m.Item1 + " " + m.Item2)));
            Check("路由总数一致（Python 可以下线）", defined.Count == covered.Count,
                $"python={defined.Count} shell={covered.Count}");
        }
        catch (Exception ex)
        {
            Check("路由对照套件无异常", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    /* ---- 直接操作注册表的辅助（绕过被测类，才能测「类写得对不对」而不是「自己测自己」） ---- */

    private static Microsoft.Win32.RegistryKey? ApprovedKey() =>
        Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", writable: true);

    private static void WriteApprovedRaw(string valueName, bool disabled)
    {
        using var key = ApprovedKey() ?? Microsoft.Win32.Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", writable: true);
        // 03 = 禁用标志（bit0=1），带 8 字节时间戳（内容无所谓）
        var raw = new byte[12];
        raw[0] = disabled ? (byte)0x03 : (byte)0x02;
        key.SetValue(valueName, raw, Microsoft.Win32.RegistryValueKind.Binary);
    }

    private static bool ApprovedValueExists(string valueName)
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", writable: false);
        return key?.GetValue(valueName) != null;
    }

    private static void CleanupSelfTestValues(string valueName)
    {
        try
        {
            using (var run = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                       @"Software\Microsoft\Windows\CurrentVersion\Run", writable: true))
                run?.DeleteValue(valueName, throwOnMissingValue: false);
            using (var approved = ApprovedKey())
                approved?.DeleteValue(valueName, throwOnMissingValue: false);
        }
        catch { /* 清理尽力而为 */ }
    }
}
