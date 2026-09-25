using System;
using System.Collections.Generic;
using System.Linq;

namespace ApexShell;

/* 模块域的缺失 / 冲突（404 / 409）；web 地址校验非法复用 LocalApi.RequestInvalidError → 422。
   应用绑定链路复用 ApplicationCatalog.ValidateLaunch 的三类异常（404 / 422 / 409）。 */

public sealed class ModuleDomainMissingError : Exception
{
    public ModuleDomainMissingError(string m) : base(m) { }
}

public sealed class ModuleDomainConflictError : Exception
{
    public ModuleDomainConflictError(string m) : base(m) { }
}

/// <summary>
/// 二期 C# 版 main.py 的模块管理面：模块列表（含 web 模板模块的增改删预演）
/// 与项目↔模块 / 项目↔应用的绑定解绑。内置执行模块（有 manifest_path 或非 web）
/// 一律不允许在页面上改写或删除；应用绑定复用「隐藏 application 适配模块」机制。
/// </summary>
public sealed class ModuleService
{
    private readonly Db _db;
    private readonly ApplicationCatalog _catalog;

    public ModuleService(Db db, ApplicationCatalog catalog)
    {
        _db = db;
        _catalog = catalog;
    }

    /* ---------- GET /modules ---------- */

    public List<Dictionary<string, object?>> List() =>
        _db.FetchAll("SELECT * FROM modules WHERE enabled=1 AND type<>'application' ORDER BY name,id");

    /* ---------- POST /modules（web 模板模块） ---------- */

    public Dictionary<string, object?> CreateWebModule(string name, string description, string entry)
    {
        var normalized = NormalizedWebUrl(entry);
        if (_db.FetchOne("SELECT id FROM modules WHERE type='web' AND entry=@p0 AND enabled=1", normalized) is not null)
            throw new ModuleDomainConflictError("这个网站地址已经创建过模块");
        var moduleId = "web-" + Guid.NewGuid().ToString("N");   // 与 Python uuid4().hex 同宽（32 位）
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
            "VALUES(@p0,@p1,'web',@p2,@p3,'','1.0.0','',1,@p4)",
            moduleId, name.Trim(), description.Trim(), normalized, now);
        return _db.FetchOne("SELECT * FROM modules WHERE id=@p0", moduleId) ?? new Dictionary<string, object?>();
    }

    /* ---------- PATCH /modules/{id} ---------- */

    public Dictionary<string, object?> UpdateWebModule(string moduleId, string name, string description, string entry)
    {
        var current = _db.FetchOne("SELECT * FROM modules WHERE id=@p0 AND enabled=1", moduleId)
            ?? throw new ModuleDomainMissingError("模块不存在");
        if ((current.GetValueOrDefault("type") as string) != "web"
            || ((current.GetValueOrDefault("manifest_path") as string) ?? "").Length > 0)
            throw new ModuleDomainConflictError("内置执行模块不能在这里修改");
        var normalized = NormalizedWebUrl(entry);
        if (_db.FetchOne(
                "SELECT id FROM modules WHERE type='web' AND entry=@p0 AND enabled=1 AND id<>@p1",
                normalized, moduleId) is not null)
            throw new ModuleDomainConflictError("这个网站地址已经创建过模块");
        _db.Execute(
            "UPDATE modules SET name=@p0,description=@p1,entry=@p2,updated_at=@p3 WHERE id=@p4",
            name.Trim(), description.Trim(), normalized, Db.UtcNow(), moduleId);
        return _db.FetchOne("SELECT * FROM modules WHERE id=@p0", moduleId) ?? new Dictionary<string, object?>();
    }

    /* ---------- GET /modules/{id}/delete-preview ---------- */

    public Dictionary<string, object?> DeletePreview(string moduleId)
    {
        var module = _db.FetchOne("SELECT * FROM modules WHERE id=@p0 AND enabled=1", moduleId)
            ?? throw new ModuleDomainMissingError("模块不存在");
        var projects = _db.FetchAll(
            "SELECT p.id,p.name FROM project_modules pm JOIN projects p ON p.id=pm.project_id " +
            "WHERE pm.module_id=@p0 AND pm.enabled=1 ORDER BY p.name,p.id", moduleId);
        return new Dictionary<string, object?>
        {
            ["module"] = module,
            ["projects"] = projects,
            ["deletable"] = (module.GetValueOrDefault("type") as string) == "web"
                            && ((module.GetValueOrDefault("manifest_path") as string) ?? "").Length == 0,
        };
    }

    /* ---------- DELETE /modules/{id} ---------- */

    public Dictionary<string, object?> DeleteWebModule(string moduleId)
    {
        var module = _db.FetchOne("SELECT * FROM modules WHERE id=@p0 AND enabled=1", moduleId)
            ?? throw new ModuleDomainMissingError("模块不存在");
        if ((module.GetValueOrDefault("type") as string) != "web"
            || ((module.GetValueOrDefault("manifest_path") as string) ?? "").Length > 0)
            throw new ModuleDomainConflictError("内置执行模块不能删除");
        var bindings = _db.FetchAll(
            "SELECT project_id FROM project_modules WHERE module_id=@p0 AND enabled=1", moduleId);
        // 删除只解除绑定并停用模块；历史运行记录保留（runs 的外键是 RESTRICT，模块行不物理删除）
        _db.Transaction(new (string Sql, object?[] Args)[]
        {
            ("DELETE FROM project_modules WHERE module_id=@p0", new object?[] { moduleId }),
            ("UPDATE modules SET enabled=0,updated_at=@p0 WHERE id=@p1", new object?[] { Db.UtcNow(), moduleId }),
        });
        return new Dictionary<string, object?>
        {
            ["deleted"] = true, ["moduleId"] = moduleId, ["affectedProjects"] = (long)bindings.Count,
        };
    }

    /* ---------- PUT /projects/{id}/modules/{module_id} ---------- */

    public Dictionary<string, object?> BindProjectModule(string projectId, string moduleId)
    {
        if (_db.FetchOne("SELECT id FROM projects WHERE id=@p0", projectId) is null)
            throw new ModuleDomainMissingError("项目不存在");
        if (_db.FetchOne("SELECT id FROM modules WHERE id=@p0 AND enabled=1", moduleId) is null)
            throw new ModuleDomainMissingError("模块不存在");
        _db.Execute(
            "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(@p0,@p1,@p2,1) " +
            "ON CONFLICT(project_id,module_id) DO UPDATE SET enabled=1",
            projectId, moduleId, NextOrder(projectId));
        return _db.FetchOne(
            "SELECT * FROM project_modules WHERE project_id=@p0 AND module_id=@p1", projectId, moduleId)
            ?? new Dictionary<string, object?>();
    }

    /* ---------- DELETE /projects/{id}/modules/{module_id} ---------- */

    public Dictionary<string, object?> UnbindProjectModule(string projectId, string moduleId)
    {
        var binding = _db.FetchOne(
            "SELECT * FROM project_modules WHERE project_id=@p0 AND module_id=@p1 AND enabled=1",
            projectId, moduleId);
        if (binding is null)
            throw new ModuleDomainMissingError("项目没有使用这个模块");
        _db.Execute("DELETE FROM project_modules WHERE project_id=@p0 AND module_id=@p1", projectId, moduleId);
        return new Dictionary<string, object?>
        {
            ["removed"] = true, ["projectId"] = projectId, ["moduleId"] = moduleId,
        };
    }

    /* ---------- PUT /projects/{id}/applications/{application_id}（隐藏的 application 适配模块） ---------- */

    public Dictionary<string, object?> BindProjectApplication(string projectId, string applicationId)
    {
        if (_db.FetchOne("SELECT id FROM projects WHERE id=@p0", projectId) is null)
            throw new ModuleDomainMissingError("项目不存在");
        // 与 main.py resolve_saved_application 同一校验链：不存在 404 / 旧应用无入口 422 / 入口失效 409
        var (stored, _) = _catalog.ValidateLaunch(applicationId);
        var moduleId = ApplicationModuleId(applicationId);
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) " +
            "VALUES(@p0,@p1,'application','启动本机应用',@p2,'','1.0.0','',1,@p3) " +
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name,type='application'," +
            "description=excluded.description,entry=excluded.entry,enabled=1,updated_at=excluded.updated_at",
            moduleId, (stored.GetValueOrDefault("name") as string) ?? "", applicationId, now);
        _db.Execute(
            "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(@p0,@p1,@p2,1) " +
            "ON CONFLICT(project_id,module_id) DO UPDATE SET enabled=1",
            projectId, moduleId, NextOrder(projectId));
        var binding = _db.FetchOne(
            "SELECT * FROM project_modules WHERE project_id=@p0 AND module_id=@p1", projectId, moduleId)
            ?? new Dictionary<string, object?>();
        binding["application_id"] = applicationId;
        return binding;
    }

    /* ---------- DELETE /projects/{id}/applications/{application_id} ---------- */

    public Dictionary<string, object?> UnbindProjectApplication(string projectId, string applicationId)
    {
        var moduleId = ApplicationModuleId(applicationId);
        var binding = _db.FetchOne(
            "SELECT * FROM project_modules WHERE project_id=@p0 AND module_id=@p1 AND enabled=1",
            projectId, moduleId);
        if (binding is null)
            throw new ModuleDomainMissingError("项目没有使用这个应用");
        _db.Execute("DELETE FROM project_modules WHERE project_id=@p0 AND module_id=@p1", projectId, moduleId);
        return new Dictionary<string, object?>
        {
            ["removed"] = true, ["projectId"] = projectId,
            ["applicationId"] = applicationId, ["moduleId"] = moduleId,
        };
    }

    public static string ApplicationModuleId(string applicationId) => $"application:{applicationId}";

    private long NextOrder(string projectId)
    {
        var row = _db.FetchOne(
            "SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM project_modules WHERE project_id=@p0",
            projectId);
        return row is null ? 0 : Convert.ToInt64(row.GetValueOrDefault("next_order") ?? 0);
    }

    /// <summary>normalized_web_url 逐条对齐：只接受完整 http/https 地址，且不含用户名密码。</summary>
    internal static string NormalizedWebUrl(string value)
    {
        var url = value.Trim();
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed)
            || (parsed.Scheme != "http" && parsed.Scheme != "https")
            || parsed.Host.Length == 0)
            throw new LocalApi.RequestInvalidError("网站地址必须是完整的 http:// 或 https:// 地址");
        if (parsed.UserInfo.Length > 0)
            throw new LocalApi.RequestInvalidError("网站地址不能包含用户名或密码");
        return url;
    }
}
