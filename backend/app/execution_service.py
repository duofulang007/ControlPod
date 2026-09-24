from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from .db import Database, utc_now
from .module_runner import ModuleRunner, RUNNING_STATES


class ExecutionService:
    """Create and run an ordered project plan while retaining each raw module run."""

    def __init__(self, db: Database, runner: ModuleRunner) -> None:
        self.db = db
        self.runner = runner
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._project_locks: dict[str, asyncio.Lock] = {}

    def recover_interrupted(self) -> None:
        """A new server cannot prove old child processes still belong to it."""
        now = utc_now()
        with self.db.connect() as conn:
            active = conn.execute(
                "SELECT id FROM project_executions WHERE status IN ('queued','running')"
            ).fetchall()
            for row in active:
                execution_id = str(row["id"])
                conn.execute(
                    "UPDATE project_executions SET status='interrupted',finished_at=?,"
                    "error='服务重启，未完成的执行已标记为中断' WHERE id=?",
                    (now, execution_id),
                )
                conn.execute(
                    "UPDATE execution_steps SET status='interrupted',error='服务重启，步骤未完成' "
                    "WHERE execution_id=? AND status IN ('queued','running')",
                    (execution_id,),
                )
            # 模块运行行（runs）过去没被回收：服务重启后它们永远停在 queued/running，
            # 既让项目列表显示「运行中」，又触发 singleInstance 的「已在运行」拦截，谁也点不动。
            orphan_runs = conn.execute(
                "SELECT id FROM runs WHERE status IN ('queued','running')"
            ).fetchall()
            for row in orphan_runs:
                conn.execute(
                    "UPDATE runs SET status='interrupted',finished_at=?,"
                    "error='服务重启，未完成的模块运行已标记为中断' WHERE id=?",
                    (now, str(row["id"])),
                )

    async def start(self, project_id: str, action: str = "run") -> dict[str, Any]:
        if action not in {"run", "stop", "restart"}:
            raise ValueError("不支持的项目动作")
        lock = self._project_locks.setdefault(project_id, asyncio.Lock())
        async with lock:
            if self.db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
                raise LookupError("项目不存在")
            active = self.db.fetch_one(
                "SELECT id FROM project_executions WHERE project_id=? AND status IN ('queued','running') LIMIT 1",
                (project_id,),
            )
            if active is not None:
                if action == "run":
                    raise RuntimeError("项目已有执行中的操作")
                await self._interrupt_execution(str(active["id"]))

            modules = self._enabled_modules(project_id)
            steps = self._plan_steps(modules, action)
            for step in steps:
                self.runner.validate_module_action(step["module_id"], step["action"])

            execution_id = str(uuid4())
            now = utc_now()
            with self.db.connect() as conn:
                conn.execute(
                    "INSERT INTO project_executions(id,project_id,action,status,started_at) VALUES(?,?,?,?,?)",
                    (execution_id, project_id, action, "queued", now),
                )
                for order, step in enumerate(steps):
                    conn.execute(
                        "INSERT INTO execution_steps(id,execution_id,sort_order,module_id,module_name,action,status) "
                        "VALUES(?,?,?,?,?,?,?)",
                        (
                            str(uuid4()), execution_id, order, step["module_id"], step["module_name"],
                            step["action"], "queued",
                        ),
                    )
            task = asyncio.create_task(self._execute(execution_id))
            self._tasks[execution_id] = task
            task.add_done_callback(lambda _: self._tasks.pop(execution_id, None))
            return self.get_execution(execution_id) or {}

    async def _interrupt_execution(self, execution_id: str) -> None:
        task = self._tasks.get(execution_id)
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            return
        now = utc_now()
        self.db.execute(
            "UPDATE execution_steps SET status='interrupted',error='项目操作已被关闭或重启请求强制中断' "
            "WHERE execution_id=? AND status IN ('queued','running')",
            (execution_id,),
        )
        self.db.execute(
            "UPDATE project_executions SET status='interrupted',finished_at=?,error='项目操作已被关闭或重启请求强制中断' "
            "WHERE id=? AND status IN ('queued','running')",
            (now, execution_id),
        )

    def get_execution(self, execution_id: str) -> dict[str, Any] | None:
        execution = self.db.fetch_one("SELECT * FROM project_executions WHERE id=?", (execution_id,))
        if execution is None:
            return None
        steps = self.db.fetch_all(
            "SELECT * FROM execution_steps WHERE execution_id=? ORDER BY sort_order,id", (execution_id,)
        )
        for step in steps:
            step["run"] = self.runner.get_run(step["run_id"]) if step.get("run_id") else None
        execution["steps"] = steps
        return execution

    def legacy_run_payload(self, execution_id: str) -> dict[str, Any] | None:
        execution = self.get_execution(execution_id)
        if execution is None:
            return None
        completed = [step for step in execution["steps"] if step.get("run")]
        latest = completed[-1].get("run") if completed else None
        payload = dict(latest or {})
        # The existing page still polls /api/runs. Keep its familiar fields while
        # exposing the execution id and ordered steps for the newer API.
        payload.update({
            "id": execution["id"],
            "execution_id": execution["id"],
            "project_id": execution["project_id"],
            "action": execution["action"],
            "status": "succeeded" if execution["status"] == "stopped" else execution["status"],
            "started_at": execution["started_at"],
            "finished_at": execution["finished_at"],
            "error": payload.get("error") or execution["error"],
            "logs": payload.get("logs", []),
            "result": payload.get("result"),
            "steps": execution["steps"],
        })
        return payload

    def _enabled_modules(self, project_id: str) -> list[dict[str, Any]]:
        rows = self.db.fetch_all(
            "SELECT m.id,m.name FROM project_modules pm JOIN modules m ON m.id=pm.module_id "
            "WHERE pm.project_id=? AND pm.enabled=1 AND m.enabled=1 ORDER BY pm.sort_order,m.id",
            (project_id,),
        )
        if not rows:
            raise ValueError("项目没有可执行模块")
        return rows

    def _plan_steps(self, modules: list[dict[str, Any]], action: str) -> list[dict[str, Any]]:
        if action == "run":
            return [{**module, "module_id": module["id"], "module_name": module["name"], "action": "run"} for module in modules]
        stoppable = [module for module in modules if self.runner.supports_action(module["id"], "stop")]
        if not stoppable:
            raise ValueError("项目没有可关闭的模块")
        # 网页等一次性模块不拥有进程，不会被假装成可关闭步骤。
        stop_steps = [
            {**module, "module_id": module["id"], "module_name": module["name"], "action": "stop"}
            for module in reversed(stoppable)
        ]
        if action == "stop":
            return stop_steps
        return stop_steps + [
            {**module, "module_id": module["id"], "module_name": module["name"], "action": "run"}
            for module in modules
        ]

    async def _execute(self, execution_id: str) -> None:
        execution = self.get_execution(execution_id)
        if execution is None:
            return
        self.db.execute("UPDATE project_executions SET status='running' WHERE id=?", (execution_id,))
        final_status = "succeeded"
        error: str | None = None
        try:
            for step in execution["steps"]:
                self.db.execute("UPDATE execution_steps SET status='running' WHERE id=?", (step["id"],))
                try:
                    started = await self.runner.start_module(
                        execution["project_id"], step["module_id"], step["action"]
                    )
                    run_id = str(started["id"])
                    self.db.execute("UPDATE execution_steps SET run_id=? WHERE id=?", (run_id, step["id"]))
                    run = await self._wait_for_run(run_id)
                    if run is None or run["status"] != "succeeded":
                        error = str((run or {}).get("error") or "模块执行未成功")
                        self.db.execute(
                            "UPDATE execution_steps SET status='failed',error=? WHERE id=?", (error, step["id"])
                        )
                        final_status = "failed"
                        break
                    step_status = "stopped" if step["action"] == "stop" else "succeeded"
                    self.db.execute("UPDATE execution_steps SET status=? WHERE id=?", (step_status, step["id"]))
                except Exception as exc:  # noqa: BLE001 - persisted as the execution failure
                    error = f"{type(exc).__name__}: {exc}"
                    self.db.execute(
                        "UPDATE execution_steps SET status='failed',error=? WHERE id=?", (error, step["id"])
                    )
                    final_status = "failed"
                    break
        except asyncio.CancelledError:
            error = "项目操作已被关闭或重启请求强制中断"
            active_steps = self.db.fetch_all(
                "SELECT run_id FROM execution_steps WHERE execution_id=? AND status IN ('queued','running')",
                (execution_id,),
            )
            for step in active_steps:
                if step.get("run_id"):
                    await self.runner.cancel_run(str(step["run_id"]), error)
            self.db.execute(
                "UPDATE execution_steps SET status='interrupted',error=? "
                "WHERE execution_id=? AND status IN ('queued','running')",
                (error, execution_id),
            )
            final_status = "interrupted"
        if final_status == "succeeded" and execution["action"] == "stop":
            final_status = "stopped"
        self.db.execute(
            "UPDATE project_executions SET status=?,finished_at=?,error=? WHERE id=?",
            (final_status, utc_now(), error, execution_id),
        )

    async def _wait_for_run(self, run_id: str) -> dict[str, Any] | None:
        while True:
            run = self.runner.get_run(run_id)
            if run is None or run["status"] not in RUNNING_STATES:
                return run
            if not self.runner.run_is_live(run_id):
                # 任务已经收摊，状态却还停在 queued/running：要么是异常从落库之前逃掉了，
                # 要么它根本不是本进程发起的（重启前留下的孤儿行）。
                # 早期这里会一直 20ms 空转下去 —— 项目永远显示「运行中」，还白烧 CPU。
                # 交回去让上层按「未成功」收尾，比无声挂起诚实。
                return run
            await asyncio.sleep(0.02)
