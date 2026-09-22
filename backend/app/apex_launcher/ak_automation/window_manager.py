# -*- coding: utf-8 -*-
"""Fresh-HWND discovery, activation, and readiness verification for AK."""

from __future__ import annotations

import ctypes
import ctypes.wintypes
import logging
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Protocol

from .errors import AkAutomationError

try:
    import win32con
    import win32gui
    import win32process
except Exception:  # pragma: no cover - exercised by dependency preflight
    win32con = None
    win32gui = None
    win32process = None


AK_WINDOW_TITLE = "AK加速器"


class LoggerLike(Protocol):
    def info(self, message: str) -> Any: ...
    def error(self, message: str) -> Any: ...


@dataclass(frozen=True)
class WindowSnapshot:
    pid: int
    hwnd: int
    title: str
    class_name: str
    rectangle: tuple[int, int, int, int]
    visible: bool
    minimized: bool
    foreground: bool
    focused: bool
    focus_hwnd: int | None
    enabled: bool
    responsive: bool
    observed_at: float

    @property
    def usable(self) -> bool:
        return (
            self.visible
            and not self.minimized
            and self.foreground
            and self.focused
            and self.enabled
            and self.responsive
        )

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["hwnd_hex"] = f"0x{self.hwnd:08X}"
        data["usable"] = self.usable
        return data


def _log(logger: LoggerLike | logging.Logger | None, level: str, message: str) -> None:
    target = logger or logging.getLogger(__name__)
    writer = getattr(target, level, None) or getattr(target, "info", None)
    if callable(writer):
        writer(message)


def _require_windows() -> None:
    if os.name != "nt" or win32gui is None or win32con is None or win32process is None:
        raise AkAutomationError(
            "window",
            "WINDOW_API_UNAVAILABLE",
            "Windows/pywin32 窗口 API 不可用。",
        )


class _GuiThreadInfo(ctypes.Structure):
    _fields_ = (
        ("cbSize", ctypes.wintypes.DWORD),
        ("flags", ctypes.wintypes.DWORD),
        ("hwndActive", ctypes.wintypes.HWND),
        ("hwndFocus", ctypes.wintypes.HWND),
        ("hwndCapture", ctypes.wintypes.HWND),
        ("hwndMenuOwner", ctypes.wintypes.HWND),
        ("hwndMoveSize", ctypes.wintypes.HWND),
        ("hwndCaret", ctypes.wintypes.HWND),
        ("rcCaret", ctypes.wintypes.RECT),
    )


def _focused_hwnd(thread_id: int) -> int | None:
    info = _GuiThreadInfo()
    info.cbSize = ctypes.sizeof(info)
    try:
        if not ctypes.windll.user32.GetGUIThreadInfo(thread_id, ctypes.byref(info)):
            return None
        return int(info.hwndFocus) if info.hwndFocus else None
    except Exception:
        return None


def _is_responsive(hwnd: int, timeout_ms: int = 250) -> bool:
    result = ctypes.c_size_t()
    try:
        sent = ctypes.windll.user32.SendMessageTimeoutW(
            hwnd,
            0x0000,  # WM_NULL
            0,
            0,
            0x0002,  # SMTO_ABORTIFHUNG
            timeout_ms,
            ctypes.byref(result),
        )
        return bool(sent)
    except Exception:
        return False


def _focus_belongs_to_window(hwnd: int, focus_hwnd: int | None) -> bool:
    if not focus_hwnd:
        return False
    if focus_hwnd == hwnd:
        return True
    try:
        return bool(win32gui.IsChild(hwnd, focus_hwnd))
    except Exception:
        return False


def read_window_state(hwnd: int, *, expected_pid: int | None = None) -> WindowSnapshot:
    """Read every relevant state again; no cached property is trusted."""
    _require_windows()
    if not hwnd or not win32gui.IsWindow(hwnd):
        raise AkAutomationError(
            "window", "STALE_WINDOW_HANDLE", "窗口句柄已失效。", hwnd=hwnd
        )
    try:
        thread_id, pid = win32process.GetWindowThreadProcessId(hwnd)
        pid = int(pid)
        if expected_pid is not None and pid != expected_pid:
            raise AkAutomationError(
                "window",
                "WINDOW_OWNER_CHANGED",
                "窗口句柄仍存在，但已不属于预期 AK 进程。",
                hwnd=hwnd,
                expected_pid=expected_pid,
                actual_pid=pid,
            )
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        focus_hwnd = _focused_hwnd(int(thread_id))
        foreground_hwnd = int(win32gui.GetForegroundWindow())
        return WindowSnapshot(
            pid=pid,
            hwnd=int(hwnd),
            title=win32gui.GetWindowText(hwnd),
            class_name=win32gui.GetClassName(hwnd),
            rectangle=(int(left), int(top), int(right), int(bottom)),
            visible=bool(win32gui.IsWindowVisible(hwnd)),
            minimized=bool(win32gui.IsIconic(hwnd)),
            foreground=foreground_hwnd == int(hwnd),
            focused=_focus_belongs_to_window(int(hwnd), focus_hwnd),
            focus_hwnd=focus_hwnd,
            enabled=bool(win32gui.IsWindowEnabled(hwnd)),
            responsive=_is_responsive(int(hwnd)),
            observed_at=time.time(),
        )
    except AkAutomationError:
        raise
    except Exception as exc:
        raise AkAutomationError(
            "window",
            "WINDOW_STATE_READ_FAILED",
            "读取 AK 窗口状态失败。",
            hwnd=hwnd,
            error=f"{type(exc).__name__}: {exc}",
        ) from exc


def enumerate_process_windows(process_ids: Iterable[int]) -> list[WindowSnapshot]:
    _require_windows()
    allowed = {int(pid) for pid in process_ids}
    snapshots: list[WindowSnapshot] = []

    def callback(hwnd: int, _unused: Any) -> bool:
        try:
            _thread_id, pid = win32process.GetWindowThreadProcessId(hwnd)
            if int(pid) in allowed:
                snapshots.append(read_window_state(int(hwnd), expected_pid=int(pid)))
        except AkAutomationError:
            pass
        return True

    win32gui.EnumWindows(callback, None)
    return snapshots


def _window_area(window: WindowSnapshot) -> int:
    left, top, right, bottom = window.rectangle
    return max(0, right - left) * max(0, bottom - top)


def select_main_window(
    windows: Iterable[WindowSnapshot], title: str = AK_WINDOW_TITLE
) -> WindowSnapshot | None:
    candidates = list(windows)
    if not candidates:
        return None
    exact = [window for window in candidates if window.title.casefold() == title.casefold()]
    if exact:
        return max(exact, key=lambda window: (window.visible, _window_area(window)))
    partial = [window for window in candidates if title.casefold() in window.title.casefold()]
    if partial:
        return max(partial, key=lambda window: (window.visible, _window_area(window)))
    return None


def get_fresh_main_window(
    ak_path: str | Path,
    *,
    title: str = AK_WINDOW_TITLE,
    process_names: tuple[str, ...] = ("AK.exe", "AKPlatform.exe"),
) -> WindowSnapshot | None:
    """Re-enumerate verified processes and HWNDs on every call."""
    from .process_manager import find_ak_processes

    processes = find_ak_processes(ak_path, process_names=process_names)
    if not processes:
        return None
    return select_main_window(enumerate_process_windows(process.pid for process in processes), title)


def _attempt_focus(hwnd: int) -> str | None:
    errors: list[str] = []
    attached: list[tuple[int, int]] = []
    current_thread = int(ctypes.windll.kernel32.GetCurrentThreadId())
    try:
        target_thread, _pid = win32process.GetWindowThreadProcessId(hwnd)
        foreground_hwnd = int(win32gui.GetForegroundWindow())
        foreground_thread = 0
        if foreground_hwnd:
            foreground_thread, _pid = win32process.GetWindowThreadProcessId(foreground_hwnd)
        for other_thread in {int(target_thread), int(foreground_thread)} - {0, current_thread}:
            try:
                if ctypes.windll.user32.AttachThreadInput(current_thread, other_thread, True):
                    attached.append((current_thread, other_thread))
            except Exception as exc:
                errors.append(f"AttachThreadInput({other_thread}): {exc}")
        try:
            win32gui.SetForegroundWindow(hwnd)
        except Exception as exc:
            errors.append(f"SetForegroundWindow: {exc}")
        try:
            win32gui.BringWindowToTop(hwnd)
        except Exception as exc:
            errors.append(f"BringWindowToTop: {exc}")
        try:
            win32gui.SetFocus(hwnd)
        except Exception as exc:
            errors.append(f"SetFocus: {exc}")
    finally:
        for own_thread, other_thread in reversed(attached):
            try:
                ctypes.windll.user32.AttachThreadInput(own_thread, other_thread, False)
            except Exception:
                pass
    return "; ".join(errors) or None


def capture_window_evidence(
    window: WindowSnapshot,
    diagnostic_dir: str | Path | None,
    reason: str,
) -> str | None:
    if diagnostic_dir is None:
        return None
    try:
        from PIL import ImageGrab

        left, top, right, bottom = window.rectangle
        if right <= left or bottom <= top:
            return None
        folder = Path(diagnostic_dir)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"ak-window-{reason}-{int(time.time() * 1000)}.png"
        ImageGrab.grab(bbox=(left, top, right, bottom), all_screens=True).save(path)
        return str(path)
    except Exception:
        return None


def _state_failure(snapshot: WindowSnapshot) -> tuple[str, str]:
    if not snapshot.visible:
        return "WINDOW_NOT_VISIBLE", "AK 窗口仍不可见。"
    if snapshot.minimized:
        return "WINDOW_STILL_MINIMIZED", "AK 窗口仍处于最小化状态。"
    if not snapshot.enabled:
        return "WINDOW_DISABLED", "AK 窗口当前未启用，可能有模态窗口阻塞。"
    if not snapshot.responsive:
        return "WINDOW_NOT_RESPONDING", "AK 窗口未在超时内响应。"
    if not snapshot.foreground:
        return "WINDOW_FOREGROUND_FAILED", "AK 窗口未成为前台窗口。"
    if not snapshot.focused:
        return "WINDOW_FOCUS_FAILED", "AK 窗口及其子控件均未获得键盘焦点。"
    return "WINDOW_NOT_USABLE", "AK 窗口未达到可操作状态。"


def wait_window_ready(
    window: WindowSnapshot,
    *,
    timeout: float = 5.0,
    poll_interval: float = 0.1,
    logger: LoggerLike | logging.Logger | None = None,
    diagnostic_dir: str | Path | None = None,
) -> WindowSnapshot:
    deadline = time.monotonic() + max(0.0, timeout)
    latest = window
    while True:
        latest = read_window_state(window.hwnd, expected_pid=window.pid)
        if latest.usable:
            _log(
                logger,
                "info",
                f"窗口可用：PID={latest.pid} HWND=0x{latest.hwnd:08X} "
                f"Visible={latest.visible} Minimized={latest.minimized} "
                f"Foreground={latest.foreground} Focused={latest.focused} "
                f"Enabled={latest.enabled} Responsive={latest.responsive}",
            )
            return latest
        if time.monotonic() >= deadline:
            code, message = _state_failure(latest)
            evidence_path = capture_window_evidence(latest, diagnostic_dir, code.lower())
            raise AkAutomationError(
                "window",
                code,
                message,
                timeout=timeout,
                window=latest.to_dict(),
                evidence_path=evidence_path,
            )
        time.sleep(max(0.01, poll_interval))


def ensure_window_usable(
    window: WindowSnapshot,
    *,
    timeout: float = 5.0,
    logger: LoggerLike | logging.Logger | None = None,
    diagnostic_dir: str | Path | None = None,
) -> WindowSnapshot:
    """Restore/show/activate one freshly verified HWND and confirm the result."""
    current = read_window_state(window.hwnd, expected_pid=window.pid)
    _log(
        logger,
        "info",
        f"准备窗口：PID={current.pid} HWND=0x{current.hwnd:08X} "
        f"Visible={current.visible} Minimized={current.minimized} "
        f"Foreground={current.foreground} Focused={current.focused}",
    )
    try:
        win32gui.ShowWindow(current.hwnd, win32con.SW_RESTORE)
        win32gui.SetWindowPos(
            current.hwnd,
            win32con.HWND_TOPMOST,
            0,
            0,
            0,
            0,
            win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW,
        )
        focus_error = _attempt_focus(current.hwnd)
        win32gui.SetWindowPos(
            current.hwnd,
            win32con.HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW,
        )
    except Exception as exc:
        latest = read_window_state(current.hwnd, expected_pid=current.pid)
        evidence_path = capture_window_evidence(latest, diagnostic_dir, "prepare-failed")
        raise AkAutomationError(
            "window",
            "WINDOW_PREPARE_FAILED",
            "恢复、显示或激活 AK 窗口时 Windows API 失败。",
            error=f"{type(exc).__name__}: {exc}",
            window=latest.to_dict(),
            evidence_path=evidence_path,
        ) from exc

    try:
        return wait_window_ready(
            current,
            timeout=timeout,
            logger=logger,
            diagnostic_dir=diagnostic_dir,
        )
    except AkAutomationError as exc:
        exc.details.setdefault("focus_attempt_error", focus_error)
        raise


def wait_for_fresh_main_window(
    ak_path: str | Path,
    *,
    title: str = AK_WINDOW_TITLE,
    process_names: tuple[str, ...] = ("AK.exe", "AKPlatform.exe"),
    timeout: float = 15.0,
    poll_interval: float = 0.2,
    logger: LoggerLike | logging.Logger | None = None,
) -> WindowSnapshot:
    deadline = time.monotonic() + max(0.0, timeout)
    last_pids: list[int] = []
    while True:
        from .process_manager import find_ak_processes

        processes = find_ak_processes(ak_path, process_names=process_names)
        last_pids = [process.pid for process in processes]
        if processes:
            window = select_main_window(
                enumerate_process_windows(process.pid for process in processes), title
            )
            if window is not None:
                _log(
                    logger,
                    "info",
                    f"获取新窗口：PID={window.pid} HWND=0x{window.hwnd:08X} "
                    f"Title={window.title!r} Class={window.class_name!r}",
                )
                return window
        if time.monotonic() >= deadline:
            code = "WINDOW_TIMEOUT" if last_pids else "PROCESS_EXITED_DURING_START"
            message = (
                "AK 进程存在，但主窗口未在超时内出现。"
                if last_pids
                else "启动命令执行后未发现仍在运行的 AK 进程。"
            )
            raise AkAutomationError(
                "window" if last_pids else "process",
                code,
                message,
                timeout=timeout,
                last_pids=last_pids,
            )
        time.sleep(max(0.01, poll_interval))


def request_close_for_processes(process_ids: Iterable[int]) -> int:
    """Post WM_CLOSE only to current windows owned by the supplied PIDs."""
    _require_windows()
    allowed = {int(pid) for pid in process_ids}
    sent = 0

    def callback(hwnd: int, _unused: Any) -> bool:
        nonlocal sent
        try:
            _thread_id, pid = win32process.GetWindowThreadProcessId(hwnd)
            if int(pid) in allowed and win32gui.IsWindowVisible(hwnd):
                win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                sent += 1
        except Exception:
            pass
        return True

    win32gui.EnumWindows(callback, None)
    return sent
