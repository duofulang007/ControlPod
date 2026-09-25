using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace ApexShell;

/// <summary>
/// 二期本地 API 分发器：WebMessage 桥里「已移植到 C# 的路由」直接本地作答，
/// 未移植的路由返回 null 交回 MainWindow 继续代理 Python 8765。
/// 路径口径与 app.js 一致：JS 发来的 path 不带 /api 前缀（如 /settings/startup）。
/// 每移植一块就在这里加路由；全部对齐后 Python 整体下线（见 AGENTS.md 二期顺序）。
/// </summary>
public sealed class LocalApi
{
    public sealed record Reply(int Status, string Text);

    /// <summary>
    /// 已移植到壳里的全部路由（Python 路径口径，含 {param}）。
    /// 这是「Python 可以下线」的声明式证据：自测 `routes` 阶段会把 main.py 里
    /// 实际定义的路由与这份清单做**双向**比对，任何一边多出来都会失败。
    /// 新增路由时必须同步补这里，否则自测会拦下。
    /// </summary>
    public static readonly (string Method, string Pattern)[] CoveredRoutes =
    {
        ("GET", "/health"),
        ("GET", "/settings/startup"),
        ("PUT", "/settings/startup"),
        ("GET", "/window"),
        ("PUT", "/window/topmost"),
        ("GET", "/activity/daily"),
        ("POST", "/activity/heartbeat"),
        ("GET", "/bootstrap"),
        // applications（图标路由由 MainWindow 的 WebResourceRequested 在网络栈上拦截，不经 WebMessage 桥）
        ("GET", "/applications"),
        ("GET", "/applications/scan"),
        ("GET", "/applications/scan/{scan_id}/icon"),
        ("POST", "/applications/from-scan"),
        ("PATCH", "/applications/{app_id}"),
        ("POST", "/applications/{app_id}/launch"),
        ("DELETE", "/applications/{app_id}"),
        // 执行（块3）
        ("POST", "/projects/{project_id}/executions"),
        ("GET", "/executions/{execution_id}"),
        ("POST", "/projects/{project_id}/run"),
        ("POST", "/projects/{project_id}/stop"),
        ("POST", "/projects/{project_id}/restart"),
        ("GET", "/projects/{project_id}/runtime"),
        ("GET", "/runs/{run_id}"),
        // 项目 / 任务 / 记录 / 文件 / 基本资料（块5）
        ("GET", "/projects"),
        ("POST", "/projects"),
        ("PUT", "/projects/order"),
        ("PATCH", "/projects/{project_id}"),
        ("GET", "/projects/{project_id}/delete-preview"),
        ("DELETE", "/projects/{project_id}"),
        ("GET", "/projects/{project_id}/files"),
        ("POST", "/projects/{project_id}/files"),
        ("GET", "/project-files/{file_id}/delete-preview"),
        ("DELETE", "/project-files/{file_id}"),
        ("POST", "/project-files/{file_id}/open"),
        ("GET", "/projects/{project_id}/tasks"),
        ("POST", "/projects/{project_id}/tasks"),
        ("PATCH", "/tasks/{task_id}"),
        ("DELETE", "/tasks/{task_id}"),
        ("GET", "/projects/{project_id}/notes"),
        ("POST", "/projects/{project_id}/notes"),
        ("PATCH", "/notes/{note_id}"),
        ("DELETE", "/notes/{note_id}"),
        ("PUT", "/projects/{project_id}/basic-info"),
        // 模块管理 + 项目绑定（块6）
        ("GET", "/modules"),
        ("POST", "/modules"),
        ("PATCH", "/modules/{module_id}"),
        ("GET", "/modules/{module_id}/delete-preview"),
        ("DELETE", "/modules/{module_id}"),
        ("PUT", "/projects/{project_id}/modules/{module_id}"),
        ("DELETE", "/projects/{project_id}/modules/{module_id}"),
        ("PUT", "/projects/{project_id}/applications/{application_id}"),
        ("DELETE", "/projects/{project_id}/applications/{application_id}"),
    };

    /// <summary>请求体参数校验失败（pydantic ValidationError 的等价物）→ 422。</summary>
    public sealed class RequestInvalidError : Exception
    {
        public RequestInvalidError(string message) : base(message) { }
    }

    private readonly StartupManager _startup = new();
    private readonly Db _db;
    private readonly ApplicationCatalog _catalog;
    private readonly ModuleRegistry _registry;
    private readonly ModuleRunner _runner;
    private readonly ExecutionService _execution;
    private readonly IConsoleWindowHost _windowHost;
    private readonly ActivityService _activity;
    private readonly ProjectService _projects;
    private readonly ModuleService _modules;
    private readonly BootstrapService _bootstrap;

    /// <summary>全部依赖可注入（自测）；生产默认按 ConsoleConfig 装配，
    /// web 打开走真 ShellExecute、应用启动复用 catalog。initOnStart=false 供自测
    /// 手工控制 SyncRegistry / RecoverInterrupted 的时机。windowHost 缺省为「不可用」桩
    /// （无窗口进程下 /window 如实报 available:false，与 Python 版扫不到窗口同语义）。</summary>
    public LocalApi(Db? db = null, ApplicationScanner? scanner = null,
        ModuleRegistry? registry = null, ModuleRunner? runner = null,
        ExecutionService? execution = null, bool initOnStart = true,
        Func<string, bool>? webOpener = null, IConsoleWindowHost? windowHost = null,
        ActivityService? activity = null, ProjectService? projectService = null,
        ModuleService? moduleService = null)
    {
        _db = db ?? new Db(ConsoleConfig.DbPath);
        _catalog = new ApplicationCatalog(_db, scanner);
        _registry = registry ?? new ModuleRegistry(ConsoleConfig.ModulesDir);
        _runner = runner ?? new ModuleRunner(_db, _registry, ConsoleConfig.RunsDir,
            webOpener: webOpener, applicationCatalog: _catalog);
        _execution = execution ?? new ExecutionService(_db, _runner);
        _windowHost = windowHost ?? new UnavailableWindowHost();
        _activity = activity ?? new ActivityService(_db);
        _projects = projectService ?? new ProjectService(_db);
        _modules = moduleService ?? new ModuleService(_db, _catalog);
        _bootstrap = new BootstrapService(_db, _execution, _activity);
        if (initOnStart && execution is null)
        {
            _db.Init();   // 生产语义与 main.py 一致：先 init 再同步/回收
            _registry.Load();
            _runner.SyncRegistry();
            _execution.RecoverInterrupted();
        }
    }

    /// <summary>无窗口宿主（自测/无窗口进程）：如实报不可用，不假装成功。</summary>
    private sealed class UnavailableWindowHost : IConsoleWindowHost
    {
        public Dictionary<string, object?> Status() => new()
        {
            ["available"] = false, ["topmost"] = false, ["width"] = 990, ["height"] = 700,
        };

        public Dictionary<string, object?> SetTopmost(bool enabled) =>
            throw new ConsoleWindowError("没有可控制的 APEX 固定窗口，请先打开固定窗口");
    }

    public async Task<Reply?> HandleAsync(string method, string path, string? body)
    {
        // 剥掉可能带的 /api 前缀与查询串，统一成 "/settings/startup" 形态；query 单独留给需要它的路由
        var route = path;
        var query = "";
        var q = route.IndexOf('?');
        if (q >= 0)
        {
            query = route[(q + 1)..];
            route = route[..q];
        }
        if (route.StartsWith("/api/", StringComparison.Ordinal)) route = route["/api".Length..];

        try
        {
            // 首屏聚合是重查询（多表 + 执行快照），单独甩线程池
            if (route == "/bootstrap")
                return await Task.Run(() => new Reply(200, Json(_bootstrap.Build()))).ConfigureAwait(false);

            // applications 组涉及真扫描、其余业务组涉及子进程/多表写，都甩到线程池避免冻 UI。
            // ConfigureAwait(false)：类库不捕获调用方上下文——自测在 UI 线程用 .Result 等待，
            // 默认延续要回 UI 线程而 UI 正被阻塞，会死锁（catalog 阶段首条就挂住的根因）。
            if (route.StartsWith("/applications", StringComparison.Ordinal)
                || route.StartsWith("/projects", StringComparison.Ordinal)
                || route.StartsWith("/executions", StringComparison.Ordinal)
                || route.StartsWith("/runs", StringComparison.Ordinal)
                || route.StartsWith("/tasks", StringComparison.Ordinal)
                || route.StartsWith("/notes", StringComparison.Ordinal)
                || route.StartsWith("/project-files", StringComparison.Ordinal)
                || route.StartsWith("/modules", StringComparison.Ordinal))
            {
                return await Task.Run(() => route.StartsWith("/applications", StringComparison.Ordinal)
                    ? DispatchApplications(method, route, body)
                    : DispatchProjectDomain(method, route, body)).ConfigureAwait(false);
            }
            return await DispatchAsync(method, route, query, body).ConfigureAwait(false);
        }
        catch (ApplicationScanError ex)
        {
            return Error(503, ex.Message);
        }
        catch (ApplicationNotFound ex)
        {
            return Error(404, ex.Message);
        }
        catch (ApplicationInvalid ex)
        {
            return Error(422, ex.Message);
        }
        catch (ApplicationConflict ex)
        {
            return Error(409, ex.Message);
        }
        catch (ApplicationLaunchFailed ex)
        {
            return Error(500, "无法启动应用：" + ex.Message);
        }
        catch (Exception ex) when (ex is ModuleMissingError or ExecutionMissingError)
        {
            return Error(404, ex.Message);
        }
        catch (Exception ex) when (ex is ModuleInvalidError or ExecutionInvalidError)
        {
            return Error(422, ex.Message);
        }
        catch (Exception ex) when (ex is ModuleBusyError or ExecutionBusyError)
        {
            return Error(409, ex.Message);
        }
        catch (ModuleRegistryError ex)
        {
            return Error(500, "模块清单加载失败：" + ex.Message);
        }
        catch (ConsoleWindowError ex)
        {
            return Error(503, ex.Message);
        }
        catch (Exception ex) when (ex is ProjectMissingError or TaskMissingError or NoteMissingError)
        {
            return Error(404, ex.Message);
        }
        catch (ProjectConflictError ex)
        {
            return Error(409, ex.Message);
        }
        catch (Exception ex) when (ex is BasicInfoInvalidError or ProjectOrderInvalidError
            or ProjectFileInvalidError or RequestInvalidError)
        {
            return Error(422, ex.Message);
        }
        catch (ModuleDomainMissingError ex)
        {
            return Error(404, ex.Message);
        }
        catch (ModuleDomainConflictError ex)
        {
            return Error(409, ex.Message);
        }
        catch (StartupRegistrationError ex)
        {
            return Error(503, ex.Message);
        }
        catch (Exception ex)
        {
            return Error(500, "本地服务出错：" + ex.Message);
        }
    }

    /// <summary>main.py 的执行类路由组（块3）。未匹配的路径返回 null 走 Python 代理。</summary>
    private Reply? DispatchExecutions(string method, string route, string? body)
    {
        var segments = route.Split('/', StringSplitOptions.RemoveEmptyEntries);

        // POST /projects/{id}/executions | run | stop | restart → 202
        if (method == "POST" && segments.Length == 3 && segments[0] == "projects")
        {
            var action = segments[2] switch
            {
                "run" => "run",
                "stop" => "stop",
                "restart" => "restart",
                "executions" => ParseActionFromBody(body),
                _ => null,
            };
            if (action is null) return null;   // 其它 POST /projects/... 未移植
            return new Reply(202, Json(_execution.Start(segments[1], action)));
        }

        // GET /projects/{id}/runtime
        if (method == "GET" && segments.Length == 3 && segments[0] == "projects" && segments[2] == "runtime")
            return ProjectRuntime(segments[1]);

        // GET /executions/{id}
        if (method == "GET" && segments.Length == 2 && segments[0] == "executions")
        {
            var execution = _execution.GetExecution(segments[1]);
            return execution is null ? Error(404, "项目执行记录不存在") : new Reply(200, Json(execution));
        }

        // GET /runs/{run_id}（旧页面还在轮询的 legacy 入口）
        if (method == "GET" && segments.Length == 2 && segments[0] == "runs")
        {
            var run = _runner.GetRun(segments[1]) ?? _execution.LegacyRunPayload(segments[1]);
            return run is null ? Error(404, "运行记录不存在") : new Reply(200, Json(run));
        }
        return null;
    }

    /// <summary>pydantic ProjectExecutionRequest 的等价校验：缺省 run，非法值 422。</summary>
    private static string ParseActionFromBody(string? body)
    {
        if (string.IsNullOrEmpty(body)) return "run";
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("action", out var a)
                && a.ValueKind == JsonValueKind.String)
            {
                var value = a.GetString()!;
                if (value is "run" or "stop" or "restart") return value;
            }
        }
        catch (JsonException) { /* 落到下面的 422 */ }
        throw new ExecutionInvalidError("不支持的项目动作");
    }

    /// <summary>main.py project_runtime 逐条复刻：state 只认 result.status.state 的 running/stopped。</summary>
    private Reply ProjectRuntime(string projectId)
    {
        if (_db.FetchOne("SELECT id FROM projects WHERE id=@p0", projectId) is null)
            return Error(404, "项目不存在");
        var latest = _db.FetchOne(
            "SELECT id FROM runs WHERE project_id=@p0 AND status='succeeded' " +
            "ORDER BY finished_at DESC, id DESC LIMIT 1", projectId);
        if (latest is null)
            return new Reply(200, Json(new Dictionary<string, object?>
            {
                ["state"] = "unknown", ["runId"] = null, ["action"] = null,
            }));
        var run = _runner.GetRun((latest.GetValueOrDefault("id") as string)!) ?? new Dictionary<string, object?>();
        var result = run.GetValueOrDefault("result") as JsonElement?;
        var state = "unknown";
        // Nullable 属性模式：模式直接作用在解包后的 JsonElement 上，wrapper 绑定即为 JsonElement
        if (result is { ValueKind: JsonValueKind.Object } wrapper
            && wrapper.TryGetProperty("status", out var stEl) && stEl.ValueKind == JsonValueKind.Object
            && stEl.TryGetProperty("state", out var stateEl) && stateEl.ValueKind == JsonValueKind.String
            && stateEl.GetString() is { } s and ("running" or "stopped"))
            state = s;
        return new Reply(200, Json(new Dictionary<string, object?>
        {
            ["state"] = state,
            ["runId"] = run.GetValueOrDefault("id"),
            ["action"] = run.GetValueOrDefault("action"),
        }));
    }

    /// <summary>main.py /api/applications* 路由组。未匹配的 applications 子路径返回 null 走 Python 代理。</summary>
    private Reply? DispatchApplications(string method, string route, string? body)
    {
        if (method == "GET" && route == "/applications")
            return new Reply(200, Json(_catalog.List()));

        if (method == "GET" && route == "/applications/scan")
            return new Reply(200, Json(_catalog.Scan()));

        if (method == "POST" && route == "/applications/from-scan")
        {
            using var payloadDoc = ParseJson(body);
            var payload = payloadDoc?.RootElement ?? default;
            if (payloadDoc is null
                || !payload.TryGetProperty("scan_id", out var scanIdEl)
                || scanIdEl.GetString() is not { Length: > 0 } scanId
                || !System.Text.RegularExpressions.Regex.IsMatch(scanId, "^scan-[a-f0-9]+$"))
                return Error(422, "scan_id 必须是 scan- 开头的十六进制扫描 ID");
            string? name = payload.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String
                ? n.GetString() : null;
            string? category = payload.TryGetProperty("category", out var c) && c.ValueKind == JsonValueKind.String
                ? c.GetString() : null;
            return new Reply(201, Json(_catalog.CreateFromScan(scanId, name, category)));
        }

        // /applications/{id} 与 /applications/{id}/launch —— scan 静态段已被上面的分支吃掉
        var segments = route.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length >= 2 && segments[0] == "applications" && segments[1] != "scan")
        {
            var appId = segments[1];
            if (method == "PATCH" && segments.Length == 2)
            {
                using var payloadDoc = ParseJson(body);
                if (payloadDoc is null) return Error(422, "请求体必须是 JSON 对象");
                var payload = payloadDoc.RootElement;
                if (!payload.TryGetProperty("name", out var nameEl) || nameEl.ValueKind != JsonValueKind.String
                    || nameEl.GetString() is not { Length: > 0 } name || name.Length > 120)
                    return Error(422, "name 必须是 1-120 个字符");
                if (!payload.TryGetProperty("category", out var catEl) || catEl.ValueKind != JsonValueKind.String
                    || catEl.GetString() is not { Length: > 0 } category || category.Length > 80)
                    return Error(422, "category 必须是 1-80 个字符");
                var icon = payload.TryGetProperty("icon", out var iconEl) && iconEl.ValueKind == JsonValueKind.String
                    ? iconEl.GetString()! : "idea";
                if (icon.Length > 80) return Error(422, "icon 最长 80 个字符");
                var sizeLabel = payload.TryGetProperty("size_label", out var slEl) && slEl.ValueKind == JsonValueKind.String
                    ? slEl.GetString()! : "—";
                var useCount = payload.TryGetProperty("use_count", out var ucEl) && ucEl.TryGetInt64(out var uc) ? uc : 0;
                if (useCount < 0) return Error(422, "use_count 不能为负数");
                var lastOpenedAt = payload.TryGetProperty("last_opened_at", out var loEl)
                    && loEl.ValueKind == JsonValueKind.String ? loEl.GetString() : null;
                var running = payload.TryGetProperty("running", out var rEl) && rEl.ValueKind == JsonValueKind.True;
                var favorite = payload.TryGetProperty("favorite", out var fEl) && fEl.ValueKind == JsonValueKind.True;
                return new Reply(200, Json(_catalog.Update(appId, name, category, icon, favorite,
                    sizeLabel, useCount, lastOpenedAt, running)));
            }
            if (method == "POST" && segments.Length == 3 && segments[2] == "launch")
                return new Reply(200, Json(_catalog.Launch(appId)));
            if (method == "DELETE" && segments.Length == 2)
                return new Reply(200, Json(_catalog.Delete(appId)));
        }
        return null; // 未移植 → 走 Python 代理
    }

    private static JsonDocument? ParseJson(string? body)
    {
        if (string.IsNullOrEmpty(body)) return null;
        try { return JsonDocument.Parse(body); }
        catch (JsonException) { return null; }
    }

    /// <summary>给 MainWindow 的图标 WebResourceRequested 拦截用：与桥路由共享同一份扫描缓存。</summary>
    public ApplicationScanner.ScanCandidate? FindScanCandidate(string scanId) =>
        _catalog.FindCandidate(scanId);

    private Task<Reply?> DispatchAsync(string method, string route, string query, string? body)
    {
        switch (method, route)
        {
            case ("GET", "/health"):
                return Task.FromResult<Reply?>(new Reply(200, Json(new
                {
                    status = "ok",
                    service = "apex-console",
                    version = "0.1.0",
                })));

            case ("GET", "/settings/startup"):
                return Task.FromResult<Reply?>(new Reply(200, Json(_startup.Status())));

            case ("PUT", "/settings/startup"):
                return Task.FromResult(HandleStartupPut(body));

            case ("GET", "/window"):
                return Task.FromResult<Reply?>(new Reply(200, Json(_windowHost.Status())));

            case ("PUT", "/window/topmost"):
                return Task.FromResult<Reply?>(HandleWindowTopmost(body));

            case ("GET", "/activity/daily"):
                return Task.FromResult<Reply?>(new Reply(200,
                    Json(new { days = _activity.Daily(QueryInt(query, "days", 371)) })));

            case ("POST", "/activity/heartbeat"):
                return Task.FromResult<Reply?>(new Reply(200, Json(_activity.Heartbeat())));

            default:
                return Task.FromResult<Reply?>(null); // 未移植 → 走 Python 代理
        }
    }

    /// <summary>query 取整（FastAPI 的 `days: int = 371` 语义：缺失用默认，非法值同样回落默认）。</summary>
    private static int QueryInt(string query, string key, int fallback)
    {
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = pair.IndexOf('=');
            if (eq <= 0) continue;
            if (!string.Equals(pair[..eq], key, StringComparison.Ordinal)) continue;
            return int.TryParse(Uri.UnescapeDataString(pair[(eq + 1)..]), out var value) ? value : fallback;
        }
        return fallback;
    }

    private Reply HandleWindowTopmost(string? body)
    {
        bool? enabled = null;
        if (!string.IsNullOrEmpty(body))
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.ValueKind == JsonValueKind.Object
                    && doc.RootElement.TryGetProperty("enabled", out var e)
                    && e.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    enabled = e.GetBoolean();
            }
            catch (JsonException) { /* 落到下面的 422 */ }
        }
        if (enabled is null)
            return Error(422, "enabled 必须是布尔值");
        return new Reply(200, Json(_windowHost.SetTopmost(enabled.Value)));
    }

    private static Reply? HandleStartupPut(string? body)
    {
        bool? enabled = null;
        if (!string.IsNullOrEmpty(body))
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("enabled", out var e)
                    && e.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    enabled = e.GetBoolean();
            }
            catch (JsonException) { /* 落到下面的 422 */ }
        }
        if (enabled is null)
            return Error(422, "enabled 必须是布尔值");

        var state = new StartupManager().SetEnabled(enabled.Value);
        return new Reply(200, Json(state));
    }

    /* ---------- 块5：项目 / 任务 / 记录 / 文件 / 基本资料 ---------- */

    private static readonly string[] ProjectStatuses = { "正常", "开发中", "已暂停" };
    private static readonly string[] Priorities = { "高", "中", "低" };
    private static readonly string[] TaskKinds = { "todo", "fix" };
    private static readonly string[] NoteTags = { "日常", "技术", "复盘", "灵感" };

    /// <summary>执行域（块3）+ 模块域（块6）+ 项目域（块5）合并入口。</summary>
    private Reply? DispatchProjectDomain(string method, string route, string? body) =>
        DispatchExecutions(method, route, body)
        ?? DispatchModules(method, route, body)
        ?? DispatchProjects(method, route, body);

    /// <summary>main.py 的模块管理 + 项目绑定路由组（块6）。未匹配返回 null 走 Python 代理。</summary>
    private Reply? DispatchModules(string method, string route, string? body)
    {
        var segments = route.Split('/', StringSplitOptions.RemoveEmptyEntries);

        if (segments.Length >= 1 && segments[0] == "modules")
        {
            if (segments.Length == 1)
            {
                if (method == "GET") return new Reply(200, Json(_modules.List()));
                if (method == "POST")
                {
                    using var doc = RequireJson(body);
                    var payload = doc.RootElement;
                    var name = ReqText(payload, "name", 100);
                    var type = EnumText(payload, "type", new[] { "web" }, "web");
                    _ = type;   // 目前只允许 web：EnumText 已挡住其它值
                    var description = OptText(payload, "description", 500, "");
                    var entry = ReqText(payload, "entry", 2048);
                    return new Reply(201, Json(_modules.CreateWebModule(name, description, entry)));
                }
                return null;
            }
            var moduleId = segments[1];
            if (segments.Length == 2)
            {
                if (method == "PATCH")
                {
                    using var doc = RequireJson(body);
                    var payload = doc.RootElement;
                    var name = ReqText(payload, "name", 100);
                    var description = OptText(payload, "description", 500, "");
                    var entry = ReqText(payload, "entry", 2048);
                    return new Reply(200, Json(_modules.UpdateWebModule(moduleId, name, description, entry)));
                }
                if (method == "DELETE")
                    return new Reply(200, Json(_modules.DeleteWebModule(moduleId)));
                return null;
            }
            if (segments.Length == 3 && segments[2] == "delete-preview" && method == "GET")
                return new Reply(200, Json(_modules.DeletePreview(moduleId)));
            return null;
        }

        // PUT/DELETE /projects/{id}/modules/{module_id} 与 /projects/{id}/applications/{app_id}
        if (segments.Length == 4 && segments[0] == "projects"
            && (segments[2] == "modules" || segments[2] == "applications"))
        {
            var projectId = segments[1];
            var targetId = segments[3];
            var isModule = segments[2] == "modules";
            if (method == "PUT")
                return new Reply(201, Json(isModule
                    ? _modules.BindProjectModule(projectId, targetId)
                    : _modules.BindProjectApplication(projectId, targetId)));
            if (method == "DELETE")
                return new Reply(200, Json(isModule
                    ? _modules.UnbindProjectModule(projectId, targetId)
                    : _modules.UnbindProjectApplication(projectId, targetId)));
            return null;
        }

        return null;
    }

    /// <summary>main.py 的项目/任务/记录/文件/基本资料路由组（块5）。未匹配返回 null 走 Python 代理。</summary>
    private Reply? DispatchProjects(string method, string route, string? body)
    {
        var segments = route.Split('/', StringSplitOptions.RemoveEmptyEntries);

        if (segments.Length >= 1 && segments[0] == "projects")
        {
            if (segments.Length == 1)
            {
                if (method == "GET") return new Reply(200, Json(_projects.ListProjects()));
                if (method == "POST")
                {
                    using var doc = RequireJson(body);
                    var payload = doc.RootElement;
                    var name = ReqText(payload, "name", 80);
                    var description = OptText(payload, "description", 500, "");
                    var status = EnumText(payload, "status", ProjectStatuses, "开发中");
                    return new Reply(201, Json(_projects.CreateProject(name, description, status)));
                }
                return null;
            }
            if (segments.Length == 2 && segments[1] == "order" && method == "PUT")
            {
                using var doc = RequireJson(body);
                var ids = ReqStringList(doc.RootElement, "project_ids", 1, 500);
                return new Reply(200, Json(_projects.ReorderProjects(ids)));
            }
            var projectId = segments[1];
            if (segments.Length == 2)
            {
                if (method == "PATCH")
                {
                    using var doc = RequireJson(body);
                    var payload = doc.RootElement;
                    var name = ReqText(payload, "name", 80);
                    var description = OptText(payload, "description", 500, "");
                    var status = EnumText(payload, "status", ProjectStatuses, "开发中");
                    return new Reply(200, Json(_projects.UpdateProject(projectId, name, description, status)));
                }
                if (method == "DELETE")
                    return new Reply(200, Json(_projects.DeleteProject(projectId)));
                return null;
            }
            if (segments.Length == 3)
            {
                switch (segments[2])
                {
                    case "delete-preview" when method == "GET":
                        return new Reply(200, Json(_projects.ProjectDeletePreview(projectId)));
                    case "files" when method == "GET":
                        return new Reply(200, Json(_projects.ListProjectFiles(projectId)));
                    case "files" when method == "POST":
                    {
                        using var doc = RequireJson(body);
                        var path = ReqText(doc.RootElement, "path", 4000);
                        return new Reply(201, Json(_projects.RegisterProjectFile(projectId, path)));
                    }
                    case "tasks" when method == "GET":
                        return new Reply(200, Json(_projects.ListTasks(projectId)));
                    case "tasks" when method == "POST":
                    {
                        using var doc = RequireJson(body);
                        var payload = doc.RootElement;
                        var title = ReqText(payload, "title", 200);
                        var dueDate = OptTextOrNull(payload, "due_date", 32);
                        var priority = EnumText(payload, "priority", Priorities, "中");
                        var kind = EnumText(payload, "kind", TaskKinds, "todo");
                        return new Reply(201, Json(_projects.CreateTask(projectId, title, dueDate, priority, kind)));
                    }
                    case "notes" when method == "GET":
                        return new Reply(200, Json(_projects.ListNotes(projectId)));
                    case "notes" when method == "POST":
                    {
                        using var doc = RequireJson(body);
                        var payload = doc.RootElement;
                        var title = ReqText(payload, "title", 200);
                        var tag = EnumText(payload, "tag", NoteTags, "日常");
                        var text = OptText(payload, "body", 20000, "");
                        var pinned = OptBool(payload, "pinned", false);
                        var links = OptStringList(payload, "links");
                        return new Reply(201, Json(_projects.CreateNote(projectId, title, tag, text, pinned, links)));
                    }
                    case "basic-info" when method == "PUT":
                    {
                        using var doc = RequireJson(body);
                        var payload = doc.RootElement;
                        var module = OptText(payload, "module", 200, "");
                        var moduleId = OptText(payload, "module_id", 200, "");
                        var modulePath = OptText(payload, "module_path", 2000, "");
                        var files = OptStringList(payload, "files");
                        var devStatus = OptText(payload, "dev_status", 80, "开发中");
                        var nextStep = OptText(payload, "next_step", 1000, "");
                        var rules = OptStringList(payload, "rules");
                        var tasks = ParseBasicInfoTasks(payload);
                        var notes = ParseBasicInfoNotes(payload);
                        var dropExtras = OptBool(payload, "drop_extras", false);
                        return new Reply(200, Json(_projects.SaveBasicInfo(projectId, module, moduleId, modulePath,
                            files, devStatus, nextStep, rules, tasks, notes, dropExtras)));
                    }
                    default:
                        return null;   // 含块3 已处理的 executions/run/stop/restart/runtime 与未移植子路径
                }
            }
            return null;
        }

        if (segments.Length >= 2 && segments[0] == "project-files")
        {
            var fileId = segments[1];
            if (segments.Length == 2 && method == "DELETE")
                return new Reply(200, Json(_projects.DeleteProjectFile(fileId)));
            if (segments.Length == 3 && segments[2] == "delete-preview" && method == "GET")
                return new Reply(200, Json(_projects.ProjectFileDeletePreview(fileId)));
            if (segments.Length == 3 && segments[2] == "open" && method == "POST")
                return new Reply(200, Json(_projects.OpenProjectFile(fileId)));
            return null;
        }

        if (segments.Length == 2 && segments[0] == "tasks")
        {
            var taskId = segments[1];
            if (method == "PATCH")
            {
                using var doc = RequireJson(body);
                var payload = doc.RootElement;
                var title = ReqText(payload, "title", 200);
                var dueDate = OptTextOrNull(payload, "due_date", 32);
                var priority = EnumText(payload, "priority", Priorities, "中");
                var kind = EnumText(payload, "kind", TaskKinds, "todo");
                var completed = ReqBool(payload, "completed");
                return new Reply(200, Json(_projects.UpdateTask(taskId, title, dueDate, priority, kind, completed)));
            }
            if (method == "DELETE")
                return new Reply(200, Json(_projects.DeleteTask(taskId)));
            return null;
        }

        if (segments.Length == 2 && segments[0] == "notes")
        {
            var noteId = segments[1];
            if (method == "PATCH")
            {
                using var doc = RequireJson(body);
                var payload = doc.RootElement;
                var title = ReqText(payload, "title", 200);
                var tag = EnumText(payload, "tag", NoteTags, "日常");
                var text = OptText(payload, "body", 20000, "");
                var pinned = OptBool(payload, "pinned", false);
                var links = OptStringList(payload, "links");
                return new Reply(200, Json(_projects.UpdateNote(noteId, title, tag, text, pinned, links)));
            }
            if (method == "DELETE")
                return new Reply(200, Json(_projects.DeleteNote(noteId)));
            return null;
        }

        return null;
    }

    private static List<BasicInfoTaskInput> ParseBasicInfoTasks(JsonElement payload)
    {
        var list = new List<BasicInfoTaskInput>();
        if (!payload.TryGetProperty("tasks", out var el) || el.ValueKind == JsonValueKind.Null) return list;
        if (el.ValueKind != JsonValueKind.Array)
            throw new RequestInvalidError("tasks 必须是数组");
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new RequestInvalidError("tasks 每一项必须是对象");
            var id = item.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString() : null;
            list.Add(new BasicInfoTaskInput(id,
                ReqText(item, "title", 200),
                OptTextOrNull(item, "due_date", 32),
                EnumText(item, "priority", Priorities, "中"),
                EnumText(item, "kind", TaskKinds, "todo")));
        }
        return list;
    }

    private static List<BasicInfoNoteInput> ParseBasicInfoNotes(JsonElement payload)
    {
        var list = new List<BasicInfoNoteInput>();
        if (!payload.TryGetProperty("notes", out var el) || el.ValueKind == JsonValueKind.Null) return list;
        if (el.ValueKind != JsonValueKind.Array)
            throw new RequestInvalidError("notes 必须是数组");
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new RequestInvalidError("notes 每一项必须是对象");
            var id = item.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString() : null;
            list.Add(new BasicInfoNoteInput(id,
                ReqText(item, "title", 200),
                EnumText(item, "tag", NoteTags, "日常")));
        }
        return list;
    }

    /* ---------- 请求体校验（pydantic 字段约束的等价物） ---------- */

    private static JsonDocument RequireJson(string? body)
    {
        if (string.IsNullOrEmpty(body))
            throw new RequestInvalidError("请求体必须是 JSON 对象");
        try
        {
            var doc = JsonDocument.Parse(body);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                doc.Dispose();
                throw new RequestInvalidError("请求体必须是 JSON 对象");
            }
            return doc;
        }
        catch (JsonException)
        {
            throw new RequestInvalidError("请求体必须是 JSON 对象");
        }
    }

    private static string ReqText(JsonElement payload, string key, int max, int min = 1)
    {
        if (!payload.TryGetProperty(key, out var el) || el.ValueKind != JsonValueKind.String)
            throw new RequestInvalidError($"{key} 必须是字符串");
        var value = el.GetString()!;
        if (value.Length < min || value.Length > max)
            throw new RequestInvalidError($"{key} 长度必须在 {min}-{max} 之间");
        return value;
    }

    private static bool ReqBool(JsonElement payload, string key)
    {
        if (!payload.TryGetProperty(key, out var el) || el.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new RequestInvalidError($"{key} 必须是布尔值");
        return el.GetBoolean();
    }

    private static bool OptBool(JsonElement payload, string key, bool fallback) =>
        payload.TryGetProperty(key, out var el) && el.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? el.GetBoolean() : fallback;

    private static string OptText(JsonElement payload, string key, int max, string fallback)
    {
        if (!payload.TryGetProperty(key, out var el)) return fallback;
        if (el.ValueKind != JsonValueKind.String)
            throw new RequestInvalidError($"{key} 必须是字符串");
        var value = el.GetString()!;
        if (value.Length > max)
            throw new RequestInvalidError($"{key} 最长 {max} 个字符");
        return value;
    }

    private static string? OptTextOrNull(JsonElement payload, string key, int max)
    {
        if (!payload.TryGetProperty(key, out var el) || el.ValueKind == JsonValueKind.Null) return null;
        if (el.ValueKind != JsonValueKind.String)
            throw new RequestInvalidError($"{key} 必须是字符串或 null");
        var value = el.GetString()!;
        if (value.Length > max)
            throw new RequestInvalidError($"{key} 最长 {max} 个字符");
        return value;
    }

    private static string EnumText(JsonElement payload, string key, string[] allowed, string fallback)
    {
        if (!payload.TryGetProperty(key, out var el)) return fallback;
        if (el.ValueKind != JsonValueKind.String || !allowed.Contains(el.GetString()))
            throw new RequestInvalidError($"{key} 必须是 {string.Join('/', allowed)} 之一");
        return el.GetString()!;
    }

    private static List<string> OptStringList(JsonElement payload, string key)
    {
        var result = new List<string>();
        if (!payload.TryGetProperty(key, out var el) || el.ValueKind == JsonValueKind.Null) return result;
        if (el.ValueKind != JsonValueKind.Array)
            throw new RequestInvalidError($"{key} 必须是字符串数组");
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
                throw new RequestInvalidError($"{key} 必须是字符串数组");
            result.Add(item.GetString()!);
        }
        return result;
    }

    private static List<string> ReqStringList(JsonElement payload, string key, int min, int max)
    {
        if (!payload.TryGetProperty(key, out var el) || el.ValueKind != JsonValueKind.Array)
            throw new RequestInvalidError($"{key} 必须是字符串数组");
        var result = new List<string>();
        foreach (var item in el.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
                throw new RequestInvalidError($"{key} 必须是字符串数组");
            result.Add(item.GetString()!);
        }
        if (result.Count < min || result.Count > max)
            throw new RequestInvalidError($"{key} 数量必须在 {min}-{max} 之间");
        return result;
    }

    /// <summary>FastAPI 风格的错误体：{"detail": "..."}，前端 apiRequest 直接取 detail 显示。</summary>
    private static Reply Error(int status, string detail) =>
        new(status, Json(new { detail }));

    private static string Json(object payload) =>
        JsonSerializer.Serialize(payload,
            new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
}
