using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ApexShell;

/* 异常类型与 Python 版 HTTPException 映射一一对应：
   LookupError→404  ValueError→422  RuntimeError→409  ApplicationScanError→503  OSError→500 */

public sealed class ApplicationNotFound : Exception { public ApplicationNotFound(string m) : base(m) { } }
public sealed class ApplicationInvalid : Exception { public ApplicationInvalid(string m) : base(m) { } }
public sealed class ApplicationConflict : Exception { public ApplicationConflict(string m) : base(m) { } }
public sealed class ApplicationLaunchFailed : Exception { public ApplicationLaunchFailed(string m) : base(m) { } }

/// <summary>
/// 二期 C# 版 applications 路由组的业务层（对照 main.py 里 /api/applications* 全部处理器）。
/// 前端契约细节：application_payload 弹出 launch_path/source_key，source_key 在则
/// icon 改写为 native:{source_key}，favorite/running 转 bool，并加 launchable 布尔。
/// </summary>
public sealed class ApplicationCatalog
{
    private readonly Db _db;
    private readonly ApplicationScanner _scanner;
    private bool _initialized;

    /// <summary>scanner 可注入：自测环境传关掉 PowerShell 清单的实例（派生 powershell.exe 会被安全软件掐）。</summary>
    public ApplicationCatalog(Db db, ApplicationScanner? scanner = null)
    {
        _db = db;
        _scanner = scanner ?? new ApplicationScanner();
    }

    private void EnsureInit()
    {
        if (_initialized) return;
        _db.Init();   // 幂等（user_version 协议），两套栈共用一库也安全
        _initialized = true;
    }

    /// <summary>main.py application_payload 的逐条复刻。</summary>
    public static Dictionary<string, object?> ApplicationPayload(Dictionary<string, object?> row)
    {
        var value = new Dictionary<string, object?>(row);
        var launchPath = (value.GetValueOrDefault("launch_path") as string) ?? "";
        var sourceKey = (value.GetValueOrDefault("source_key") as string) ?? "";
        value.Remove("launch_path");
        value.Remove("source_key");
        if (sourceKey.Length > 0) value["icon"] = $"native:{sourceKey}";
        value["favorite"] = AsLong(value.GetValueOrDefault("favorite")) != 0;
        value["running"] = AsLong(value.GetValueOrDefault("running")) != 0;
        value["launchable"] = launchPath.Length > 0;
        return value;
    }

    private static long AsLong(object? v) => Convert.ToInt64(v ?? 0);

    /* ---------- GET /applications ---------- */

    public List<Dictionary<string, object?>> List()
    {
        EnsureInit();
        return _db.FetchAll("SELECT * FROM applications ORDER BY use_count DESC,name,id")
            .Select(ApplicationPayload).ToList();
    }

    /* ---------- GET /applications/scan ---------- */

    public List<Dictionary<string, object?>> Scan()
    {
        EnsureInit();
        var added = new HashSet<string>(
            _db.FetchAll("SELECT source_key FROM applications WHERE source_key<>''")
                .Select(r => (r.GetValueOrDefault("source_key") as string) ?? ""),
            StringComparer.Ordinal);
        return _scanner.ScanCached().Select(c => (Dictionary<string, object?>)new Dictionary<string, object?>
        {
            ["id"] = c.Id,
            ["name"] = c.Name,
            ["category"] = c.Category,
            ["icon"] = c.Icon,
            ["added"] = added.Contains(c.Id),
        }).ToList();
    }

    /// <summary>图标路由的图源：优先 icon_source，回退 launch_path。找不到 scan_id 返回 null。</summary>
    public ApplicationScanner.ScanCandidate? FindCandidate(string scanId) =>
        _scanner.ScanCached().FirstOrDefault(c => c.Id == scanId);

    /* ---------- POST /applications/from-scan ---------- */

    public Dictionary<string, object?> CreateFromScan(string scanId, string? name0, string? category0)
    {
        EnsureInit();
        var candidate = _scanner.ScanCached().FirstOrDefault(c => c.Id == scanId);
        if (candidate is null)
            throw new ApplicationNotFound("扫描结果已失效，请重新扫描");
        if (_db.FetchOne("SELECT id FROM applications WHERE source_key=@p0", scanId) is not null)
            throw new ApplicationConflict("这个应用已在列表中");
        var name = (name0 ?? candidate.Name).Trim();
        var category = (category0 ?? candidate.Category).Trim();
        if (name.Length == 0 || category.Length == 0)
            throw new ApplicationInvalid("应用名称和标签不能为空");
        var duplicate = _db.FetchOne("SELECT * FROM applications WHERE name=@p0", name);
        var now = Db.UtcNow();
        if (duplicate is not null
            && ((duplicate.GetValueOrDefault("launch_path") as string) ?? "").Length > 0)
            throw new ApplicationConflict("应用列表里已有同名应用");
        var appId = duplicate?["id"] as string ?? candidate.Id;
        if (duplicate is not null)
        {
            _db.Execute(
                "UPDATE applications SET category=@p0,icon=@p1,size_label='本机',launch_path=@p2,source_key=@p3,updated_at=@p4 WHERE id=@p5",
                category, candidate.Icon, candidate.LaunchPath, candidate.Id, now, appId);
        }
        else
        {
            _db.Execute(
                "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,last_opened_at,running,created_at,updated_at,launch_path,source_key) " +
                "VALUES(@p0,@p1,@p2,@p3,0,'本机',0,NULL,0,@p4,@p5,@p6,@p7)",
                appId, name, category, candidate.Icon, now, now, candidate.LaunchPath, candidate.Id);
        }
        return ApplicationPayload(
            _db.FetchOne("SELECT * FROM applications WHERE id=@p0", appId)
            ?? throw new ApplicationLaunchFailed("应用写入后读取失败"));
    }

    /* ---------- PATCH /applications/{app_id}（save_application_row 逐条对齐） ---------- */

    public Dictionary<string, object?> Update(string appId, string name, string category, string icon,
        bool favorite, string sizeLabel, long useCount, string? lastOpenedAt, bool running)
    {
        EnsureInit();
        name = name.Trim();
        if (_db.FetchOne("SELECT id FROM applications WHERE name=@p0 AND id<>@p1", name, appId) is not null)
            throw new ApplicationConflict("应用列表里已有同名应用");
        var now = Db.UtcNow();
        if (_db.FetchOne("SELECT id FROM applications WHERE id=@p0", appId) is null)
            throw new ApplicationNotFound("应用不存在");
        _db.Execute(
            "UPDATE applications SET name=@p0,category=@p1,icon=@p2,favorite=@p3,size_label=@p4,use_count=@p5," +
            "last_opened_at=@p6,running=@p7,updated_at=@p8 WHERE id=@p9",
            name, category.Trim(), icon, favorite ? 1 : 0, sizeLabel, useCount, lastOpenedAt,
            running ? 1 : 0, now, appId);
        _db.Execute(
            "UPDATE modules SET name=@p0,updated_at=@p1 WHERE type='application' AND entry=@p2",
            name, now, appId);
        return ApplicationPayload(
            _db.FetchOne("SELECT * FROM applications WHERE id=@p0", appId)
            ?? throw new ApplicationLaunchFailed("应用更新后读取失败"));
    }

    /* ---------- POST /applications/{app_id}/launch ---------- */

    /// <summary>启动前置校验（main.py resolve_saved_application 的语义）：
    /// 应用存在、有真实入口、扫描结果里 candidate 仍在且路径未变。失败按对应异常类型抛出。</summary>
    public (Dictionary<string, object?> Stored, ApplicationScanner.ScanCandidate Candidate) ValidateLaunch(string appId)
    {
        var stored = _db.FetchOne("SELECT * FROM applications WHERE id=@p0", appId);
        if (stored is null)
            throw new ApplicationNotFound("应用不存在");
        var sourceKey = (stored.GetValueOrDefault("source_key") as string) ?? "";
        var launchPath = (stored.GetValueOrDefault("launch_path") as string) ?? "";
        if (sourceKey.Length == 0 || launchPath.Length == 0)
            throw new ApplicationInvalid("这个旧应用没有真实启动入口，请从本机扫描结果重新添加");
        var candidate = _scanner.ScanCached().FirstOrDefault(c => c.Id == sourceKey);
        if (candidate is null || candidate.LaunchPath != launchPath)
            throw new ApplicationConflict("应用启动入口已失效，请移除后重新扫描");
        return (stored, candidate);
    }

    public Dictionary<string, object?> Launch(string appId)
    {
        EnsureInit();
        var (stored, candidate) = ValidateLaunch(appId);
        _ = stored;

        OpenLocalApplication(candidate.LaunchPath);
        var now = Db.UtcNow();
        _db.Execute(
            "UPDATE applications SET use_count=use_count+1,last_opened_at=@p0,updated_at=@p1 WHERE id=@p2",
            now, now, appId);
        return ApplicationPayload(
            _db.FetchOne("SELECT * FROM applications WHERE id=@p0", appId)
            ?? throw new ApplicationLaunchFailed("应用启动后读取失败"));
    }

    /// <summary>os.startfile 的等价物：ShellExecute。shell:AppsFolder\… 也走这条路。</summary>
    private static void OpenLocalApplication(string path)
    {
        try
        {
            using var proc = new System.Diagnostics.Process();
            proc.StartInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            };
            proc.Start();
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new ApplicationLaunchFailed($"无法启动应用：{ex.Message}");
        }
    }

    /* ---------- DELETE /applications/{app_id} ---------- */

    public Dictionary<string, object?> Delete(string appId)
    {
        EnsureInit();
        if (_db.FetchOne("SELECT * FROM applications WHERE id=@p0", appId) is null)
            throw new ApplicationNotFound("应用不存在");
        var moduleId = $"application:{appId}";
        _db.Transaction(new (string Sql, object?[] Args)[]
        {
            ("DELETE FROM project_modules WHERE module_id=@p0", new object?[] { moduleId }),
            ("UPDATE modules SET enabled=0,updated_at=@p0 WHERE id=@p1",
                new object?[] { Db.UtcNow(), moduleId }),
            ("DELETE FROM applications WHERE id=@p0", new object?[] { appId }),
        });
        return new Dictionary<string, object?> { ["deleted"] = true, ["appId"] = appId };
    }
}
