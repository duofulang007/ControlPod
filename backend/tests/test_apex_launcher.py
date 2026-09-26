from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


RUNNER_PATH = Path(__file__).resolve().parents[1] / "modules" / "apex-launcher" / "runner.py"
SPEC = importlib.util.spec_from_file_location("apex_console_launcher", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


def test_worker_port_occupied_is_left_alone(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """8766 被非 APEX 服务占用时必须报错退出，绝不启动也不接管别人的进程。"""
    monkeypatch.setattr(launcher, "worker_healthy", lambda: False)
    monkeypatch.setattr(launcher, "worker_port_occupied", lambda: True)

    with pytest.raises(launcher.LauncherError, match="未知服务占用"):
        launcher.ensure_worker(tmp_path / "module.log")


def test_ensure_worker_returns_early_when_already_healthy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(launcher, "worker_healthy", lambda: True)

    launcher.ensure_worker(tmp_path / "module.log")

    log_path = tmp_path / "module.log"
    assert not log_path.exists() or "已启动" not in log_path.read_text(encoding="utf-8")


def test_execute_action_reports_settled_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "ensure_worker", lambda _log_path: None)
    monkeypatch.setattr(
        launcher,
        "request_json",
        lambda path, method="GET", timeout=10.0: {"state": "running", "revision": 7},
    )

    assert launcher.execute_action("run", tmp_path / "module.log")["state"] == "running"


def test_execute_action_surfaces_settle_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    responses = {
        "/actions/stop": {"state": "running", "revision": 3},
        "/wait?target=stopped&revision=3": {"state": "running", "last_error": "synthetic stop failure"},
    }
    monkeypatch.setattr(launcher, "ensure_worker", lambda _log_path: None)
    monkeypatch.setattr(
        launcher,
        "request_json",
        lambda path, method="GET", timeout=10.0: responses[path],
    )

    with pytest.raises(launcher.LauncherError, match="synthetic stop failure"):
        launcher.execute_action("stop", tmp_path / "module.log")
