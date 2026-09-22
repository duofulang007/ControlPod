from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


RUNNER_PATH = Path(__file__).resolve().parents[1] / "modules" / "apex-launcher" / "runner.py"
SPEC = importlib.util.spec_from_file_location("apex_console_launcher", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


def test_restart_runs_complete_stop_before_start(tmp_path: Path) -> None:
    calls: list[tuple[str, str]] = []

    def transition(action: str, target: str, _log_path: Path) -> dict:
        calls.append((action, target))
        return {"state": target}

    result = launcher.execute_action("restart", tmp_path / "module.log", transition)

    assert calls == [("stop", "stopped"), ("start", "running")]
    assert result["state"] == "running"


def test_restart_stops_at_failed_shutdown(tmp_path: Path) -> None:
    calls: list[tuple[str, str]] = []

    def transition(action: str, target: str, _log_path: Path) -> dict:
        calls.append((action, target))
        raise launcher.LauncherError("synthetic stop failure")

    with pytest.raises(launcher.LauncherError, match="synthetic stop failure"):
        launcher.execute_action("restart", tmp_path / "module.log", transition)

    assert calls == [("stop", "stopped")]


def test_backend_compatibility_requires_exact_apex_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = {
        "/api/health": {"status": "ok"},
        "/openapi.json": {"info": {"title": "Apex Launcher API"}},
        "/api/apex/automation-info": {"revision": "window-focus-v7"},
    }
    monkeypatch.setattr(launcher, "request_json", lambda path, timeout=0: responses[path])
    assert launcher.backend_compatible() is True

    responses["/api/apex/automation-info"] = {"revision": "old-revision"}
    assert launcher.backend_compatible() is False


def test_unknown_port_owner_is_never_stopped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(launcher, "backend_compatible", lambda: False)
    monkeypatch.setattr(launcher, "backend_owner_pid", lambda: 456)
    stopped: list[int] = []
    monkeypatch.setattr(
        launcher,
        "stop_verified_backend",
        lambda pid, _log_path: stopped.append(pid),
    )

    with pytest.raises(launcher.LauncherError, match="unknown service"):
        launcher.ensure_backend(tmp_path, tmp_path / "module.log")

    assert stopped == []
