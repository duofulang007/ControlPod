from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess

import pytest


LAUNCHER_PATH = Path(__file__).resolve().parents[1] / "console_launcher.py"
SPEC = importlib.util.spec_from_file_location("apex_console_one_click", LAUNCHER_PATH)
assert SPEC is not None and SPEC.loader is not None
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


@pytest.fixture(autouse=True)
def _never_touch_real_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """把 launcher 的全部落盘路径钉到 tmp，用例永远不许写真实 backend/data。

    回归（2026-09-22）：固定窗口分支的 `open_site` 会调用 `remember_app_window`，
    而它写的是真实的 `APP_WINDOW_PATH`。此前只有「钉 profile 目录」的用例，
    于是每次跑测试都把 `backend/data/console-app-window.json` 写成
    「pid=0 / profile=临时目录」，真实窗口句柄被抹掉、置顶功能失灵。
    这里统一隔离，同类泄漏不会再出现。
    """
    data = tmp_path / "data"
    data.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(launcher, "DATA_DIR", data)
    monkeypatch.setattr(launcher, "APP_WINDOW_PATH", data / "console-app-window.json")
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", data / "console-browser-profile")
    monkeypatch.setattr(launcher, "LOG_PATH", data / "console-launcher.log")
    monkeypatch.setattr(launcher, "PID_PATH", data / "apex-console.pid")
    monkeypatch.setattr(launcher, "STAMP_PATH", data / "console-source.stamp")
    monkeypatch.setattr(launcher, "STDOUT_PATH", data / "console-service.out.log")
    monkeypatch.setattr(launcher, "STDERR_PATH", data / "console-service.err.log")


class _InlineThread:
    """同步执行的 Thread 替身：让「后台线程」在测试里可以断言。"""

    def __init__(self, target=None, args=(), daemon=None, **kwargs) -> None:
        self._target = target
        self._args = args

    def start(self) -> None:
        if self._target is not None:
            self._target(*self._args)


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
    # 固定窗口会把 profile 建在 APP_WINDOW_PROFILE_DIR 下，启动前还会清理缓存，
    # 测试必须把它钉到 tmp，避免碰真实 data 目录。
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", tmp_path / "profile")
    state_path = tmp_path / "data" / "console-app-window.json"
    monkeypatch.setattr(launcher, "APP_WINDOW_PATH", state_path)
    monkeypatch.setattr(
        launcher.subprocess,
        "Popen",
        lambda args, **kwargs: calls.append((args, kwargs)),
    )

    launcher.open_site("abcdef1234567890")

    args = calls[0][0]
    # 核心意图：优先拉起独立浏览器 app 窗口，且应用 URL 带源码指纹参数。
    assert args[0] == str(browser)
    assert args[1] == "--app=http://127.0.0.1:8765/?v=abcdef123456"
    # 固定窗口额外参数（user-data-dir / 尺寸 / 位置 / 跳过首启向导）不参与顺序断言，
    # 但必须存在，否则窗口会退化成普通浏览器标签页。
    assert any(a.startswith("--user-data-dir=") for a in args)
    assert f"--window-size={launcher.APP_WINDOW_WIDTH},{launcher.APP_WINDOW_HEIGHT}" in args
    # 源头阻断：关掉组件更新，ProvenanceData / component_crx_cache 才不会重新下回来。
    assert "--disable-component-update" in args
    assert calls[0][1]["creationflags"] & subprocess.CREATE_NO_WINDOW
    # 回归：这条分支会落盘窗口状态，必须落在 tmp 而不是真实 data 目录。
    assert json.loads(state_path.read_text(encoding="utf-8"))["profile"] == str(tmp_path / "profile")
    # 启动时记下「上一次会话的峰值」，用来对照组件更新开关是否奏效。
    assert "profile at launch size=" in launcher.LOG_PATH.read_text(encoding="utf-8")


def test_prune_profile_removes_only_regenerable_caches(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = tmp_path / "profile"
    (profile / "ProvenanceData").mkdir(parents=True)
    (profile / "ProvenanceData" / "big.onnx").write_bytes(b"x" * 32)
    (profile / "component_crx_cache").mkdir()
    (profile / "Default" / "Cache").mkdir(parents=True)
    (profile / "BrowserMetrics-spare.pma").write_bytes(b"x")
    # 这两个是后续实测新发现会膨胀的 Edge 组件目录，必须也在清单里。
    (profile / "Subresource Filter").mkdir()
    (profile / "Edge Shopping").mkdir()
    keep = profile / "Default" / "Local Storage"
    keep.mkdir(parents=True)
    (keep / "keep").write_bytes(b"keep")
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", profile)

    removed = launcher.prune_profile()

    # 浏览器组件与缓存目录（含同名文件）被清掉，Default 主体必须原样保留。
    assert removed == 6
    assert not (profile / "ProvenanceData").exists()
    assert not (profile / "component_crx_cache").exists()
    assert not (profile / "Default" / "Cache").exists()
    assert not (profile / "BrowserMetrics-spare.pma").exists()
    assert not (profile / "Subresource Filter").exists()
    assert not (profile / "Edge Shopping").exists()
    assert (keep / "keep").read_bytes() == b"keep"


def test_prune_profile_is_a_noop_when_profile_is_absent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", tmp_path / "missing")

    assert launcher.prune_profile() == 0


def test_remember_app_window_keeps_pid_when_handle_is_not_ready(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """回归：窗口未出现时也必须落盘 pid，否则句柄永久为空、置顶按钮永远不可用。"""
    state_path = tmp_path / "console-app-window.json"
    monkeypatch.setattr(launcher, "DATA_DIR", tmp_path)
    monkeypatch.setattr(launcher, "APP_WINDOW_PATH", state_path)

    launcher.remember_app_window(4321, None)

    payload = json.loads(state_path.read_text(encoding="utf-8"))
    assert payload["pid"] == 4321
    assert payload["hwnd"] is None


def test_watch_app_window_backfills_handle_for_same_pid(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """回归：启动时没等到窗口，后台补写线程要把句柄补进同一份记录。"""
    state_path = tmp_path / "console-app-window.json"
    monkeypatch.setattr(launcher, "DATA_DIR", tmp_path)
    monkeypatch.setattr(launcher, "APP_WINDOW_PATH", state_path)
    launcher.remember_app_window(4321, None)

    monkeypatch.setattr(launcher, "wait_for_console_window", lambda *a, **k: 98765)
    launcher.watch_app_window(4321, timeout_seconds=0.1)

    assert json.loads(state_path.read_text(encoding="utf-8"))["hwnd"] == 98765


def test_watch_app_window_ignores_handle_for_replaced_pid(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """回归：记录已被新进程覆盖时，旧补写线程不得把陈旧句柄写回去。"""
    state_path = tmp_path / "console-app-window.json"
    monkeypatch.setattr(launcher, "DATA_DIR", tmp_path)
    monkeypatch.setattr(launcher, "APP_WINDOW_PATH", state_path)
    launcher.remember_app_window(9999, None)

    monkeypatch.setattr(launcher, "wait_for_console_window", lambda *a, **k: 98765)
    launcher.watch_app_window(4321, timeout_seconds=0.1)

    assert json.loads(state_path.read_text(encoding="utf-8"))["hwnd"] is None


def test_cleanup_after_exit_reclaims_profile_and_reports_size(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """随用随清：窗口退出后清掉浏览器重新下回来的组件，并把结果写进日志。"""
    profile = tmp_path / "profile"
    (profile / "component_crx_cache").mkdir(parents=True)
    (profile / "component_crx_cache" / "big.crx").write_bytes(b"x" * 4096)
    (profile / "Edge Shopping").mkdir()
    keep = profile / "Default" / "Preferences"
    keep.parent.mkdir(parents=True)
    keep.write_bytes(b"{}")
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", profile)

    class FakeProcess:
        waited = False

        def wait(self) -> int:
            FakeProcess.waited = True
            return 0

    launcher.cleanup_profile_after_exit(FakeProcess())

    assert FakeProcess.waited is True
    assert not (profile / "component_crx_cache").exists()
    assert not (profile / "Edge Shopping").exists()
    # Default 主体（窗口与站点状态）必须原样留着。
    assert keep.read_bytes() == b"{}"
    log = launcher.LOG_PATH.read_text(encoding="utf-8")
    assert "profile cleaned after exit entries=2 size=" in log


def test_cleanup_after_exit_survives_a_dead_process_handle(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """取不到进程退出状态时仍要完成清理，收尾不能半途而废。"""
    profile = tmp_path / "profile"
    (profile / "ProvenanceData").mkdir(parents=True)
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", profile)

    class BrokenProcess:
        def wait(self) -> int:
            raise OSError("handle closed")

    launcher.cleanup_profile_after_exit(BrokenProcess())

    assert not (profile / "ProvenanceData").exists()


def test_schedule_profile_cleanup_waits_for_exit_in_background(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """清理挂在后台线程上，启动本身不被阻塞，窗口一退出就生效。"""
    profile = tmp_path / "profile"
    (profile / "GrShaderCache").mkdir(parents=True)
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", profile)
    monkeypatch.setattr(launcher.threading, "Thread", _InlineThread)

    class FakeProcess:
        def wait(self) -> int:
            return 0

    launcher.schedule_profile_cleanup(FakeProcess())

    assert not (profile / "GrShaderCache").exists()


def test_open_site_schedules_cleanup_for_the_fixed_window(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """接线断言：固定窗口分支必须挂上「窗口退出即清理」。"""
    browser = tmp_path / "msedge.exe"
    browser.touch()
    cleaned: list = []

    class FakeProcess:
        pid = 4321

        def wait(self) -> int:
            return 0

    monkeypatch.setattr(launcher, "find_app_browser", lambda: browser)
    monkeypatch.setattr(launcher, "APP_WINDOW_PROFILE_DIR", tmp_path / "profile")
    monkeypatch.setattr(launcher, "wait_for_console_window", lambda *a, **k: None)
    monkeypatch.setattr(launcher.subprocess, "Popen", lambda args, **kwargs: FakeProcess())
    monkeypatch.setattr(launcher.threading, "Thread", _InlineThread)
    monkeypatch.setattr(
        launcher,
        "cleanup_profile_after_exit",
        lambda process: cleaned.append(process),
    )

    launcher.open_site("abcdef1234567890")

    assert [p.pid for p in cleaned] == [4321]
