using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ApexShell;

/* 异常与 Python 版 HTTPException 映射一致：
   LookupError→404  ValueError→422  RuntimeError→409 */

public sealed class ExecutionMissingError : Exception
{
    public ExecutionMissingError(string m) : base(m) { }
}

public sealed class ExecutionInvalidError : Exception
{
    public ExecutionInvalidError(string m) : base(m) { }
}

public sealed class ExecutionBusyError : Exception
{
    public ExecutionBusyError(string m) : base(m) { }
}

/// <summary>
/// 二期 C# 版 backend/app/execution_service.py：编排一个项目的有序执行计划，
/// 保留每个模块 run 的原始记录。并发模型：asyncio.Lock → SemaphoreSlim(1,1)，
/// asyncio.Task → Task.Run + CancellationTokenSource（取消 = 关闭/重启时的强制中断）。
/// </summary>
public sealed class ExecutionService
{
    private sealed record ExecutionTask(Task Task, CancellationTokenSource Cts);

    private readonly Db _db;
    private readonly ModuleRunner _runner;
    private readonly ConcurrentDictionary<string, ExecutionTask> _tasks = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _projectLocks = new(StringComparer.Ordinal);

    public ExecutionService(Db db, ModuleRunner runner)
    {
        _db = db;
        _runner = runner;
    }

    /// <summary>新服务无法证明旧子进程仍属于它：启动时把残留执行标记为中断。</summary>
    public void RecoverInterrupted()
    {
        var now = Db.UtcNow();
        var active = _db.FetchAll(
            "SELECT id FROM project_executions WHERE status IN ('queued','running')");
        foreach (var row in active)
        {
            var executionId = (row.GetValueOrDefault("id") as string) ?? "";
            _db.Execute(
                "UPDATE project_executions SET status='interrupted',finished_at=@p0," +
                "error='服务重启，未完成的执行已标记为中断' WHERE id=@p1",
                now, executionId);
            _db.Execute(
                "UPDATE execution_steps SET status='interrupted',error='服务重启，步骤未完成' " +
                "WHERE execution_id=@p0 AND status IN ('queued','running')",
                executionId);
        }
        // 模块运行行（runs）过去没被回收：服务重启后它们永远停在 queued/running，
        // 既让项目列表显示「运行中」，又触发 singleInstance 的「已在运行」拦截，谁也点不动。
        var orphanRuns = _db.FetchAll("SELECT id FROM runs WHERE status IN ('queued','running')");
        foreach (var row in orphanRuns)
            _db.Execute(
                "UPDATE runs SET status='interrupted',finished_at=@p0," +
                "error='服务重启，未完成的模块运行已标记为中断' WHERE id=@p1",
                now, (row.GetValueOrDefault("id") as string) ?? "");
    }

    /* ---------- 启动（start 逐条对齐） ---------- */

    public Dictionary<string, object?> Start(string projectId, string action = "run")
    {
        if (action is not ("run" or "stop" or "restart"))
            throw new ExecutionInvalidError("不支持的项目动作");
        var gate = _projectLocks.GetOrAdd(projectId, _ => new SemaphoreSlim(1, 1));
        gate.Wait();
        try
        {
            if (_db.FetchOne("SELECT id FROM projects WHERE id=@p0", projectId) is null)
                throw new ExecutionMissingError("项目不存在");
            var active = _db.FetchOne(
                "SELECT id FROM project_executions WHERE project_id=@p0 AND status IN ('queued','running') LIMIT 1",
                projectId);
            if (active is not null)
            {
                if (action == "run")
                    throw new ExecutionBusyError("项目已有执行中的操作");
                InterruptExecutionSync((active.GetValueOrDefault("id") as string)!);
            }

            var modules = EnabledModules(projectId);
            var steps = PlanSteps(modules, action);
            foreach (var step in steps)
                _runner.ValidateModuleAction(step.ModuleId, step.Action);

            var executionId = Guid.NewGuid().ToString();
            var now = Db.UtcNow();
            _db.Transaction(steps.Select((step, order) =>
                (
                    "INSERT INTO execution_steps(id,execution_id,sort_order,module_id,module_name,action,status) " +
                    "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,'queued')",
                    new object?[] { Guid.NewGuid().ToString(), executionId, (long)order, step.ModuleId, step.ModuleName, step.Action }
                )).Prepend(
                (
                    "INSERT INTO project_executions(id,project_id,action,status,started_at) VALUES(@p0,@p1,@p2,'queued',@p3)",
                    new object?[] { executionId, projectId, action, now }
                )).ToArray());

            var cts = new CancellationTokenSource();
            var worker = Task.Run(() => ExecuteAsync(executionId, cts.Token));
            _tasks[executionId] = new ExecutionTask(worker, cts);
            worker.ContinueWith(done =>
            {
                _ = done;
                _tasks.TryRemove(executionId, out _);
                _ctsByExecution.TryRemove(executionId, out _);
            }, TaskScheduler.Default);
            return GetExecution(executionId) ?? new Dictionary<string, object?>();
        }
        finally
        {
            gate.Release();
        }
    }

    private readonly ConcurrentDictionary<string, CancellationTokenSource> _ctsByExecution =
        new(StringComparer.Ordinal);

    /// <summary>取消活着的执行任务，否则直接把残留状态标成中断。</summary>
    private void InterruptExecutionSync(string executionId)
    {
        if (_tasks.TryGetValue(executionId, out var entry) && !entry.Task.IsCompleted)
        {
            entry.Cts.Cancel();
            try { entry.Task.Wait(TimeSpan.FromSeconds(30)); }
            catch { /* 聚合异常在任务内部已落库 */ }
            return;
        }
        var now = Db.UtcNow();
        _db.Execute(
            "UPDATE execution_steps SET status='interrupted',error='项目操作已被关闭或重启请求强制中断' " +
            "WHERE execution_id=@p0 AND status IN ('queued','running')",
            executionId);
        _db.Execute(
            "UPDATE project_executions SET status='interrupted',finished_at=@p0," +
            "error='项目操作已被关闭或重启请求强制中断' WHERE id=@p1 AND status IN ('queued','running')",
            now, executionId);
    }

    /* ---------- 读取 ---------- */

    public Dictionary<string, object?>? GetExecution(string executionId)
    {
        var execution = _db.FetchOne("SELECT * FROM project_executions WHERE id=@p0", executionId);
        if (execution is null) return null;
        var steps = _db.FetchAll(
            "SELECT * FROM execution_steps WHERE execution_id=@p0 ORDER BY sort_order,id", executionId);
        foreach (var step in steps)
        {
            var runId = step.GetValueOrDefault("run_id") as string;
            step["run"] = runId is { Length: > 0 } ? _runner.GetRun(runId) : null;
        }
        execution["steps"] = steps;
        return execution;
    }

    /// <summary>旧页面还在轮询 /api/runs：保留它熟悉的字段，同时暴露 execution id 与有序步骤。</summary>
    public Dictionary<string, object?>? LegacyRunPayload(string executionId)
    {
        var execution = GetExecution(executionId);
        if (execution is null) return null;
        var steps = execution.GetValueOrDefault("steps") as List<Dictionary<string, object?>> ?? new();
        var completed = steps.Where(s => s.GetValueOrDefault("run") is not null).ToList();
        var latest = completed.Count > 0 ? completed[^1].GetValueOrDefault("run") as Dictionary<string, object?> : null;
        var payload = latest is null ? new Dictionary<string, object?>() : new Dictionary<string, object?>(latest);
        payload["id"] = execution["id"];
        payload["execution_id"] = execution["id"];
        payload["project_id"] = execution["project_id"];
        payload["action"] = execution["action"];
        payload["status"] = (execution["status"] as string) == "stopped" ? "succeeded" : execution["status"];
        payload["started_at"] = execution.GetValueOrDefault("started_at");
        payload["finished_at"] = execution.GetValueOrDefault("finished_at");
        payload["error"] = payload.GetValueOrDefault("error") ?? execution.GetValueOrDefault("error");
        payload["logs"] = payload.GetValueOrDefault("logs") ?? new List<string>();
        payload["result"] = payload.GetValueOrDefault("result");
        payload["steps"] = steps;
        return payload;
    }

    /* ---------- 计划 ---------- */

    private List<(string ModuleId, string ModuleName)> EnabledModules(string projectId)
    {
        var rows = _db.FetchAll(
            "SELECT m.id,m.name FROM project_modules pm JOIN modules m ON m.id=pm.module_id " +
            "WHERE pm.project_id=@p0 AND pm.enabled=1 AND m.enabled=1 ORDER BY pm.sort_order,m.id",
            projectId);
        if (rows.Count == 0)
            throw new ExecutionInvalidError("项目没有可执行模块");
        return rows.Select(r => ((r.GetValueOrDefault("id") as string) ?? "",
            (r.GetValueOrDefault("name") as string) ?? "")).ToList();
    }

    private List<(string ModuleId, string ModuleName, string Action)> PlanSteps(
        List<(string ModuleId, string ModuleName)> modules, string action)
    {
        if (action == "run")
            return modules.Select(m => (m.ModuleId, m.ModuleName, Action: "run")).ToList();
        var stoppable = modules.Where(m => _runner.SupportsAction(m.ModuleId, "stop")).ToList();
        if (stoppable.Count == 0)
            throw new ExecutionInvalidError("项目没有可关闭的模块");
        // 网页等一次性模块不拥有进程，不会被假装成可关闭步骤
        var stopSteps = stoppable.AsEnumerable().Reverse()
            .Select(m => (m.ModuleId, m.ModuleName, Action: "stop"))
            .ToList();
        if (action == "stop")
            return stopSteps;
        return stopSteps.Concat(modules.Select(m => (m.ModuleId, m.ModuleName, Action: "run"))).ToList();
    }

    /* ---------- 执行编排（_execute 逐条对齐） ---------- */

    private async Task ExecuteAsync(string executionId, CancellationToken ct)
    {
        // cts 要先于 ExecuteAsync 体注册（Start 里 Task.Run 前已入 _ctsByExecution）
        var execution = GetExecution(executionId);
        if (execution is null) return;
        _db.Execute("UPDATE project_executions SET status='running' WHERE id=@p0", executionId);
        var action = (execution.GetValueOrDefault("action") as string) ?? "run";
        var projectId = (execution.GetValueOrDefault("project_id") as string) ?? "";
        var finalStatus = "succeeded";
        string? error = null;
        try
        {
            var steps = execution.GetValueOrDefault("steps") as List<Dictionary<string, object?>> ?? new();
            foreach (var step in steps)
            {
                var stepId = (step.GetValueOrDefault("id") as string) ?? "";
                var stepAction = (step.GetValueOrDefault("action") as string) ?? "run";
                var stepModuleId = (step.GetValueOrDefault("module_id") as string) ?? "";
                _db.Execute("UPDATE execution_steps SET status='running' WHERE id=@p0", stepId);
                try
                {
                    var started = _runner.StartModule(projectId, stepModuleId, stepAction);
                    var runId = (started.GetValueOrDefault("id") as string) ?? "";
                    _db.Execute("UPDATE execution_steps SET run_id=@p0 WHERE id=@p1", runId, stepId);
                    var run = await WaitForRunAsync(runId, ct).ConfigureAwait(false);
                    var runStatus = (run?.GetValueOrDefault("status") as string) ?? "";
                    if (run is null || runStatus != "succeeded")
                    {
                        // Python: error = str((run or {}).get("error") or "模块执行未成功")
                        var runError = run?.GetValueOrDefault("error") as string;
                        error = string.IsNullOrEmpty(runError) ? "模块执行未成功" : runError;
                        _db.Execute(
                            "UPDATE execution_steps SET status='failed',error=@p0 WHERE id=@p1", error, stepId);
                        finalStatus = "failed";
                        break;
                    }
                    var stepStatus = stepAction == "stop" ? "stopped" : "succeeded";
                    _db.Execute("UPDATE execution_steps SET status=@p0 WHERE id=@p1", stepStatus, stepId);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    error = $"{ex.GetType().Name}: {ex.Message}";
                    _db.Execute(
                        "UPDATE execution_steps SET status='failed',error=@p0 WHERE id=@p1", error, stepId);
                    finalStatus = "failed";
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
            error = "项目操作已被关闭或重启请求强制中断";
            var activeSteps = _db.FetchAll(
                "SELECT run_id FROM execution_steps WHERE execution_id=@p0 AND status IN ('queued','running')",
                executionId);
            foreach (var step in activeSteps)
            {
                if (step.GetValueOrDefault("run_id") is string runId && runId.Length > 0)
                    await _runner.CancelRunAsync(runId, error).ConfigureAwait(false);
            }
            _db.Execute(
                "UPDATE execution_steps SET status='interrupted',error=@p0 " +
                "WHERE execution_id=@p1 AND status IN ('queued','running')",
                error, executionId);
            finalStatus = "interrupted";
        }
        if (finalStatus == "succeeded" && action == "stop")
            finalStatus = "stopped";
        _db.Execute(
            "UPDATE project_executions SET status=@p0,finished_at=@p1,error=@p2 WHERE id=@p3",
            finalStatus, Db.UtcNow(), error, executionId);
    }

    private async Task<Dictionary<string, object?>?> WaitForRunAsync(string runId, CancellationToken ct)
    {
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var run = _runner.GetRun(runId);
            var status = (run?.GetValueOrDefault("status") as string) ?? "";
            if (run is null || !ModuleRunnerIsRunning(status))
                return run;
            if (!_runner.RunIsLive(runId))
            {
                // 任务已经收摊，状态却还停在 queued/running：要么是异常从落库之前逃掉了，
                // 要么它根本不是本进程发起的（重启前留下的孤儿行）。
                // 交回去让上层按「未成功」收尾，比无声挂起诚实。
                // ——但多线程下「任务收摊」与「finally 落库对其他连接可见」之间有微小窗口
                //（Python 单线程事件循环没有这个竞态）：重查一拍再下结论，避免时序闪失。
                await Task.Delay(50, ct).ConfigureAwait(false);
                var retry = _runner.GetRun(runId);
                var retryStatus = (retry?.GetValueOrDefault("status") as string) ?? "";
                if (retry is null || !ModuleRunnerIsRunning(retryStatus) || !_runner.RunIsLive(runId))
                    return retry ?? run;
            }
            await Task.Delay(20, ct).ConfigureAwait(false);
        }
    }

    private static bool ModuleRunnerIsRunning(string status) => status is "queued" or "running";
}
