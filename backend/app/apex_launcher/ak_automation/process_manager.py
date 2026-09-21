# -*- coding: utf-8 -*-
"""Exact-path AK lifecycle management with fresh PID/window verification."""

from __future__ import annotations

import logging
import os
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Protocol

from .errors import AkAutomationError

try:
    import psutil
except Exception:  # pragma: no cover - exercised by dependency preflight
    psutil = None


AK_PROCESS_NAMES = ("AK.exe", "AKPlatform.exe")


class LoggerLike(Protocol):
    def info(self, message: str) -> Any: ...
    def error(self, message: str) -> Any: ...


@dataclass(frozen=True)
class ProcessSnapshot:
    pid: int
    name: str
    executable: str
    created_at: float
    status: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class StartResult:
    launched: bool
    awakened_existing_process: bool
    processes: tuple[ProcessSnapshot, ...]
    window: Any
    elapsed: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "launched": self.launched,
            "awakened_existing_process": self.awakened_existing_process,
            "processes": [process.to_dict() for process in self.processes],
            "window": self.window.to_dict(),
            "elapsed": self.elapsed,
        }


@dataclass(frozen=True)
class CloseResult:
    already_closed: bool
    graceful_close_requested: bool
    terminated_pids: tuple[int, ...]
    killed_pids: tuple[int, ...]
    elapsed: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _log(logger: LoggerLike | logging.Logger | None, level: str, message: str) -> None:
    target = logger or logging.getLogger(__name__)
    writer = getattr(target, level, None) or getattr(target, "info", None)
    if callable(writer):
        writer(message)


def _timing(
    logger: LoggerLike | logging.Logger | None,
    operation: str,
    started_at: float,
    **details: Any,
) -> float:
    elapsed = max(0.0, time.monotonic() - started_at)
    timing = getattr(logger, "timing", None)
    if callable(timing):
        return timing(operation, started_at, **details)
    return elapsed


def _require_psutil() -> None:
    if psutil is None:
        raise AkAutomationError(
            "process", "PROCESS_API_UNAVAILABLE", "缺少 psutil，无法管理 AK 进程。"
        )


def _normal(path: str | Path) -> str:
    return os.path.normcase(os.path.abspath(os.fspath(path)))


def _belongs_to_install(executable: str, ak_path: str | Path, process_name: str) -> bool:
    expected_exe = _normal(ak_path)
    candidate = _normal(executable)
    if process_name.casefold() == Path(ak_path).name.casefold():
        return candidate == expected_exe
    try:
        return os.path.commonpath((_normal(Path(ak_path).parent), candidate)) == _normal(
            Path(ak_path).parent
        )
    except ValueError:
        return False


def find_ak_processes(
    ak_path: str | Path,
    *,
    process_names: Iterable[str] = AK_PROCESS_NAMES,
) -> list[ProcessSnapshot]:
    """Return only processes whose current executable is verified under AK's install."""
    _require_psutil()
    wanted = {name.casefold() for name in process_names}
    # Two passes: resolving `exe` for every process on the machine is the slow
    # part (measured ~0.6s per call), so the cheap name filter runs first and
    # only the few name-matching PIDs are resolved in full. The result list and
    # the permission-denied contract are unchanged.
    candidates: list[tuple[int, str]] = []
    for process in psutil.process_iter(["pid", "name"]):
        try:
            name = process.info.get("name") or ""
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        if name.casefold() in wanted:
            candidates.append((int(process.info["pid"]), name))

    found: list[ProcessSnapshot] = []
    inaccessible: list[int] = []
    for pid, name in candidates:
        try:
            handle = psutil.Process(pid)
            executable = handle.exe() or ""
            if not executable:
                inaccessible.append(pid)
                continue
            if not _belongs_to_install(executable, ak_path, name):
                continue
            created_at = 0.0
            status = "unknown"
            try:
                created_at = float(handle.create_time() or 0.0)
                status = str(handle.status() or "unknown")
            except psutil.Error:
                pass
            found.append(
                ProcessSnapshot(
                    pid=pid,
                    name=name,
                    executable=executable,
                    created_at=created_at,
                    status=status,
                )
            )
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied:
            inaccessible.append(pid)
        except psutil.Error:
            continue
    if inaccessible and not found:
        raise AkAutomationError(
            "process",
            "PROCESS_PERMISSION_DENIED",
            "发现 AK 同名进程，但无法校验其路径；脚本与 AK 权限级别可能不一致。",
            pids=sorted(set(inaccessible)),
            expected_path=str(ak_path),
        )
    return sorted(found, key=lambda item: (item.created_at, item.pid))


def _start_process(ak_path: str | Path) -> None:
    path = Path(ak_path)
    if not path.is_file():
        raise AkAutomationError(
            "process",
            "AK_EXECUTABLE_NOT_FOUND",
            "没有找到 AK.exe。",
            path=str(path),
        )
    try:
        subprocess.Popen(
            [str(path)],
            cwd=str(path.parent),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except OSError as exc:
        code = (
            "AK_START_REQUIRES_ELEVATION"
            if getattr(exc, "winerror", None) in {5, 740}
            else "AK_START_FAILED"
        )
        raise AkAutomationError(
            "process",
            code,
            "AK 启动命令被 Windows 拒绝。" if code.endswith("ELEVATION") else "AK 启动失败。",
            path=str(path),
            error=f"{type(exc).__name__}: {exc}",
        ) from exc


def start_or_connect_ak(
    ak_path: str | Path = r"D:\AKPlatform\AK.exe",
    *,
    window_title: str = "AK加速器",
    process_names: tuple[str, ...] = AK_PROCESS_NAMES,
    timeout: float = 20.0,
    window_ready_timeout: float = 5.0,
    logger: LoggerLike | logging.Logger | None = None,
    diagnostic_dir: str | Path | None = None,
) -> StartResult:
    """Connect to a usable AK window or launch/wake AK, always returning fresh state."""
    from .window_manager import (
        ensure_window_usable,
        get_fresh_main_window,
        wait_for_fresh_main_window,
    )

    started_at = time.monotonic()
    phase_started = time.monotonic()
    existing = find_ak_processes(ak_path, process_names=process_names)
    _timing(
        logger,
        "process.start.initial_process_scan",
        phase_started,
        process_count=len(existing),
    )
    phase_started = time.monotonic()
    existing_window = (
        get_fresh_main_window(
            ak_path, title=window_title, process_names=process_names
        )
        if existing
        else None
    )
    _timing(
        logger,
        "process.start.initial_window_scan",
        phase_started,
        found=existing_window is not None,
    )
    launched = not existing
    awakened = bool(existing and existing_window is None)

    if existing_window is None:
        reason = "启动 AK" if launched else "AK 进程存在但无主窗口，重新执行 AK.exe 唤出界面"
        _log(logger, "info", reason)
        _start_process(ak_path)
        phase_started = time.monotonic()
        fresh_window = wait_for_fresh_main_window(
            ak_path,
            title=window_title,
            process_names=process_names,
            timeout=timeout,
            logger=logger,
        )
        _timing(logger, "process.start.wait_for_main_window", phase_started)
    else:
        fresh_window = existing_window
        _log(
            logger,
            "info",
            f"连接现有 AK：PID={fresh_window.pid} HWND=0x{fresh_window.hwnd:08X}",
        )

    phase_started = time.monotonic()
    usable_window = ensure_window_usable(
        fresh_window,
        timeout=window_ready_timeout,
        logger=logger,
        diagnostic_dir=diagnostic_dir,
    )
    _timing(logger, "process.start.ensure_window_usable", phase_started)
    phase_started = time.monotonic()
    fresh_processes = tuple(find_ak_processes(ak_path, process_names=process_names))
    _timing(
        logger,
        "process.start.final_process_scan",
        phase_started,
        process_count=len(fresh_processes),
    )
    if usable_window.pid not in {process.pid for process in fresh_processes}:
        raise AkAutomationError(
            "process",
            "PROCESS_CHANGED_AFTER_WINDOW_READY",
            "窗口准备完成后，其 PID 已不在新获取的 AK 进程集合中。",
            window=usable_window.to_dict(),
            pids=[process.pid for process in fresh_processes],
        )
    result = StartResult(
        launched=launched,
        awakened_existing_process=awakened,
        processes=fresh_processes,
        window=usable_window,
        elapsed=time.monotonic() - started_at,
    )
    _timing(
        logger,
        "process.start.total",
        started_at,
        launched=launched,
        awakened_existing_process=awakened,
    )
    return result


def _wait_until_closed(
    ak_path: str | Path,
    process_names: tuple[str, ...],
    timeout: float,
    poll_interval: float = 0.15,
) -> bool:
    from .window_manager import enumerate_process_windows

    deadline = time.monotonic() + max(0.0, timeout)
    while True:
        processes = find_ak_processes(ak_path, process_names=process_names)
        if not processes:
            return True
        windows = enumerate_process_windows(process.pid for process in processes)
        if time.monotonic() >= deadline:
            return not processes and not windows
        time.sleep(max(0.01, poll_interval))


def _signal_processes(
    processes: Iterable[ProcessSnapshot], method: str
) -> tuple[int, ...]:
    acted: list[int] = []
    for snapshot in processes:
        try:
            process = psutil.Process(snapshot.pid)
            if abs(float(process.create_time()) - snapshot.created_at) > 0.01:
                continue
            getattr(process, method)()
            acted.append(snapshot.pid)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied as exc:
            raise AkAutomationError(
                "process",
                "PROCESS_PERMISSION_DENIED",
                f"没有权限对 AK PID={snapshot.pid} 执行 {method}。",
                pid=snapshot.pid,
                method=method,
            ) from exc
    return tuple(acted)


def close_ak_and_verify(
    ak_path: str | Path = r"D:\AKPlatform\AK.exe",
    *,
    process_names: tuple[str, ...] = AK_PROCESS_NAMES,
    graceful_timeout: float = 0.8,
    terminate_timeout: float = 0.0,
    kill_timeout: float = 1.5,
    poll_interval: float = 0.05,
    logger: LoggerLike | logging.Logger | None = None,
) -> CloseResult:
    """Close only verified AK processes and verify both processes and windows disappear."""
    from .window_manager import enumerate_process_windows, request_close_for_processes

    started_at = time.monotonic()
    phase_started = time.monotonic()
    before = find_ak_processes(ak_path, process_names=process_names)
    _timing(
        logger,
        "process.close.initial_process_scan",
        phase_started,
        process_count=len(before),
    )
    if not before:
        result = CloseResult(True, False, (), (), time.monotonic() - started_at)
        _timing(logger, "process.close.total", started_at, already_closed=True)
        return result

    before_pids = {process.pid for process in before}
    phase_started = time.monotonic()
    close_count = request_close_for_processes(before_pids)
    _timing(
        logger,
        "process.close.request_graceful",
        phase_started,
        window_count=close_count,
    )
    graceful_requested = close_count > 0
    _log(
        logger,
        "info",
        f"已向 {close_count} 个 AK 窗口请求关闭；开始验证进程和窗口退出。",
    )
    phase_started = time.monotonic()
    if _wait_until_closed(
        ak_path, process_names, graceful_timeout, poll_interval=poll_interval
    ):
        _timing(logger, "process.close.wait_graceful", phase_started, exited=True)
        result = CloseResult(
            False, graceful_requested, (), (), time.monotonic() - started_at
        )
        _timing(logger, "process.close.total", started_at, close_method="graceful")
        return result
    _timing(logger, "process.close.wait_graceful", phase_started, exited=False)

    phase_started = time.monotonic()
    current = find_ak_processes(ak_path, process_names=process_names)
    killed = _signal_processes(current, "kill")
    _timing(logger, "process.close.kill", phase_started, pids=list(killed))
    _log(logger, "info", f"强制终止仍在运行的精确 PID：{list(killed)}")
    phase_started = time.monotonic()
    if not _wait_until_closed(
        ak_path, process_names, kill_timeout, poll_interval=poll_interval
    ):
        _timing(logger, "process.close.wait_kill", phase_started, exited=False)
        remaining = find_ak_processes(ak_path, process_names=process_names)
        windows = enumerate_process_windows(process.pid for process in remaining)
        raise AkAutomationError(
            "process",
            "AK_EXIT_VERIFICATION_FAILED",
            "关闭后 AK 进程或窗口仍然存在。",
            remaining_pids=[process.pid for process in remaining],
            remaining_windows=[window.to_dict() for window in windows],
        )
    _timing(logger, "process.close.wait_kill", phase_started, exited=True)
    result = CloseResult(
        False, graceful_requested, (), killed, time.monotonic() - started_at
    )
    _timing(logger, "process.close.total", started_at, close_method="kill")
    return result
