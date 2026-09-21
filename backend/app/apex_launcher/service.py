# -*- coding: utf-8 -*-
"""Orchestration service for the real one-click APEX workflow."""
import threading
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from . import config as config_module
from . import processes as proc
from . import ak as ak_module
from . import apex as apex_module
from . import steam as steam_module
from .ak_automation import (
    AkAutomationError,
    LauncherAkStartResult,
    dispatch_ak_for_launcher,
    focus_ak_for_launcher,
    rollback_ak_after_failed_launch,
    stop_ak_for_launcher,
    verify_ak_acceleration_for_launcher,
)

State = str
STOPPED: State = "stopped"
STARTING: State = "starting"
RUNNING: State = "running"
STOPPING: State = "stopping"
ERROR: State = "error"

STEAM_PROCESS_NAMES = (
    "steam.exe",
    "steamservice.exe",
    "steamwebhelper.exe",
    "steamerrorreporter.exe",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Logger:
    """Collector that mirrors the old AppLogger surface and persists to launcher.log."""
    lines: list[dict[str, str]] = field(default_factory=list)
    path: Optional[str] = None
    max_bytes: int = 512 * 1024
    _seq: int = 0

    def _trim_if_needed(self) -> None:
        if not self.path:
            return
        try:
            if Path(self.path).stat().st_size < self.max_bytes:
                return
            with open(self.path, "r+", encoding="utf-8") as handle:
                handle.seek(max(0, handle.seek(0, 2) - self.max_bytes // 2))
                head = handle.read(1)
                if head not in ("\n", ""):
                    handle.readline()
                tail = handle.read()
                handle.seek(0)
                handle.truncate()
                handle.write("... 日志已自动截断 ...\n")
                handle.write(tail)
        except Exception:
            pass

    def _write(self, level: str, message: str) -> None:
        self._seq += 1
        self.lines.append({"level": level, "at": _utc_now(), "text": message, "seq": self._seq})
        if not self.path:
            return
        self._trim_if_needed()
        try:
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(f"[{level}] {message}\n")
        except Exception:
            pass

    def step(self, message: str) -> None:
        self._write("STEP", message)

    def info(self, message: str) -> None:
        self._write("INFO", message)

    def ok(self, message: str) -> None:
        self._write("OK", message)

    def warn(self, message: str) -> None:
        self._write("WARN", message)

    def error(self, message: str) -> None:
        self._write("ERROR", message)


@dataclass
class ApexConfig:
    steam_path: str = r"D:\steam\steam.exe"
    ak_path: str = r"D:\AKPlatform\AK.exe"
    ak_control: str = "vision"
    ak_vision_threshold: float = 0.92
    ak_vision_scales: list[float] = field(default_factory=lambda: [0.85, 0.92, 1.0, 1.08, 1.15])
    ak_visual_regions: dict[str, list[float]] = field(default_factory=lambda: {
        "accelerate": [0.18, 0.40, 0.47, 0.28],
        "pause": [0.18, 0.40, 0.47, 0.28],
        "member_pause": [0.76, 0.66, 0.21, 0.20],
        "paused_text": [0.76, 0.66, 0.21, 0.20],
    })
    ak_visual_full_fallback: bool = True
    ak_state_timeout: int = 30
    ak_accelerate_timeout: int = 18
    ak_stop_timeout: int = 10
    ak_membership_pause_timeout: int = 10
    ak_static_verify_timeout: int = 3
    ak_state_poll_interval: float = 0.05
    ak_stable_samples: int = 2
    ak_action_cooldown: float = 0.05
    wait_steam_after_launch: int = 6
    wait_game_process: int = 120
    game_process_poll_interval: float = 0.25
    ak_start_timeout: int = 12
    ak_window_timeout: int = 3
    game_close_grace: float = 2.0
    game_close_poll_interval: float = 0.1
    steam_close_wait: float = 2.0
    steam_close_poll_interval: float = 0.1

    @classmethod
    def from_dict(cls, data: dict) -> "ApexConfig":
        cfg = cls()
        for key, value in data.items():
            if hasattr(cfg, key):
                setattr(cfg, key, value)
        return cfg

    def to_dict(self) -> dict:
        return {
            "steam_path": self.steam_path,
            "ak_path": self.ak_path,
            "ak_control": self.ak_control,
            "ak_vision_threshold": self.ak_vision_threshold,
            "ak_vision_scales": self.ak_vision_scales,
            "ak_visual_regions": self.ak_visual_regions,
            "ak_visual_full_fallback": self.ak_visual_full_fallback,
            "ak_state_timeout": self.ak_state_timeout,
            "ak_accelerate_timeout": self.ak_accelerate_timeout,
            "ak_stop_timeout": self.ak_stop_timeout,
            "ak_membership_pause_timeout": self.ak_membership_pause_timeout,
            "ak_static_verify_timeout": self.ak_static_verify_timeout,
            "ak_state_poll_interval": self.ak_state_poll_interval,
            "ak_stable_samples": self.ak_stable_samples,
            "ak_action_cooldown": self.ak_action_cooldown,
            "wait_steam_after_launch": self.wait_steam_after_launch,
            "wait_game_process": self.wait_game_process,
            "game_process_poll_interval": self.game_process_poll_interval,
            "ak_start_timeout": self.ak_start_timeout,
            "ak_window_timeout": self.ak_window_timeout,
            "game_close_grace": self.game_close_grace,
            "game_close_poll_interval": self.game_close_poll_interval,
            "steam_close_wait": self.steam_close_wait,
            "steam_close_poll_interval": self.steam_close_poll_interval,
        }


@dataclass
class ApexStatus:
    state: State = STOPPED
    pid: Optional[int] = None
    started_at: Optional[str] = None
    last_error: Optional[str] = None
    steam_running: bool = False
    ak_running: bool = False
    game_running: bool = False
    steam_path_exists: bool = False
    ak_path_exists: bool = False
    templates_ready: bool = False
    stage: Optional[str] = None
    error_code: Optional[str] = None
    diagnostic_path: Optional[str] = None
    rollback: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "pid": self.pid,
            "started_at": self.started_at,
            "last_error": self.last_error,
            "steam_running": self.steam_running,
            "ak_running": self.ak_running,
            "game_running": self.game_running,
            "steam_path_exists": self.steam_path_exists,
            "ak_path_exists": self.ak_path_exists,
            "templates_ready": self.templates_ready,
            "stage": self.stage,
            "error_code": self.error_code,
            "diagnostic_path": self.diagnostic_path,
            "rollback": self.rollback,
        }


@dataclass(frozen=True)
class RollbackStep:
    resource: str
    ownership: str
    action: str
    status: str
    details: dict[str, Any] = field(default_factory=dict)
    error: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "resource": self.resource,
            "ownership": self.ownership,
            "action": self.action,
            "status": self.status,
            "details": self.details,
            "error": self.error,
        }


@dataclass(frozen=True)
class StartupRollbackResult:
    trigger: str
    state: str
    steps: tuple[RollbackStep, ...]

    @property
    def success(self) -> bool:
        return self.state in {"succeeded", "not_required"}

    def to_dict(self) -> dict[str, Any]:
        return {
            "trigger": self.trigger,
            "state": self.state,
            "steps": [step.to_dict() for step in self.steps],
        }


@dataclass
class _LaunchOwnership:
    ak_result: Optional[LauncherAkStartResult] = None
    steam_baseline: tuple[proc.ProcessIdentity, ...] = ()
    steam_install_dir: Optional[str] = None
    steam_attempted: bool = False
    game_baseline: tuple[proc.ProcessIdentity, ...] = ()
    game_install_dir: Optional[str] = None
    game_attempted: bool = False


class _BackgroundClose:
    """Run one process force-close on a helper thread and collect its verdict."""

    def __init__(self, label: str, close: Callable[[], bool]) -> None:
        self._label = label
        self._close = close
        self._result = False
        self._error: Optional[BaseException] = None
        self._thread = threading.Thread(
            target=self._run, name=f"apex-close-{label}", daemon=True
        )

    def _run(self) -> None:
        try:
            self._result = bool(self._close())
        except BaseException as exc:  # noqa: BLE001 - reported through wait()
            self._error = exc

    def start(self) -> None:
        self._thread.start()

    def wait(self) -> tuple[bool, Optional[BaseException]]:
        """Join the helper thread and return (verified_gone, error)."""
        self._thread.join()
        return self._result, self._error


class ApexOneClickService:
    """Executes AK -> Steam -> game orchestration with replaceable internals for tests."""

    def __init__(
        self,
        config_provider: Optional[Callable[[], dict]] = None,
        logger: Optional[Logger] = None,
        run_async: bool = True,
    ) -> None:
        self._config_provider = config_provider or config_module.load_config
        self._logger = logger or Logger(path=str(config_module.data_root() / "apex_launcher" / "launcher.log"))
        self._run_async = run_async
        self._state: State = STOPPED
        self._pid: Optional[int] = None
        self._started_at: Optional[str] = None
        self._last_error: Optional[str] = None
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._cancel = threading.Event()
        self._condition = threading.Condition(self._lock)
        self._revision = 0
        self._starting_revision: Optional[int] = None
        self._stage: Optional[str] = None
        self._error_code: Optional[str] = None
        self._diagnostic_path: Optional[str] = None
        self._rollback: Optional[dict[str, Any]] = None

    def _process_snapshot(self) -> tuple[bool, bool, bool]:
        return (
            proc.is_process_running("steam.exe"),
            ak_module.ak_running(),
            apex_module.game_active(),
        )

    def status(self) -> ApexStatus:
        cfg = self._config_provider()
        steam_running, ak_running, game_running = self._process_snapshot()
        if self._state == RUNNING and not (steam_running or ak_running or game_running):
            with self._lock:
                if self._state == RUNNING:
                    self._state = STOPPED
                    self._pid = None
                    self._started_at = None
                    self._last_error = "运行环境已退出，状态已复位"
                    self._starting_revision = None
                    self._increment_revision()
        return ApexStatus(
            state=self._state,
            pid=self._pid,
            started_at=self._started_at,
            last_error=self._last_error,
            steam_running=steam_running,
            ak_running=ak_running,
            game_running=game_running,
            steam_path_exists=bool(cfg.get("steam_path") and os.path.exists(cfg.get("steam_path"))),
            ak_path_exists=bool(cfg.get("ak_path") and os.path.exists(cfg.get("ak_path"))),
            templates_ready=all(ak_module.calibrated(cfg, which) for which in ("accelerate", "pause", "member_pause", "paused_text")),
            stage=self._stage,
            error_code=self._error_code,
            diagnostic_path=self._diagnostic_path,
            rollback=self._rollback,
        )

    def logs(self, limit: int = 200) -> list[dict[str, str]]:
        return list(self._logger.lines)[-max(1, min(5000, limit)):]

    def revision(self) -> int:
        with self._lock:
            return self._revision

    def starting_revision(self) -> Optional[int]:
        with self._lock:
            return self._starting_revision

    def _increment_revision(self) -> int:
        with self._condition:
            self._revision += 1
            self._condition.notify_all()
            return self._revision

    def wait_for_state(self, target: State, revision: Optional[int] = None, timeout: float = 60.0) -> dict:
        deadline = time.monotonic() + timeout
        with self._condition:
            while True:
                current = self._state
                if target == current and (revision is None or self._revision > revision):
                    break
                if revision is not None and self._revision > revision and current in (RUNNING, STOPPED, ERROR):
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self._condition.wait(remaining)
        return {**self.status().to_dict(), "revision": self._revision}

    def _set_settled(self, state: State, pid: Optional[int], started_at: Optional[str], last_error: Optional[str]) -> None:
        self._state = state
        self._pid = pid
        self._started_at = started_at
        self._last_error = last_error
        self._starting_revision = None
        if state in (RUNNING, STOPPED):
            self._stage = None
        self._increment_revision()

    def check_environment(self) -> dict:
        log = Logger()
        cfg = self._config_provider()
        report = {
            "steam_path": cfg.get("steam_path", ""),
            "ak_path": cfg.get("ak_path", ""),
            "steam_path_exists": bool(cfg.get("steam_path") and os.path.exists(cfg.get("steam_path"))),
            "ak_path_exists": bool(cfg.get("ak_path") and os.path.exists(cfg.get("ak_path"))),
            "steam_running": proc.is_process_running("steam.exe"),
            "ak_running": ak_module.ak_running(),
            "game_running": apex_module.game_active(),
            "ak_control": cfg.get("ak_control", "vision"),
            "accelerate_calibrated": ak_module.calibrated(cfg, "accelerate"),
            "pause_calibrated": ak_module.calibrated(cfg, "pause"),
            "member_pause_calibrated": ak_module.calibrated(cfg, "member_pause"),
            "paused_text_calibrated": ak_module.calibrated(cfg, "paused_text"),
            "game_exe": apex_module.game_exe(cfg),
            "logs": log.lines,
        }
        return report

    def adopt_running_environment(self) -> bool:
        """Recover a fresh elevated module process before stop or restart.

        The console starts each module action in a short-lived elevated helper.
        Its in-memory service state is therefore new, while the managed Windows
        processes may already be running from a previous action.  Only adopt
        that state when the process snapshot provides concrete evidence.
        """
        steam_running, ak_running, game_running = self._process_snapshot()
        if not (steam_running or ak_running or game_running):
            return False
        with self._lock:
            self._state = RUNNING
            self._started_at = self._started_at or _utc_now()
            self._last_error = None
            self._error_code = None
            self._diagnostic_path = None
            self._rollback = None
        return True

    def start(self) -> ApexStatus:
        with self._lock:
            if self._state in (STARTING, RUNNING, STOPPING):
                return self.status()
            self._state = STARTING
            self._pid = None
            self._last_error = None
            self._error_code = None
            self._diagnostic_path = None
            self._rollback = None
            self._stage = "准备启动"
            self._started_at = _utc_now()
            self._starting_revision = self._increment_revision()
            self._cancel.clear()
        if not self._run_async:
            self._run_job()
            return self.status()
        self._thread = threading.Thread(target=self._run_job, daemon=True)
        self._thread.start()
        return self.status()

    def stop(self) -> ApexStatus:
        with self._lock:
            if self._state not in (STARTING, RUNNING):
                return self.status()
            self._state = STOPPING
            self._starting_revision = self._increment_revision()
        self._cancel.set()
        if not self._run_async:
            self._close_job()
            return self.status()
        self._thread = threading.Thread(target=self._close_job, daemon=True)
        self._thread.start()
        return self.status()

    def restart(self) -> ApexStatus:
        with self._lock:
            if self._state in (STARTING, STOPPING):
                return self.status()
            if self._state != RUNNING:
                self._state = STARTING
                self._last_error = None
                self._error_code = None
                self._diagnostic_path = None
                self._rollback = None
                self._started_at = _utc_now()
                self._starting_revision = self._increment_revision()
                self._cancel.clear()
                if not self._run_async:
                    self._run_job()
                    return self.status()
                self._thread = threading.Thread(target=self._run_job, daemon=True)
                self._thread.start()
                return self.status()
            self._state = STOPPING
            self._cancel.set()
            self._starting_revision = self._increment_revision()
        if not self._run_async:
            self._close_job()
            self._cancel.clear()
            self._run_job()
            return self.status()
        self._thread = threading.Thread(target=self._restart_job, daemon=True)
        self._thread.start()
        return self.status()

    def _restart_job(self) -> None:
        self._close_job()
        self._cancel.clear()
        with self._lock:
            self._state = STARTING
            self._last_error = None
            self._error_code = None
            self._diagnostic_path = None
            self._rollback = None
            self._started_at = _utc_now()
            self._starting_revision = self._increment_revision()
        self._run_job()

    @staticmethod
    def _external_snapshot(
        names: tuple[str, ...] | list[str], install_dir: Optional[str]
    ) -> tuple[proc.ProcessIdentity, ...]:
        return proc.snapshot_process_identities(names, install_dir=install_dir)

    def _rollback_external_processes(
        self,
        *,
        resource: str,
        names: tuple[str, ...] | list[str],
        install_dir: Optional[str],
        baseline: tuple[proc.ProcessIdentity, ...],
    ) -> RollbackStep:
        try:
            current = self._external_snapshot(names, install_dir)
            owned = proc.new_process_identities(baseline, current)
        except Exception as exc:
            return RollbackStep(
                resource=resource,
                ownership="unknown",
                action="none",
                status="failed",
                error={
                    "code": "PROCESS_IDENTITY_SNAPSHOT_FAILED",
                    "message": f"{type(exc).__name__}: {exc}",
                },
            )
        if not owned:
            ownership = "preexisting" if baseline else "none"
            return RollbackStep(
                resource=resource,
                ownership=ownership,
                action="none",
                status="skipped",
                details={
                    "baseline": [item.to_dict() for item in baseline],
                    "current": [item.to_dict() for item in current],
                },
            )
        ownership = "mixed" if baseline else "started_by_run"
        try:
            close_result = proc.close_process_identities(owned)
        except Exception as exc:
            return RollbackStep(
                resource=resource,
                ownership=ownership,
                action="close_owned_processes",
                status="failed",
                details={
                    "baseline": [item.to_dict() for item in baseline],
                    "owned": [item.to_dict() for item in owned],
                },
                error={
                    "code": "OWNED_PROCESS_CLOSE_ERROR",
                    "message": f"{type(exc).__name__}: {exc}",
                },
            )
        details = {
            "baseline": [item.to_dict() for item in baseline],
            "owned": [item.to_dict() for item in owned],
            "close_result": close_result.to_dict(),
        }
        if not close_result.success:
            return RollbackStep(
                resource=resource,
                ownership=ownership,
                action="close_owned_processes",
                status="failed",
                details=details,
                error={
                    "code": "OWNED_PROCESS_EXIT_NOT_VERIFIED",
                    "message": "本轮新增进程未能按精确身份全部退出。",
                },
            )
        return RollbackStep(
            resource=resource,
            ownership=ownership,
            action="close_owned_processes",
            status="completed",
            details=details,
        )

    def _rollback_failed_start(
        self,
        cfg: dict,
        ownership: _LaunchOwnership,
        trigger: str,
        log: Logger,
    ) -> StartupRollbackResult:
        log.step(f"启动失败回滚：{trigger}")
        steps: list[RollbackStep] = []
        if ownership.game_attempted:
            game_step = self._rollback_external_processes(
                resource="apex",
                names=apex_module.GAME_PROCESSES,
                install_dir=ownership.game_install_dir,
                baseline=ownership.game_baseline,
            )
            steps.append(game_step)
            if game_step.status == "failed":
                log.error("APEX 回滚失败；未继续撤销 Steam 或 AK。")
                return StartupRollbackResult(trigger, "failed", tuple(steps))

        if ownership.steam_attempted:
            steam_step = self._rollback_external_processes(
                resource="steam",
                names=STEAM_PROCESS_NAMES,
                install_dir=ownership.steam_install_dir,
                baseline=ownership.steam_baseline,
            )
            steps.append(steam_step)
            if steam_step.status == "failed":
                log.error("Steam 回滚失败；未继续撤销 AK。")
                return StartupRollbackResult(trigger, "failed", tuple(steps))

        if ownership.ak_result is not None:
            if ownership.ak_result.start_result.launched:
                ak_ownership = "started_by_run"
                ak_action = "pause_and_close"
            elif ownership.ak_result.changed_acceleration:
                ak_ownership = "state_changed_by_run"
                ak_action = "restore_paused_keep_process"
            else:
                ak_ownership = "preexisting_unchanged"
                ak_action = "none"
            try:
                ak_result = rollback_ak_after_failed_launch(cfg, ownership.ak_result)
                ak_step = RollbackStep(
                    resource="ak",
                    ownership=ak_result.ownership,
                    action=ak_action,
                    status=(
                        "skipped"
                        if ak_result.ownership == "preexisting_unchanged"
                        else "completed"
                    ),
                    details=ak_result.to_dict(),
                )
            except AkAutomationError as exc:
                ak_step = RollbackStep(
                    resource="ak",
                    ownership=ak_ownership,
                    action=ak_action,
                    status="failed",
                    error=exc.to_dict(),
                )
            except Exception as exc:
                ak_step = RollbackStep(
                    resource="ak",
                    ownership=ak_ownership,
                    action=ak_action,
                    status="failed",
                    error={
                        "code": "UNEXPECTED_AK_ROLLBACK_ERROR",
                        "message": f"{type(exc).__name__}: {exc}",
                    },
                )
            steps.append(ak_step)
            if ak_step.status == "failed":
                log.error("AK 回滚失败；原始启动失败原因仍被保留。")
                return StartupRollbackResult(trigger, "failed", tuple(steps))

        state = "succeeded" if steps else "not_required"
        log.ok("本轮拥有的启动资源已完成回滚" if steps else "没有需要回滚的本轮资源")
        return StartupRollbackResult(trigger, state, tuple(steps))

    def _fail_with_rollback(
        self,
        log: Logger,
        cfg: dict,
        ownership: _LaunchOwnership,
        *,
        trigger: str,
        message: str,
        code: str,
        diagnostic_path: Optional[str] = None,
    ) -> None:
        rollback = self._rollback_failed_start(cfg, ownership, trigger, log)
        self._rollback = rollback.to_dict()
        suffix = "" if rollback.success else "；本轮资源回滚未完成，详见 rollback"
        self._fail(log, message + suffix, code, diagnostic_path)

    def _cancel_with_rollback(
        self,
        log: Logger,
        cfg: dict,
        ownership: _LaunchOwnership,
        trigger: str,
    ) -> None:
        rollback = self._rollback_failed_start(cfg, ownership, trigger, log)
        self._rollback = rollback.to_dict()
        if rollback.success:
            self._stopped(log, "启动已取消；本轮资源已回滚")
            return
        self._stage = "rollback"
        self._fail(
            log,
            "启动已取消，但本轮资源回滚未完成，详见 rollback",
            "START_ROLLBACK_FAILED",
        )

    def _run_job(self) -> None:
        log = self._logger
        cfg: Optional[dict] = None
        ownership = _LaunchOwnership()
        try:
            log.step("========== APEX 一键启动 ==========")
            cfg = self._config_provider()
            self._stage = "确认 APEX 加速状态"
            try:
                ak_dispatch = dispatch_ak_for_launcher(cfg)
            except AkAutomationError as exc:
                self._fail_automation(log, "AK 启动或加速失败", exc)
                return
            ownership.ak_result = ak_dispatch.provisional_start_result()
            log.ok(
                "已派发 AK 加速点击；先继续启动 Steam 与 APEX，再确认加速结果"
                + (
                    f"；详细日志：{ak_dispatch.log_path}"
                    if ak_dispatch.log_path
                    else ""
                )
            )
            if self._cancel.is_set():
                self._cancel_with_rollback(log, cfg, ownership, "cancelled_after_ak")
                return
            self._stage = "启动 Steam"
            steam_path = str(cfg.get("steam_path") or "")
            ownership.steam_install_dir = os.path.dirname(steam_path) or None
            try:
                ownership.steam_baseline = self._external_snapshot(
                    STEAM_PROCESS_NAMES, ownership.steam_install_dir
                )
            except Exception as exc:
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="steam_ownership_snapshot_failed",
                    message=f"Steam 所有权基线建立失败：{type(exc).__name__}: {exc}",
                    code="PROCESS_IDENTITY_SNAPSHOT_FAILED",
                )
                return
            ownership.steam_attempted = True
            if not steam_module.ensure_steam_running(cfg, log):
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="steam_start_failed",
                    message="Steam 启动失败",
                    code="STEAM_START_FAILED",
                )
                return
            if self._cancel.is_set():
                self._cancel_with_rollback(log, cfg, ownership, "cancelled_after_steam")
                return
            self._stage = "启动 APEX"
            game_executable = apex_module.game_exe(cfg)
            ownership.game_install_dir = os.path.dirname(game_executable) or None
            try:
                ownership.game_baseline = self._external_snapshot(
                    apex_module.GAME_PROCESSES, ownership.game_install_dir
                )
            except Exception as exc:
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="apex_ownership_snapshot_failed",
                    message=f"APEX 所有权基线建立失败：{type(exc).__name__}: {exc}",
                    code="PROCESS_IDENTITY_SNAPSHOT_FAILED",
                )
                return
            ownership.game_attempted = True
            if not apex_module.start_game(cfg, log):
                if self._cancel.is_set():
                    self._cancel_with_rollback(
                        log, cfg, ownership, "cancelled_during_apex_start"
                    )
                else:
                    self._fail_with_rollback(
                        log,
                        cfg,
                        ownership,
                        trigger="apex_start_failed_or_timeout",
                        message="游戏启动失败",
                        code="APEX_START_FAILED_OR_TIMEOUT",
                    )
                return
            self._stage = "把 AK 切回前台"
            try:
                ak_dispatch = focus_ak_for_launcher(cfg, ak_dispatch)
            except AkAutomationError as exc:
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="ak_refocus_failed",
                    message="无法把 AK 加速器切回前台确认加速结果",
                    code=exc.code,
                    diagnostic_path=exc.details.get("evidence_path"),
                )
                return
            self._stage = "确认 AK 加速结果"
            try:
                ak_start = verify_ak_acceleration_for_launcher(cfg, ak_dispatch)
            except AkAutomationError as exc:
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="ak_acceleration_not_verified",
                    message="AK 加速结果未通过验证",
                    code=exc.code,
                    diagnostic_path=exc.details.get("evidence_path"),
                )
                return
            ownership.ak_result = ak_start
            log.ok(
                "已确认 AK 正在加速 APEX"
                + (f"；详细日志：{ak_start.log_path}" if ak_start.log_path else "")
            )
            if self._cancel.is_set():
                self._cancel_with_rollback(
                    log, cfg, ownership, "cancelled_during_apex_start"
                )
                return
            if not apex_module.wait_game_active(cfg, log, cancel_flag=self._cancel):
                if self._cancel.is_set():
                    self._cancel_with_rollback(
                        log, cfg, ownership, "cancelled_during_apex_start"
                    )
                else:
                    self._fail_with_rollback(
                        log,
                        cfg,
                        ownership,
                        trigger="apex_start_failed_or_timeout",
                        message="游戏启动失败或等待超时",
                        code="APEX_START_FAILED_OR_TIMEOUT",
                    )
                return
            self._set_settled(RUNNING, None, self._started_at, None)
            log.ok("APEX 一键启动完成")
        except Exception as exc:
            if cfg is not None and ownership.ak_result is not None:
                self._fail_with_rollback(
                    log,
                    cfg,
                    ownership,
                    trigger="unexpected_start_error",
                    message=f"一键启动异常: {exc!r}",
                    code="START_UNEXPECTED_ERROR",
                )
            else:
                self._fail(
                    log,
                    f"一键启动异常: {exc!r}",
                    "START_UNEXPECTED_ERROR",
                )

    def _close_job(self) -> None:
        log = self._logger
        game_kill: Optional[_BackgroundClose] = None
        try:
            log.step("========== APEX 一键关闭 ==========")
            cfg = self._config_provider()
            # APEX has no visual step, so its force-kill runs on a helper
            # thread while the serial AK visual steps (stop -> pause -> read ->
            # close) proceed. Steam waits until both are verified gone.
            self._stage = "关闭 APEX"
            game_kill = _BackgroundClose(
                "apex", lambda: apex_module.force_close_game(cfg, log)
            )
            game_kill.start()
            self._stage = "确认 AK 会员计时暂停"
            try:
                ak_result = stop_ak_for_launcher(cfg)
            except AkAutomationError as exc:
                closed, error = game_kill.wait()
                if error is not None or not closed:
                    log.warn("AK 关闭失败的同时，APEX 强制结束也未确认成功，请手动检查。")
                self._fail_automation(log, "AK 暂停或关闭失败", exc)
                return
            membership = ak_result.membership_info
            log.ok(
                f"已确认会员时长暂停，剩余 {membership.hours} 时 {membership.minutes} 分，AK 已关闭"
                + (f"；详细日志：{ak_result.log_path}" if ak_result.log_path else "")
            )
            self._stage = "确认 APEX 已退出"
            game_closed, game_error = game_kill.wait()
            if game_error is not None:
                self._fail(
                    log, f"APEX 强制结束异常: {game_error!r}", "APEX_CLOSE_FAILED"
                )
                return
            if not game_closed:
                self._fail(log, "APEX 强制结束失败", "APEX_CLOSE_FAILED")
                return
            self._stage = "关闭 Steam"
            if not steam_module.force_close_steam(cfg, log):
                self._fail(log, "Steam 关闭失败", "STEAM_CLOSE_FAILED")
                return
            self._stopped(log, "APEX 一键关闭完成")
        except Exception as exc:
            if game_kill is not None:
                game_kill.wait()
            self._fail(log, f"一键关闭异常: {exc!r}", "STOP_UNEXPECTED_ERROR")

    def _fail_ak(self, log: Logger, message: str) -> None:
        detail = ak_module.last_failure()
        self._fail(log, message, detail["code"], detail["diagnostic_path"])

    def _fail_automation(
        self, log: Logger, message: str, exc: AkAutomationError
    ) -> None:
        self._stage = exc.stage
        log_path = exc.details.get("log_path")
        log_suffix = f"；详细日志：{log_path}" if log_path else ""
        self._fail(
            log,
            f"{message}（{exc.stage}/{exc.code}）：{exc.message}{log_suffix}",
            exc.code,
            exc.details.get("evidence_path"),
        )

    def _fail(self, log: Logger, message: str, code: Optional[str] = None, diagnostic_path: Optional[str] = None) -> None:
        self._last_error = message
        self._error_code = code
        self._diagnostic_path = diagnostic_path
        self._set_settled(ERROR, None, None, message)
        log.error(message)

    def _stopped(self, log: Logger, message: str) -> None:
        self._set_settled(STOPPED, None, None, None)
        log.ok(message)


_service: Optional[ApexOneClickService] = None


def get_service() -> ApexOneClickService:
    global _service
    if _service is None:
        proc.set_dpi_aware()
        _service = ApexOneClickService()
    return _service
