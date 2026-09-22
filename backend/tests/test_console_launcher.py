from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess

import pytest


LAUNCHER_PATH = Path(__file__).resolve().parents[1] / "console_launcher.py"
SPEC = importlib.util.spec_from_file_location("apex_console_one_click", LAUNCHER_PATH)
assert SPEC is not None and SPEC.loader is not None
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


def test_netstat_parser_finds_only_requested_listening_port() -> None:
    output = """
  TCP    127.0.0.1:8000       0.0.0.0:0       LISTENING       111
  TCP    127.0.0.1:8765       0.0.0.0:0       LISTENING       222
  TCP    127.0.0.1:8765       127.0.0.1:50000 ESTABLISHED     333
"""
    assert launcher.parse_netstat_listener(output) == 222


def test_launch_plan_combines_start_open_and_restart() -> None:
    healthy = {"status": "ok", "service": "apex-console"}
    assert launcher.plan_launch(None, None, "old", "new") == "start"
    assert launcher.plan_launch(healthy, 222, "same", "same") == "open"
    assert launcher.plan_launch(healthy, 222, "old", "new") == "restart"


def test_launch_plan_never_stops_an_unknown_port_owner() -> None:
    with pytest.raises(launcher.ConsoleLaunchError, match="其他程序占用"):
        launcher.plan_launch({"status": "ok", "service": "other"}, 999, "", "new")


def test_restart_requests_elevation_before_stopping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    healthy = {"status": "ok", "service": "apex-console"}
    monkeypatch.setattr(launcher, "source_fingerprint", lambda: "new")
    monkeypatch.setattr(launcher, "read_saved_fingerprint", lambda: "old")
    monkeypatch.setattr(launcher, "read_health", lambda: healthy)
    monkeypatch.setattr(launcher, "listener_pid", lambda: 222)
    monkeypatch.setattr(launcher, "current_process_is_elevated", lambda: False)
    monkeypatch.setattr(launcher, "can_terminate_process", lambda _pid: False)
    stopped: list[int] = []
    monkeypatch.setattr(launcher, "stop_console", lambda pid: stopped.append(pid))

    with pytest.raises(launcher.ElevationRequired):
        launcher.run(open_browser=False)

    assert stopped == []


def test_start_console_never_allocates_a_background_console(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    python = tmp_path / ".venv" / "Scripts" / "python.exe"
    python.parent.mkdir(parents=True)
    python.touch()
    monkeypatch.setattr(launcher, "BACKEND_DIR", tmp_path)
    monkeypatch.setattr(launcher, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(launcher, "PID_PATH", tmp_path / "data" / "pid")
    monkeypatch.setattr(launcher, "STDOUT_PATH", tmp_path / "data" / "out.log")
    monkeypatch.setattr(launcher, "STDERR_PATH", tmp_path / "data" / "err.log")
    captured: dict = {}

    class FakeProcess:
        pid = 123

    def fake_popen(*args, **kwargs):
        captured.update(kwargs)
        return FakeProcess()

    monkeypatch.setattr(launcher.subprocess, "Popen", fake_popen)

    launcher.start_console()

    flags = captured["creationflags"]
    assert flags & subprocess.CREATE_NO_WINDOW
    assert not flags & subprocess.DETACHED_PROCESS


def test_open_site_prefers_a_standalone_browser_app_window(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = tmp_path / "msedge.exe"
    browser.touch()
    calls: list[tuple[list[str], dict]] = []
    monkeypatch.setattr(launcher, "find_app_browser", lambda: browser)
    monkeypatch.setattr(
        launcher.subprocess,
        "Popen",
        lambda args, **kwargs: calls.append((args, kwargs)),
    )

    launcher.open_site("abcdef1234567890")

    assert calls[0][0] == [str(browser), "--app=http://127.0.0.1:8765/?v=abcdef123456"]
    assert calls[0][1]["creationflags"] & subprocess.CREATE_NO_WINDOW
