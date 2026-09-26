from __future__ import annotations

import asyncio
import json
import os
import time
import webbrowser
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from .db import Database, utc_now
from .module_registry import ModuleDefinition, ModuleRegistry


RUNNING_STATES = {"queued", "running"}


class ModuleRunner:
    def __init__(
        self,
        db: Database,
        registry: ModuleRegistry,
        runs_dir: Path,
        web_opener: Callable[[str], bool] | None = None,
        application_resolver: Callable[[str], dict[str, Any]] | None = None,
        application_launcher: Callable[[str], dict[str, Any]] | None = None,
    ) -> None:
        self.db = db
        self.registry = registry
        self.runs_dir = Path(runs_dir)
        self.web_opener = web_opener or self._default_web_opener
        self.application_resolver = application_resolver
        self.application_launcher = application_launcher
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._module_runs: dict[str, str] = {}

    def sync_registry(self) -> None:
        now = utc_now()
        for item in self.registry.all():
            self.db.execute(
                "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) "
                "VALUES(?,?,'script','',?,'',?,?,1,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, type='script', entry=excluded.entry, "
                "version=excluded.version, manifest_path=excluded.manifest_path, enabled=1, updated_at=excluded.updated_at",
                (item.id, item.name, item.id, item.version, str(item.manifest_path), now),
            )
            self.db.execute(
                # 模块登记的项目的排在末尾，不插到用户已排好的卡片顺序最前面
                "INSERT OR IGNORE INTO projects(id,name,description,status,created_at,updated_at,sort_order) "
                "VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM projects))",
                (item.project_id, item.project_name, item.project_description, "正常", now, now),
            )
            self.db.execute(
                "INSERT OR IGNORE INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(?,?,0,1)",
                (item.project_id, item.id),
            )

    async def start_project(self, project_id: str, action: str = "run") -> dict[str, Any]:
        links = self.db.fetch_all(
            "SELECT m.id FROM project_modules pm JOIN modules m ON m.id=pm.module_id "
            "WHERE pm.project_id=? AND pm.enabled=1 AND m.enabled=1 ORDER BY pm.sort_order, m.id",
            (project_id,),
        )
        if not links:
            raise LookupError("项目没有可执行模块")
        if len(links) != 1:
            raise ValueError("第一版每个项目只允许一个执行模块")
        return await self.start_module(project_id, links[0]["id"], action)

    def validate_module_action(self, module_id: str, action: str) -> dict[str, Any]:
        """Check all preconditions without creating a run or starting a process."""
        stored = self.db.fetch_one("SELECT * FROM modules WHERE id=? AND enabled=1", (module_id,))
        if stored is None:
            raise LookupError("模块不存在或已停用")
        if stored.get("type") == "web":
            if action != "run":
                raise LookupError(f"网页模块不支持动作：{action}")
            return stored
        if stored.get("type") == "application":
            if action != "run":
                raise LookupError(f"应用模块不支持动作：{action}")
            if self.application_resolver is None:
                raise RuntimeError("应用启动器未配置")
            self.application_resolver(str(stored.get("entry") or ""))
            return stored
        module = self.registry.get(module_id)
        if module is None:
            raise LookupError("模块定义不存在")
        action_def = module.actions.get(action)
        if action_def is None:
            raise LookupError(f"模块不支持动作：{action}")
        if module.single_instance:
            active_id = self._module_runs.get(f"{module_id}:{action}")
            active = self.get_run(active_id) if active_id else None
            if active and active["status"] in RUNNING_STATES:
                raise RuntimeError(f"该模块的 {action} 动作已在运行")
        if not module.project_root.is_dir():
            raise FileNotFoundError(f"项目目录不存在：{module.project_root}")
        if not action_def.cwd.is_dir():
            raise FileNotFoundError(f"模块工作目录不存在：{action_def.cwd}")
        return stored

    def supports_action(self, module_id: str, action: str) -> bool:
        stored = self.db.fetch_one("SELECT type,enabled FROM modules WHERE id=?", (module_id,))
        if stored is None or not stored["enabled"]:
            return False
        if stored["type"] == "web":
            return action == "run"
        if stored["type"] == "application":
            return action == "run" and self.application_resolver is not None
        module = self.registry.get(module_id)
        return module is not None and action in module.actions

    async def start_module(self, project_id: str, module_id: str, action: str = "run") -> dict[str, Any]:
        stored = self.validate_module_action(module_id, action)
        if stored.get("type") == "web":
            return await self._start_web_module(project_id, stored, action)
        if stored.get("type") == "application":
            return await self._start_application_module(project_id, stored, action)
        module = self.registry.get(module_id)
        assert module is not None

        run_id = str(uuid4())
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=False)
        now = utc_now()
        self.db.execute(
            "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) VALUES(?,?,?,?,?,?,?)",
            (run_id, project_id, module_id, action, "queued", now, str(run_dir)),
        )
        active_key = f"{module_id}:{action}"
        self._module_runs[active_key] = run_id
        task = asyncio.create_task(self._execute(run_id, module, action, run_dir))
        self._tasks[run_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))
        return self.get_run(run_id) or {}

    def run_is_live(self, run_id: str) -> bool:
        """这个 run 在本进程里是否还有活着的执行任务。

        任务已结束（`_tasks` 里的条目被回收，或已 done）就意味着不会再有新的落库状态了 ——
        等待方必须据此收手，不能对着一个不再变化的 'running' 行无限空转。
        """
        task = self._tasks.get(run_id)
        return task is not None and not task.done()

    async def cancel_run(self, run_id: str, reason: str) -> None:
        """Stop a live module process and persist an honest interrupted state."""
        task = self._tasks.get(run_id)
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        run = self.get_run(run_id)
        if run is not None and run["status"] in RUNNING_STATES:
            self.db.execute(
                "UPDATE runs SET status='interrupted',finished_at=?,error=? WHERE id=?",
                (utc_now(), reason, run_id),
            )

    async def _start_web_module(
        self, project_id: str, module: dict[str, Any], action: str
    ) -> dict[str, Any]:
        if action != "run":
            raise LookupError(f"网页模块不支持动作：{action}")
        run_id = str(uuid4())
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=False)
        self.db.execute(
            "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) VALUES(?,?,?,?,?,?,?)",
            (run_id, project_id, module["id"], action, "queued", utc_now(), str(run_dir)),
        )
        task = asyncio.create_task(self._execute_web(run_id, module, run_dir))
        self._tasks[run_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))
        return self.get_run(run_id) or {}

    async def _execute_web(self, run_id: str, module: dict[str, Any], run_dir: Path) -> None:
        self.db.execute("UPDATE runs SET status='running' WHERE id=?", (run_id,))
        log_path = run_dir / "module.log"
        result_path = run_dir / "result.json"
        url = str(module.get("entry") or "")
        status = "failed"
        error: str | None = None
        exit_code: int | None = None
        try:
            log_path.write_text(f"[STEP] 正在打开网页：{url}\n", encoding="utf-8")
            opened = await asyncio.to_thread(self.web_opener, url)
            if opened is False:
                raise RuntimeError("系统浏览器未接受打开请求")
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(f"[OK] 已请求系统浏览器打开：{url}\n")
            result_path.write_text(
                json.dumps({"ok": True, "type": "web", "url": url}, ensure_ascii=False),
                encoding="utf-8",
            )
            status = "succeeded"
            exit_code = 0
        except Exception as exc:  # noqa: BLE001 - stored as a real run failure
            error = f"{type(exc).__name__}: {exc}"
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(f"[ERROR] {error}\n")
        finally:
            self.db.execute(
                "UPDATE runs SET status=?,finished_at=?,exit_code=?,error=? WHERE id=?",
                (status, utc_now(), exit_code, error, run_id),
            )

    async def _start_application_module(
        self, project_id: str, module: dict[str, Any], action: str
    ) -> dict[str, Any]:
        if action != "run":
            raise LookupError(f"应用模块不支持动作：{action}")
        run_id = str(uuid4())
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=False)
        self.db.execute(
            "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) VALUES(?,?,?,?,?,?,?)",
            (run_id, project_id, module["id"], action, "queued", utc_now(), str(run_dir)),
        )
        task = asyncio.create_task(self._execute_application(run_id, module, run_dir))
        self._tasks[run_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))
        return self.get_run(run_id) or {}

    async def _execute_application(
        self, run_id: str, module: dict[str, Any], run_dir: Path
    ) -> None:
        self.db.execute("UPDATE runs SET status='running' WHERE id=?", (run_id,))
        log_path = run_dir / "module.log"
        result_path = run_dir / "result.json"
        application_id = str(module.get("entry") or "")
        status = "failed"
        error: str | None = None
        exit_code: int | None = None
        try:
            if self.application_launcher is None:
                raise RuntimeError("应用启动器未配置")
            log_path.write_text(f"[STEP] 正在启动应用：{module['name']}\n", encoding="utf-8")
            await asyncio.to_thread(self.application_launcher, application_id)
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(f"[OK] 已请求 Windows 启动应用：{module['name']}\n")
            result_path.write_text(
                json.dumps(
                    {"ok": True, "type": "application", "application_id": application_id},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            status = "succeeded"
            exit_code = 0
        except Exception as exc:  # noqa: BLE001 - stored as a real run failure
            error = f"{type(exc).__name__}: {exc}"
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write(f"[ERROR] {error}\n")
        finally:
            self.db.execute(
                "UPDATE runs SET status=?,finished_at=?,exit_code=?,error=? WHERE id=?",
                (status, utc_now(), exit_code, error, run_id),
            )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        row = self.db.fetch_one("SELECT * FROM runs WHERE id=?", (run_id,))
        if row is None:
            return None
        run_dir = Path(row["run_dir"])
        row["logs"] = self._read_log(run_dir / "module.log")
        result_path = run_dir / "result.json"
        if result_path.exists():
            try:
                row["result"] = json.loads(result_path.read_text(encoding="utf-8-sig"))
            except (OSError, json.JSONDecodeError):
                row["result"] = None
        else:
            row["result"] = None
        return row

    @staticmethod
    def _read_log(path: Path, limit: int = 300) -> list[str]:
        try:
            lines = path.read_text(encoding="utf-8-sig", errors="replace").splitlines()
        except OSError:
            return []
        return lines[-limit:]

    def _run_values(self, module: ModuleDefinition, run_dir: Path) -> dict[str, str]:
        """动作参数的可用占位符集合。manifest 里能写哪些名字，全看这里。"""
        return {
            "module_dir": str(module.module_dir),
            "project_root": str(module.project_root),
            "console_root": str(self.registry.console_root),
            "run_dir": str(run_dir),
            "result_path": str(run_dir / "result.json"),
            "log_path": str(run_dir / "module.log"),
        }

    async def _execute(self, run_id: str, module: ModuleDefinition, action: str, run_dir: Path) -> None:
        self.db.execute("UPDATE runs SET status='running' WHERE id=?", (run_id,))
        result_path = run_dir / "result.json"
        log_path = run_dir / "module.log"
        stdout_path = run_dir / "process.stdout.log"
        stderr_path = run_dir / "process.stderr.log"
        values = self._run_values(module, run_dir)
        exit_code: int | None = None
        error: str | None = None
        status = "failed"
        proc: asyncio.subprocess.Process | None = None
        try:
            # 占位符展开必须留在这道 try 里面：manifest 里写了一个未知占位符时，
            # 异常若从 try 前面逃出去，下面的 finally 就不会执行，run 永远停在 'running'。
            # 后果不是「报个错」而是项目卡死在「运行中」——启动按钮消失、点关闭弹出的是别的流程，
            # 前端看上去就是「点了没反应」。（{console_root} 曾只在 projectRoot 里被替换，踩过这个坑。）
            action_def = module.actions[action]
            program = self._expand(action_def.program, values)
            args = [self._expand(arg, values) for arg in action_def.args]
            creationflags = (
                0
                if module.requires_admin
                else getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0)
            ) if os.name == "nt" else 0
            with stdout_path.open("wb") as stdout_handle, stderr_path.open("wb") as stderr_handle:
                proc = await asyncio.create_subprocess_exec(
                    program,
                    *args,
                    cwd=str(action_def.cwd),
                    stdout=stdout_handle,
                    stderr=stderr_handle,
                    creationflags=creationflags,
                )
                try:
                    exit_code = await asyncio.wait_for(proc.wait(), timeout=module.timeout_seconds)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
                    error = f"模块运行超时（{module.timeout_seconds} 秒）"
            if error is None:
                payload = self._read_result(result_path)
                if exit_code == 0 and payload.get("ok") is True:
                    status = "succeeded"
                else:
                    process_error = self._read_process_output(stderr_path) or self._read_process_output(stdout_path)
                    error = str(payload.get("error") or process_error or f"模块退出码 {exit_code}")
                    if process_error:
                        with log_path.open("a", encoding="utf-8") as handle:
                            for line in process_error.splitlines():
                                handle.write(f"[ERROR] {line}\n")
        except asyncio.CancelledError:
            error = "项目操作已被关闭或重启请求强制中断"
            status = "interrupted"
            if proc is not None and proc.returncode is None:
                proc.kill()
                await proc.wait()
        except Exception as exc:  # noqa: BLE001 - stored as a real run failure
            error = f"{type(exc).__name__}: {exc}"
        finally:
            # 先确认 result.json 落盘，再翻 runs.status。两者顺倒过来会有真实竞态：
            # /runtime 不看 runs.status，它重新读 result.json；子进程写文件与退出的
            # 可见顺序不保证（负载高时窗口可达几十毫秒），于是「状态已 succeeded 但
            # result.json 还读不到」会让 state 退化成 unknown——用户刚跑完就刷新看到空白。
            if status == "succeeded":
                self._wait_for_result_file(result_path)
            self.db.execute(
                "UPDATE runs SET status=?,finished_at=?,exit_code=?,error=? WHERE id=?",
                (status, utc_now(), exit_code, error, run_id),
            )
            active_key = f"{module.id}:{action}"
            if self._module_runs.get(active_key) == run_id:
                self._module_runs.pop(active_key, None)

    @staticmethod
    def _wait_for_result_file(result_path: Path, timeout: float = 2.0) -> None:
        deadline = time.monotonic() + timeout
        while not result_path.exists() and time.monotonic() < deadline:
            time.sleep(0.005)

    @staticmethod
    def _expand(value: str, values: dict[str, str]) -> str:
        result = value
        for key, replacement in values.items():
            result = result.replace("{" + key + "}", replacement)
        if "{" in result or "}" in result:
            raise ValueError(f"模块参数包含未知占位符：{value}")
        return result

    @staticmethod
    def _read_result(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        try:
            value = json.loads(path.read_text(encoding="utf-8-sig"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _read_process_output(path: Path) -> str:
        try:
            raw = path.read_bytes()
        except OSError:
            return ""
        if not raw:
            return ""
        for encoding in ("utf-8-sig", "utf-16", "gb18030"):
            try:
                return raw.decode(encoding).strip()
            except UnicodeDecodeError:
                continue
        return raw.decode(errors="replace").strip()

    @staticmethod
    def _default_web_opener(url: str) -> bool:
        if os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        return bool(webbrowser.open(url, new=2))
