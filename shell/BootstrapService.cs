using System;
using System.Collections.Generic;
using System.Linq;

namespace ApexShell;

/// <summary>
/// 二期 C# 版 main.py 的 `/api/bootstrap`：一次汇总前端首屏需要的全部数据面
/// （项目 / 任务 / 记录 / 活跃度 / 开发上下文 / 项目文件 / 应用 / 模块 / 绑定 /
/// 运行统计 / 执行快照）。字段名与 Python 版逐字对齐——前端 loadBackendState()
/// 直接按这些键取值，改名字会静默丢数据。
/// </summary>
public sealed class BootstrapService
{
    private readonly Db _db;
    private readonly ExecutionService _execution;
    private readonly ActivityService _activity;

    public BootstrapService(Db db, ExecutionService execution, ActivityService activity)
    {
        _db = db;
        _execution = execution;
        _activity = activity;
    }

    /// <summary>projectRuns.recent / projectExecutions.recent 里带的运行字段（与 Python 的 key 元组一致）。</summary>
    private static readonly string[] RunKeys =
        { "id", "action", "status", "started_at", "finished_at", "error" };

    public Dictionary<string, object?> Build()
    {
        var projects = _db.FetchAll("SELECT * FROM projects ORDER BY sort_order, created_at, id");
        var tasks = _db.FetchAll("SELECT * FROM tasks ORDER BY created_at, id");
        var notes = _db.FetchAll("SELECT * FROM notes ORDER BY pinned DESC,updated_at DESC,id")
            .Select(ProjectService.NotePayload).ToList();
        var contexts = _db.FetchAll("SELECT * FROM project_contexts")
            .Select(ProjectService.ContextPayload).ToList();
        var projectFiles = _db.FetchAll("SELECT * FROM project_files ORDER BY created_at,id");
        var applications = _db.FetchAll("SELECT * FROM applications ORDER BY use_count DESC,name,id")
            .Select(ApplicationCatalog.ApplicationPayload).ToList();
        var modules = _db.FetchAll(
            "SELECT * FROM modules WHERE enabled=1 AND type<>'application' ORDER BY name,id");
        var bindings = _db.FetchAll(
            "SELECT pm.* FROM project_modules pm JOIN modules m ON m.id=pm.module_id " +
            "WHERE pm.enabled=1 AND m.enabled=1 AND m.type<>'application' " +
            "ORDER BY pm.project_id,pm.sort_order");
        var applicationBindings = _db.FetchAll(
            "SELECT pm.project_id,a.id AS application_id,m.id AS module_id,pm.sort_order,pm.enabled " +
            "FROM project_modules pm JOIN modules m ON m.id=pm.module_id " +
            "JOIN applications a ON a.id=m.entry " +
            "WHERE pm.enabled=1 AND m.enabled=1 AND m.type='application' " +
            "ORDER BY pm.project_id,pm.sort_order");

        // 运行历史：project_executions 优先；runs 里没有 execution_steps 关联的才算 legacy 记录
        // （旧数据兼容），两边合并后按 (started_at, id) 降序。
        var executionRows = _db.FetchAll(
            "SELECT id,project_id,action,status,started_at,finished_at,error FROM project_executions " +
            "ORDER BY started_at DESC,id DESC");
        var executions = _db.FetchAll(
            "SELECT id,project_id,action,status,started_at,finished_at,error FROM project_executions " +
            "WHERE action<>'stop'");
        var legacyRuns = _db.FetchAll(
            "SELECT r.id,r.project_id,r.action,r.status,r.started_at,r.finished_at,r.error FROM runs r " +
            "WHERE r.action<>'stop' AND NOT EXISTS " +
            "(SELECT 1 FROM execution_steps es WHERE es.run_id=r.id)");
        var runs = executions.Concat(legacyRuns)
            .OrderByDescending(row => (row.GetValueOrDefault("started_at") as string) ?? "")
            .ThenByDescending(row => (row.GetValueOrDefault("id") as string) ?? "")
            .ToList();

        var projectRuns = new List<Dictionary<string, object?>>();
        var projectExecutions = new List<Dictionary<string, object?>>();
        foreach (var project in projects)
        {
            var projectId = (project.GetValueOrDefault("id") as string) ?? "";
            var history = runs.Where(row => (row.GetValueOrDefault("project_id") as string) == projectId).ToList();
            var executionHistory = executionRows
                .Where(row => (row.GetValueOrDefault("project_id") as string) == projectId).ToList();
            var latestExecution = executionHistory.Count > 0
                ? _execution.GetExecution((executionHistory[0].GetValueOrDefault("id") as string) ?? "")
                : null;
            var activeRow = executionHistory.FirstOrDefault(row =>
                (row.GetValueOrDefault("status") as string) is "queued" or "running");

            projectRuns.Add(new Dictionary<string, object?>
            {
                ["project_id"] = projectId,
                ["run_count"] = (long)history.Count,
                ["last_run_at"] = history.Count > 0 ? history[0].GetValueOrDefault("started_at") : null,
                ["recent"] = history.Take(3).Select(SlimRun).ToList(),
            });
            projectExecutions.Add(new Dictionary<string, object?>
            {
                ["project_id"] = projectId,
                ["active"] = activeRow is null
                    ? null
                    : _execution.GetExecution((activeRow.GetValueOrDefault("id") as string) ?? ""),
                ["latest"] = latestExecution,
                ["recent"] = executionHistory.Take(3).ToList(),
            });
        }

        return new Dictionary<string, object?>
        {
            ["projects"] = projects,
            ["tasks"] = tasks,
            ["notes"] = notes,
            ["activityDays"] = _activity.Daily(371),
            ["projectContexts"] = contexts,
            ["projectFiles"] = projectFiles,
            ["applications"] = applications,
            ["modules"] = modules,
            ["projectModules"] = bindings,
            ["projectApplications"] = applicationBindings,
            ["projectRuns"] = projectRuns,
            ["projectExecutions"] = projectExecutions,
        };
    }

    private static Dictionary<string, object?> SlimRun(Dictionary<string, object?> row)
    {
        var slim = new Dictionary<string, object?>();
        foreach (var key in RunKeys) slim[key] = row.GetValueOrDefault(key);
        return slim;
    }
}
