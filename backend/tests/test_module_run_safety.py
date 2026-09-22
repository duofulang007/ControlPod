# -*- coding: utf-8 -*-
"""模块运行不能"卡住"：任何失败都要落到一个终态。

真实故障（2026-09-22 晚）：runner-lab 模块的 manifest 里写了 `{console_root}`，而当时占位符只在
`projectRoot` 里被替换。点「运行」后 `_expand` 抛 ValueError —— **而那次展开在 try 之外**，
`finally` 从不执行 → `runs.status` 永远停在 'running'。连锁反应：
项目列表显示「运行中」→ 启动按钮换成关闭/重启 → 等待循环每 20ms 空转不止 → 用户看到「点了没反应」。
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.execution_service import ExecutionService
from app.main import create_app


def _write_module(modules_dir: Path, project_root: Path, program: str, module_id: str = "broken") -> None:
    module_dir = modules_dir / module_id
    module_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 1,
        "id": module_id,
        "projectId": module_id,
        "projectName": "占位符项目",
        "name": "占位符模块",
        "version": "1.0.0",
        "projectRoot": str(project_root),
        "timeoutSeconds": 10,
        "actions": {
            "run": {"program": program, "cwd": "{module_dir}", "args": ["{nope}"]},
            "stop": {"program": program, "cwd": "{module_dir}", "args": ["{nope}"]},
        },
    }
    (module_dir / "module.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )


def _app(tmp_path: Path):
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir(parents=True, exist_ok=True)
    # program/args 里放一个没人认识的占位符：这正是当初把 run 卡死的形状。
    _write_module(modules_dir, project_root, r"{unknown_root}\python.exe")
    return create_app(
        db_path=tmp_path / "data" / "test.db",
        modules_dir=modules_dir,
        runs_dir=tmp_path / "data" / "runs",
        static_root=None,
    )


def test_bad_placeholder_ends_the_run_instead_of_leaving_it_running(tmp_path: Path) -> None:
    app = _app(tmp_path)
    with TestClient(app) as client:
        # 项目由 sync_registry 依 manifest 的 projectId 自动建好，不再另建一个（重名会被拒）。
        assert client.put("/api/projects/broken/modules/broken").status_code in {200, 201}

        started = client.post("/api/projects/broken/run")
        assert started.status_code == 202
        execution_id = started.json()["id"]

        deadline = time.monotonic() + 5
        payload: dict = {}
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{execution_id}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)

        assert payload["status"] == "failed", payload
        assert "占位符" in (payload.get("error") or ""), payload

        # 关键断言：底层的模块运行行也必须是终态。它卡在 running 的话，
        # 项目会永远显示「运行中」，而且 singleInstance 会拦住后续所有启动请求。
        step_run_id = payload["steps"][0]["run_id"]
        row = app.state.db.fetch_one("SELECT status,error FROM runs WHERE id=?", (step_run_id,))
        assert row is not None
        assert row["status"] == "failed", row
        assert "占位符" in (row["error"] or "")


def test_wait_for_run_does_not_spin_on_a_dead_run(tmp_path: Path) -> None:
    """没有活任务时，等待方必须立刻收手，不能每 20ms 空转下去。"""
    app = _app(tmp_path)
    db = app.state.db
    db.execute(
        "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) "
        "VALUES(?,?,?,?,?,?,?)",
        ("orphan-run", "broken", "broken", "run", "running", "2026-09-22", "runs/orphan"),
    )
    service = ExecutionService(db, app.state.runner)

    started_at = time.monotonic()
    result = asyncio.run(service._wait_for_run("orphan-run"))
    elapsed = time.monotonic() - started_at

    assert elapsed < 1.0, f"等待孤儿运行花了 {elapsed:.2f}s，说明还在空转"
    assert result is not None and result["status"] == "running"


def test_service_restart_settles_orphan_module_runs(tmp_path: Path) -> None:
    """重启后 runs 表里的僵尸行也要一起收尾，不能只收 project_executions。"""
    app = _app(tmp_path)
    app.state.db.execute(
        "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) "
        "VALUES(?,?,?,?,?,?,?)",
        ("stale-run", "broken", "broken", "run", "running", "2026-09-22", "runs/stale"),
    )
    assert app.state.db.fetch_one("SELECT status FROM runs WHERE id=?", ("stale-run",))["status"] == "running"

    restarted = _app(tmp_path)  # create_app 里会调 recover_interrupted()

    row = restarted.state.db.fetch_one("SELECT status,finished_at,error FROM runs WHERE id=?", ("stale-run",))
    assert row["status"] == "interrupted", row
    assert row["finished_at"]
    assert row["error"]


@pytest.mark.parametrize("action", ["run", "stop"])
def test_bad_placeholder_is_reported_for_every_action(tmp_path: Path, action: str) -> None:
    """run / stop 都会走到同一条展开逻辑，两边都得给出可读失败而不是静默卡住。"""
    app = _app(tmp_path)
    with TestClient(app) as client:
        assert client.put("/api/projects/broken/modules/broken").status_code in {200, 201}

        started = client.post(f"/api/projects/broken/{action}")
        assert started.status_code == 202
        execution_id = started.json()["id"]

        deadline = time.monotonic() + 5
        payload: dict = {}
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{execution_id}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)

        assert payload["status"] == "failed", payload
