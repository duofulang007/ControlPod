# -*- coding: utf-8 -*-
"""Verified AK phases used by the production APEX start/stop service."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import time

from .. import ak as legacy_ak
from .. import config as config_module
from .control_actions import ActionResult, LocatedControl, PendingAction
from .errors import AkAutomationError
from .logger import WorkflowLogger
from .process_manager import CloseResult, StartResult
from .verifier import VerificationResult, verify_action_result
from .window_manager import WindowSnapshot
from .workflow import MembershipInfo, WorkflowServices


@dataclass(frozen=True)
class LauncherAkStartResult:
    start_result: StartResult
    initial_state: str
    final_state: str
    action: ActionResult | None
    log_path: str | None

    @property
    def changed_acceleration(self) -> bool:
        return self.action is not None


@dataclass(frozen=True)
class LauncherAkDispatchResult:
    """AK start plus the dispatched (not yet confirmed) acceleration click."""

    start_result: StartResult
    initial_state: str
    window: WindowSnapshot
    pending: PendingAction | None
    log_path: str | None

    @property
    def acceleration_dispatched(self) -> bool:
        return self.pending is not None

    def refreshed(self, window: WindowSnapshot) -> "LauncherAkDispatchResult":
        """Same dispatch, with an updated window snapshot after re-focusing AK."""
        return LauncherAkDispatchResult(
            start_result=self.start_result,
            initial_state=self.initial_state,
            window=window,
            pending=self.pending,
            log_path=self.log_path,
        )

    def provisional_start_result(self) -> LauncherAkStartResult:
        """Rollback-safe view: the click was dispatched but is not yet confirmed."""
        if self.pending is None:
            action = None
            final_state = legacy_ak.ACCELERATING
        else:
            action = ActionResult(
                action_id=self.pending.action_id,
                method=self.pending.method,
                control=self.pending.control,
                verification=VerificationResult(
                    expected_states=tuple(self.pending.control.spec.expected_states),
                    initial_state=self.pending.initial_state,
                    observed_state="pending_confirmation",
                    changed=False,
                    elapsed_seconds=0.0,
                ),
            )
            final_state = "pending_confirmation"
        return LauncherAkStartResult(
            start_result=self.start_result,
            initial_state=self.initial_state,
            final_state=final_state,
            action=action,
            log_path=self.log_path,
        )


@dataclass(frozen=True)
class LauncherAkStopResult:
    start_result: StartResult
    initial_state: str
    stop_action: ActionResult | None
    membership_pause_action: ActionResult | None
    membership_info: MembershipInfo
    close_result: CloseResult
    final_state: str
    log_path: str | None


@dataclass(frozen=True)
class LauncherAkRollbackResult:
    ownership: str
    initial_state: str | None
    final_state: str
    stop_action: ActionResult | None
    membership_pause_action: ActionResult | None
    close_result: CloseResult | None
    log_path: str | None

    def to_dict(self) -> dict:
        return {
            "ownership": self.ownership,
            "initial_state": self.initial_state,
            "final_state": self.final_state,
            "stop_action": (
                self.stop_action.to_dict() if self.stop_action is not None else None
            ),
            "membership_pause_action": (
                self.membership_pause_action.to_dict()
                if self.membership_pause_action is not None
                else None
            ),
            "close_result": (
                self.close_result.to_dict() if self.close_result is not None else None
            ),
            "log_path": self.log_path,
        }


def _ak_path(cfg: dict) -> Path:
    value = cfg.get("ak_path")
    if not value:
        raise AkAutomationError(
            "process", "MISSING_AK_PATH", "没有配置 AK.exe 路径。"
        )
    return Path(value)


def _output_dir(cfg: dict) -> Path:
    configured = cfg.get("ak_diagnostic_dir")
    root = Path(configured) if configured else config_module.launcher_dir() / "diagnostics"
    return root / "launcher-actions"


def _make_logger(
    cfg: dict, logger: WorkflowLogger | None, run_name: str
) -> WorkflowLogger:
    return logger or WorkflowLogger(_output_dir(cfg), run_name=run_name)


def _timed_call(logger: WorkflowLogger, operation: str, callback):
    started = time.monotonic()
    try:
        result = callback()
    except Exception:
        logger.timing(operation, started, success=False)
        raise
    logger.timing(operation, started)
    return result


def _fresh_usable_window(
    services: WorkflowServices,
    ak_path: Path,
    cfg: dict,
    logger: WorkflowLogger,
    step: str,
):
    logger.bind(step=step)
    fresh = services.get_fresh_window(ak_path)
    if fresh is None:
        raise AkAutomationError(
            "window",
            "AK_MAIN_WINDOW_NOT_FOUND",
            "重新获取 PID/HWND 后没有找到 AK 主窗口。",
            step=step,
        )
    usable = services.ensure_window_usable(
        fresh,
        timeout=float(cfg.get("ak_window_timeout", 10)),
        logger=logger,
        diagnostic_dir=logger.output_dir,
    )
    logger.record(
        "INFO",
        "已重新获取并验证 AK 主窗口。",
        step=step,
        process_state="present",
        window_state=usable,
    )
    return usable


def _known_state(
    services: WorkflowServices,
    cfg: dict,
    logger: WorkflowLogger,
    step: str,
) -> str:
    logger.bind(step=step)
    # AK repaints its home page for a moment after a cold start, so a single
    # screenshot can land on a half-drawn frame. Poll within a bounded budget
    # and still fail closed if the page never becomes recognisable.
    settle_timeout = max(0.0, float(cfg.get("ak_state_settle_timeout", 5.0)))
    poll_interval = max(0.01, float(cfg.get("ak_state_poll_interval", 0.05)))
    deadline = time.monotonic() + settle_timeout
    observed = legacy_ak.UNKNOWN
    attempts = 0
    while True:
        attempts += 1
        observed = services.observe_state(cfg, logger)
        if observed != legacy_ak.UNKNOWN or time.monotonic() >= deadline:
            break
        time.sleep(poll_interval)
    logger.record(
        "INFO",
        f"AK 页面状态：{observed}",
        page_state=observed,
        attempts=attempts,
    )
    if observed == legacy_ak.UNKNOWN:
        failure = legacy_ak.last_failure()
        raise AkAutomationError(
            "page",
            failure.get("code") or "AK_STATE_UNRECOGNIZED",
            "无法确认 AK 页面状态；未执行后续操作。",
            evidence_path=failure.get("diagnostic_path"),
            attempts=attempts,
        )
    return observed


def _operate(
    services: WorkflowServices,
    key: str,
    window,
    cfg: dict,
    logger: WorkflowLogger,
    step: str,
    *,
    initial_state: str | None = None,
    timeout: float | None = None,
) -> ActionResult:
    logger.bind(step=step)
    control: LocatedControl = services.find_control(
        key,
        cfg,
        window=window,
        logger=logger,
        diagnostic_dir=logger.output_dir,
    )
    if timeout is None:
        timeout = float(
            cfg.get(
                {
                    "accelerate": "ak_accelerate_timeout",
                    "stop": "ak_stop_timeout",
                    "member_pause": "ak_membership_pause_timeout",
                }.get(key, "ak_state_timeout"),
                cfg.get("ak_state_timeout", 30),
            )
        )
    kwargs = {
        "initial_state": initial_state,
        "timeout": timeout,
        "diagnostic_dir": logger.output_dir,
    }
    if control.strategy == "uia" and control.supports_invoke:
        return services.invoke_control(control, cfg, logger, **kwargs)
    return services.click_control(control, cfg, logger, **kwargs)


def _pause_membership_timer(
    services: WorkflowServices,
    ak_path: Path,
    cfg: dict,
    logger: WorkflowLogger,
    window,
    *,
    initial_state: str,
) -> tuple[ActionResult | None, str, object]:
    """Click 会员暂停 until the paused page state is verified.

    A single dispatched click can be lost while the game window is still
    closing, and a lost click used to abort the whole stop flow at this step.
    Every attempt re-acquires and re-activates the AK window and re-reads the
    page state: a page that already turned green is accepted without another
    click and only a still-idle page is clicked again. Success is still only
    reported after the frozen paused template is confirmed twice in a row.

    Live timing: right after 停止加速 the page drops clicks for a moment and
    can lag before it paints 恢复, so the first click waits for the page to
    settle down and every attempt gets a full confirmation budget before
    another click is allowed. The page state is re-read before any retry, so a
    click that already landed is never toggled back to 加速中.
    """
    attempts = max(1, int(cfg.get("ak_membership_pause_attempts", 3)))
    settle = max(0.0, float(cfg.get("ak_membership_pause_settle", 1.2)))
    confirm_timeout = max(0.4, float(cfg.get("ak_membership_pause_confirm", 2.5)))
    gap = max(0.0, float(cfg.get("ak_membership_pause_retry_interval", 1.0)))
    budget = max(confirm_timeout, float(cfg.get("ak_membership_pause_timeout", 8.0)))
    if settle:
        logger.record(
            "INFO",
            f"停止加速后等待 {settle:.1f}s 让页面稳定，再点击会员暂停。",
            step="pause_membership_timer",
            settle_seconds=settle,
        )
        time.sleep(settle)
    deadline = time.monotonic() + budget
    current = window
    for attempt in range(1, attempts + 1):
        if attempt > 1:
            if gap:
                time.sleep(min(gap, max(0.0, deadline - time.monotonic())))
            current = _fresh_usable_window(
                services, ak_path, cfg, logger, "pause_membership_timer"
            )
            observed = services.observe_state(cfg, logger)
            if observed == legacy_ak.PAUSED:
                # 绿色“恢复”表示会员时长已暂停：上一次点击其实已经生效，不再点击。
                verification = _confirm_stable_state(
                    legacy_ak.PAUSED, current, cfg, logger, "pause_membership_timer"
                )
                logger.record(
                    "INFO",
                    "重试前页面已变绿：上一次点击已生效，不再点击，继续后续步骤。",
                    step="pause_membership_timer",
                    observed_state=verification.observed_state,
                    attempt=attempt,
                )
                return None, verification.observed_state, current
            if observed == legacy_ak.ACCELERATING:
                raise AkAutomationError(
                    "page",
                    "ACCELERATION_STOP_STATE_INVALID",
                    "重试会员暂停前 AK 又回到了加速状态。",
                    observed_state=observed,
                )
        remaining = max(0.2, deadline - time.monotonic())
        attempt_timeout = min(confirm_timeout, remaining)
        try:
            action = _operate(
                services,
                "member_pause",
                current,
                cfg,
                logger,
                "pause_membership_timer",
                initial_state=initial_state,
                timeout=attempt_timeout,
            )
        except AkAutomationError as exc:
            observed = services.observe_state(cfg, logger)
            if observed == legacy_ak.PAUSED:
                # AK 有时只是把绿色“恢复”画得慢：会员时长其实已经暂停，
                # 这里不再点击，稳定确认后直接继续后续步骤。
                verification = _confirm_stable_state(
                    legacy_ak.PAUSED, current, cfg, logger, "pause_membership_timer"
                )
                logger.record(
                    "INFO",
                    "点击后页面已处于绿色“恢复”状态；会员时长已暂停，继续后续步骤。",
                    step="pause_membership_timer",
                    observed_state=verification.observed_state,
                    attempts=attempt,
                )
                return None, verification.observed_state, current
            if observed == legacy_ak.ACCELERATING:
                raise
            if attempt >= attempts or time.monotonic() >= deadline:
                raise
            logger.record(
                "WARN",
                f"第 {attempt} 次点击会员暂停后未确认到暂停状态（当前 {observed}）；"
                "重新置前窗口后重试。",
                step="pause_membership_timer",
                observed_state=observed,
                attempt=attempt,
            )
            continue
        return action, action.verification.observed_state, current
    raise AkAutomationError(
        "page",
        "MEMBERSHIP_TIMER_NOT_PAUSED",
        "会员时长暂停状态未验证。",
    )


def _dispatch_operate(
    services: WorkflowServices,
    key: str,
    window,
    cfg: dict,
    logger: WorkflowLogger,
    step: str,
    *,
    initial_state: str | None = None,
) -> PendingAction:
    """Locate and perform one control action without waiting for its confirmation."""
    logger.bind(step=step)
    control: LocatedControl = services.find_control(
        key,
        cfg,
        window=window,
        logger=logger,
        diagnostic_dir=logger.output_dir,
    )
    return services.dispatch_control(
        control,
        cfg,
        logger,
        initial_state=initial_state,
        diagnostic_dir=logger.output_dir,
    )


def _confirm_stable_state(
    expected: str,
    window,
    cfg: dict,
    logger: WorkflowLogger,
    step: str,
) -> VerificationResult:
    logger.bind(step=step)
    return verify_action_result(
        expected,
        cfg,
        logger,
        initial_state=None,
        window=window,
        timeout=float(
            cfg.get("ak_static_verify_timeout", cfg.get("ak_state_timeout", 30))
        ),
        diagnostic_dir=logger.output_dir,
    )


def _record_failure(
    exc: AkAutomationError,
    services: WorkflowServices,
    ak_path: Path,
    logger: WorkflowLogger,
    phase: str,
) -> None:
    evidence_path = exc.details.get("evidence_path")
    if not evidence_path:
        try:
            window = services.get_fresh_window(ak_path)
            if window is not None:
                evidence_path = logger.capture(
                    window, f"launcher-{phase}-{exc.stage}-{exc.code}", required=True
                )
        except Exception:
            evidence_path = None
    if evidence_path:
        exc.details["evidence_path"] = evidence_path
    exc.details.setdefault(
        "log_path", str(logger.log_path) if logger.log_path is not None else None
    )
    logger.record(
        "ERROR",
        "AK 正式入口在首个失败处停止；未执行后续业务动作。",
        code=exc.code,
        failure=exc.to_dict(),
    )


def _unexpected_error(phase: str, unexpected: Exception) -> AkAutomationError:
    return AkAutomationError(
        "flow",
        "UNEXPECTED_LAUNCHER_ACTION_ERROR",
        "AK 正式入口发生未分类异常，已停止后续业务动作。",
        phase=phase,
        error=f"{type(unexpected).__name__}: {unexpected}",
    )


def _process_key(process) -> tuple[int, float, str]:
    return (
        int(process.pid),
        float(process.created_at),
        os.path.normcase(os.path.abspath(process.executable)),
    )


def _rollback_ownership(start_result: LauncherAkStartResult) -> str:
    if start_result.start_result.launched:
        return "started_by_run"
    if start_result.changed_acceleration:
        return "state_changed_by_run"
    return "preexisting_unchanged"


def prepare_ak_for_launcher(
    cfg: dict,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkStartResult:
    """Start/wake AK and return only after acceleration is stably verified."""
    current_logger = _make_logger(cfg, logger, "launcher-start")
    current_services = services or WorkflowServices()
    total_started = time.monotonic()
    dispatch = dispatch_ak_for_launcher(
        cfg, logger=current_logger, services=current_services
    )
    result = verify_ak_acceleration_for_launcher(
        cfg, dispatch, logger=current_logger, services=current_services
    )
    current_logger.timing("launcher_start.total", total_started)
    return result


def dispatch_ak_for_launcher(
    cfg: dict,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkDispatchResult:
    """Start/wake AK and dispatch the accelerate click without waiting for it.

    The caller may keep working (for example starting Steam) while AK performs
    its own acceleration transition, then confirm the result with
    ``verify_ak_acceleration_for_launcher``.
    """
    current_logger = _make_logger(cfg, logger, "launcher-start")
    current_services = services or WorkflowServices()
    path = _ak_path(cfg)
    total_started = time.monotonic()
    try:
        current_logger.bind(state="starting", step="start_or_connect")
        start_result = _timed_call(
            current_logger,
            "launcher_start.start_or_connect",
            lambda: current_services.start_or_connect(
                path,
                timeout=float(cfg.get("ak_start_timeout", 20)),
                window_ready_timeout=float(cfg.get("ak_window_timeout", 10)),
                logger=current_logger,
                diagnostic_dir=current_logger.output_dir,
            ),
        )
        window = _timed_call(
            current_logger,
            "launcher_start.reacquire_main_window",
            lambda: _fresh_usable_window(
                current_services, path, cfg, current_logger, "reacquire_main_window"
            ),
        )
        initial_state = _timed_call(
            current_logger,
            "launcher_start.verify_ready_to_accelerate",
            lambda: _known_state(
                current_services, cfg, current_logger, "verify_ready_to_accelerate"
            ),
        )
        pending = None
        if initial_state == legacy_ak.ACCELERATING:
            current_logger.record(
                "INFO",
                "AK 已处于加速状态；不重复点击，待后续确认稳定加速。",
                skipped=True,
            )
        elif initial_state in (legacy_ak.IDLE, legacy_ak.PAUSED):
            pending = _timed_call(
                current_logger,
                "launcher_start.accelerate",
                lambda: _dispatch_operate(
                    current_services,
                    "accelerate",
                    window,
                    cfg,
                    current_logger,
                    "accelerate",
                    initial_state=initial_state,
                ),
            )
            current_logger.record(
                "INFO",
                "已派发 AK 加速点击；不再阻塞等待，先继续启动 Steam 与 APEX。",
                step="accelerate",
            )
        else:
            raise AkAutomationError(
                "page",
                "AK_START_STATE_INVALID",
                "AK 当前页面状态不能进入加速流程。",
                observed_state=initial_state,
            )
        current_logger.timing("launcher_start.dispatch_total", total_started)
        return LauncherAkDispatchResult(
            start_result=start_result,
            initial_state=initial_state,
            window=window,
            pending=pending,
            log_path=str(current_logger.log_path) if current_logger.log_path else None,
        )
    except AkAutomationError as exc:
        current_logger.timing(
            "launcher_start.dispatch_total", total_started, success=False
        )
        _record_failure(exc, current_services, path, current_logger, "start")
        raise
    except Exception as unexpected:
        current_logger.timing(
            "launcher_start.dispatch_total", total_started, success=False
        )
        exc = _unexpected_error("start", unexpected)
        _record_failure(exc, current_services, path, current_logger, "start")
        raise exc from unexpected


def focus_ak_for_launcher(
    cfg: dict,
    dispatch: LauncherAkDispatchResult,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkDispatchResult:
    """Pull AK back to the foreground so the pending confirmation can be read.

    Steam or the game may grab the foreground right after it is launched, and
    AK's visual capture only reads while AK is the foreground window. Re-acquire
    and re-verify the window here (fail closed) so the acceleration result is
    confirmed immediately while APEX is still loading.
    """
    current_logger = _make_logger(cfg, logger, "launcher-start")
    current_services = services or WorkflowServices()
    path = _ak_path(cfg)
    started = time.monotonic()
    try:
        current_logger.bind(state="refocusing", step="refocus_for_confirmation")
        window = _timed_call(
            current_logger,
            "launcher_start.refocus_for_confirmation",
            lambda: _fresh_usable_window(
                current_services, path, cfg, current_logger, "refocus_for_confirmation"
            ),
        )
        current_logger.record(
            "INFO", "已把 AK 加速器切回前台，准备确认加速结果。", step="refocus_for_confirmation"
        )
        current_logger.timing("launcher_start.refocus_total", started)
        return dispatch.refreshed(window)
    except AkAutomationError as exc:
        current_logger.timing("launcher_start.refocus_total", started, success=False)
        _record_failure(exc, current_services, path, current_logger, "start")
        raise
    except Exception as unexpected:
        current_logger.timing("launcher_start.refocus_total", started, success=False)
        exc = _unexpected_error("start", unexpected)
        _record_failure(exc, current_services, path, current_logger, "start")
        raise exc from unexpected


def verify_ak_acceleration_for_launcher(
    cfg: dict,
    dispatch: LauncherAkDispatchResult,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkStartResult:
    """Confirm AK reached the stable accelerating state; fail closed if it did not."""
    current_logger = _make_logger(cfg, logger, "launcher-start")
    current_services = services or WorkflowServices()
    path = _ak_path(cfg)
    total_started = time.monotonic()
    try:
        current_logger.bind(
            state="confirming_acceleration", step="confirm_acceleration"
        )
        action = None
        if dispatch.pending is not None:
            action = _timed_call(
                current_logger,
                "launcher_start.confirm_acceleration",
                lambda: current_services.confirm_action(
                    dispatch.pending,
                    cfg,
                    current_logger,
                    timeout=float(cfg.get("ak_accelerate_timeout", 18)),
                    diagnostic_dir=current_logger.output_dir,
                ),
            )
            final_state = action.verification.observed_state
        else:
            _timed_call(
                current_logger,
                "launcher_start.confirm_acceleration",
                lambda: _confirm_stable_state(
                    legacy_ak.ACCELERATING,
                    dispatch.window,
                    cfg,
                    current_logger,
                    "confirm_acceleration",
                ),
            )
            final_state = legacy_ak.ACCELERATING
        if final_state != legacy_ak.ACCELERATING:
            raise AkAutomationError(
                "page",
                "AK_ACCELERATION_NOT_VERIFIED",
                "AK 未稳定进入加速状态。",
                observed_state=final_state,
            )
        current_logger.bind(state="accelerating", step="complete")
        current_logger.record("INFO", "正式启动所需的 AK 加速状态已验证。")
        current_logger.timing("launcher_start.confirm_total", total_started)
        return LauncherAkStartResult(
            start_result=dispatch.start_result,
            initial_state=dispatch.initial_state,
            final_state=final_state,
            action=action,
            log_path=str(current_logger.log_path) if current_logger.log_path else None,
        )
    except AkAutomationError as exc:
        current_logger.timing(
            "launcher_start.confirm_total", total_started, success=False
        )
        _record_failure(exc, current_services, path, current_logger, "start")
        raise
    except Exception as unexpected:
        current_logger.timing(
            "launcher_start.confirm_total", total_started, success=False
        )
        exc = _unexpected_error("start", unexpected)
        _record_failure(exc, current_services, path, current_logger, "start")
        raise exc from unexpected


def stop_ak_for_launcher(
    cfg: dict,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkStopResult:
    """Pause membership, read remaining time, and close AK with fresh verification."""
    current_logger = _make_logger(cfg, logger, "launcher-stop")
    current_services = services or WorkflowServices()
    path = _ak_path(cfg)
    total_started = time.monotonic()
    try:
        current_logger.bind(state="stopping", step="start_or_connect")
        start_result = _timed_call(
            current_logger,
            "launcher_stop.start_or_connect",
            lambda: current_services.start_or_connect(
                path,
                timeout=float(cfg.get("ak_start_timeout", 20)),
                window_ready_timeout=float(cfg.get("ak_window_timeout", 10)),
                logger=current_logger,
                diagnostic_dir=current_logger.output_dir,
            ),
        )
        window = _timed_call(
            current_logger,
            "launcher_stop.reacquire_main_window",
            lambda: _fresh_usable_window(
                current_services, path, cfg, current_logger, "reacquire_main_window"
            ),
        )
        initial_state = _timed_call(
            current_logger,
            "launcher_stop.verify_current_state",
            lambda: _known_state(
                current_services, cfg, current_logger, "verify_current_state"
            ),
        )

        stop_action = None
        stopped_state = initial_state
        if initial_state == legacy_ak.ACCELERATING:
            stop_action = _timed_call(
                current_logger,
                "launcher_stop.stop_acceleration",
                lambda: _operate(
                    current_services,
                    "stop",
                    window,
                    cfg,
                    current_logger,
                    "stop_acceleration",
                    initial_state=initial_state,
                ),
            )
            stopped_state = stop_action.verification.observed_state

        membership_pause_action = None
        if stopped_state == legacy_ak.IDLE:
            window = _timed_call(
                current_logger,
                "launcher_stop.reacquire_for_membership_pause",
                lambda: _fresh_usable_window(
                    current_services, path, cfg, current_logger, "pause_membership_timer"
                ),
            )
            (
                membership_pause_action,
                paused_state,
                window,
            ) = _timed_call(
                current_logger,
                "launcher_stop.pause_membership_timer",
                lambda: _pause_membership_timer(
                    current_services,
                    path,
                    cfg,
                    current_logger,
                    window,
                    initial_state=stopped_state,
                ),
            )
        elif stopped_state == legacy_ak.PAUSED:
            paused_state = stopped_state
            if stop_action is None:
                _timed_call(
                    current_logger,
                    "launcher_stop.verify_membership_timer_paused",
                    lambda: _confirm_stable_state(
                        legacy_ak.PAUSED,
                        window,
                        cfg,
                        current_logger,
                        "verify_membership_timer_paused",
                    ),
                )
            current_logger.record(
                "INFO",
                "绿色恢复状态表示会员时长已暂停；不重复点击。",
                step="pause_membership_timer",
                skipped=True,
            )
        else:
            raise AkAutomationError(
                "page",
                "ACCELERATION_STOP_STATE_INVALID",
                "停止加速后页面没有进入空闲或会员暂停状态。",
                observed_state=stopped_state,
            )
        if paused_state != legacy_ak.PAUSED:
            raise AkAutomationError(
                "page",
                "MEMBERSHIP_TIMER_NOT_PAUSED",
                "会员时长暂停状态未验证。",
                observed_state=paused_state,
            )

        window = _timed_call(
            current_logger,
            "launcher_stop.reacquire_for_membership_read",
            lambda: _fresh_usable_window(
                current_services, path, cfg, current_logger, "read_membership"
            ),
        )
        membership_info = _timed_call(
            current_logger,
            "launcher_stop.read_membership",
            lambda: current_services.read_membership(
                window,
                cfg,
                current_logger,
                diagnostic_dir=current_logger.output_dir,
                timeout=float(cfg.get("ak_membership_ocr_timeout", 10)),
            ),
        )

        window = _timed_call(
            current_logger,
            "launcher_stop.reacquire_before_close",
            lambda: _fresh_usable_window(
                current_services, path, cfg, current_logger, "verify_before_close"
            ),
        )
        final_page_state = _timed_call(
            current_logger,
            "launcher_stop.verify_before_close",
            lambda: _confirm_stable_state(
                legacy_ak.PAUSED,
                window,
                cfg,
                current_logger,
                "verify_before_close",
            ).observed_state,
        )
        if final_page_state != legacy_ak.PAUSED:
            raise AkAutomationError(
                "page",
                "MEMBERSHIP_PAGE_CLOSE_VERIFICATION_FAILED",
                "读取会员时长后没有确认主页面仍处于暂停状态。",
                observed_state=final_page_state,
            )
        current_logger.bind(state="closing", step="close_accelerator")
        close_result = _timed_call(
            current_logger,
            "launcher_stop.close_accelerator",
            lambda: current_services.close_and_verify(path, logger=current_logger),
        )
        remaining_processes, remaining_window = _timed_call(
            current_logger,
            "launcher_stop.verify_exit",
            lambda: (
                current_services.find_processes(path),
                current_services.get_fresh_window(path),
            ),
        )
        if remaining_processes or remaining_window is not None:
            raise AkAutomationError(
                "process",
                "AK_EXIT_VERIFICATION_FAILED",
                "关闭接口返回后仍发现 AK 进程或窗口。",
                remaining_processes=remaining_processes,
                remaining_window=remaining_window,
            )
        current_logger.bind(state="exited", step="complete")
        current_logger.record(
            "INFO",
            f"AK 已退出；会员时长 {membership_info.hours} 时 {membership_info.minutes} 分。",
        )
        current_logger.timing("launcher_stop.total", total_started)
        return LauncherAkStopResult(
            start_result=start_result,
            initial_state=initial_state,
            stop_action=stop_action,
            membership_pause_action=membership_pause_action,
            membership_info=membership_info,
            close_result=close_result,
            final_state="exited",
            log_path=str(current_logger.log_path) if current_logger.log_path else None,
        )
    except AkAutomationError as exc:
        current_logger.timing("launcher_stop.total", total_started, success=False)
        _record_failure(exc, current_services, path, current_logger, "stop")
        raise
    except Exception as unexpected:
        current_logger.timing("launcher_stop.total", total_started, success=False)
        exc = _unexpected_error("stop", unexpected)
        _record_failure(exc, current_services, path, current_logger, "stop")
        raise exc from unexpected


def rollback_ak_after_failed_launch(
    cfg: dict,
    start_result: LauncherAkStartResult,
    *,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> LauncherAkRollbackResult:
    """Undo only AK process/state changes owned by the failed launcher start."""
    current_logger = _make_logger(cfg, logger, "launcher-rollback")
    current_services = services or WorkflowServices()
    path = _ak_path(cfg)
    ownership = _rollback_ownership(start_result)
    try:
        current_logger.bind(state="rolling_back", step="classify_ownership")
        current_logger.record(
            "INFO",
            f"AK 启动回滚所有权：{ownership}",
            ownership=ownership,
        )
        if ownership == "preexisting_unchanged":
            current_logger.record(
                "INFO",
                "AK 为用户原有且本轮未改变加速状态；完全跳过回滚操作。",
                skipped=True,
            )
            return LauncherAkRollbackResult(
                ownership=ownership,
                initial_state=start_result.initial_state,
                final_state=start_result.final_state,
                stop_action=None,
                membership_pause_action=None,
                close_result=None,
                log_path=(
                    str(current_logger.log_path) if current_logger.log_path else None
                ),
            )

        expected = {_process_key(item) for item in start_result.start_result.processes}
        current_processes = tuple(current_services.find_processes(path))
        if not current_processes:
            current_logger.record(
                "INFO",
                "AK 已在回滚前退出；没有执行页面操作或关闭操作。",
                process_state="absent",
            )
            return LauncherAkRollbackResult(
                ownership=ownership,
                initial_state=None,
                final_state="exited",
                stop_action=None,
                membership_pause_action=None,
                close_result=(
                    CloseResult(True, False, (), (), 0.0)
                    if ownership == "started_by_run"
                    else None
                ),
                log_path=(
                    str(current_logger.log_path) if current_logger.log_path else None
                ),
            )
        current_keys = {_process_key(item) for item in current_processes}
        if not expected or not current_keys.issubset(expected):
            raise AkAutomationError(
                "process",
                "AK_ROLLBACK_PROCESS_IDENTITY_CHANGED",
                "AK 进程身份与启动成功时不一致；已拒绝操作不确定进程。",
                expected_processes=[item.to_dict() for item in start_result.start_result.processes],
                current_processes=[item.to_dict() for item in current_processes],
            )

        window = _fresh_usable_window(
            current_services, path, cfg, current_logger, "reacquire_for_rollback"
        )
        initial_state = _known_state(
            current_services, cfg, current_logger, "verify_rollback_state"
        )
        stop_action = None
        membership_pause_action = None
        paused_state = initial_state
        if initial_state == legacy_ak.ACCELERATING:
            stop_action = _operate(
                current_services,
                "stop",
                window,
                cfg,
                current_logger,
                "rollback_stop_acceleration",
                initial_state=initial_state,
            )
            paused_state = stop_action.verification.observed_state
        if paused_state == legacy_ak.IDLE:
            window = _fresh_usable_window(
                current_services,
                path,
                cfg,
                current_logger,
                "rollback_pause_membership_timer",
            )
            membership_pause_action = _operate(
                current_services,
                "member_pause",
                window,
                cfg,
                current_logger,
                "rollback_pause_membership_timer",
                initial_state=paused_state,
            )
            paused_state = membership_pause_action.verification.observed_state
        elif paused_state == legacy_ak.PAUSED:
            if stop_action is None:
                _confirm_stable_state(
                    legacy_ak.PAUSED,
                    window,
                    cfg,
                    current_logger,
                    "verify_rollback_paused",
                )
            current_logger.record(
                "INFO",
                "绿色恢复状态表示会员时长已暂停；回滚不重复点击。",
                step="rollback_pause_membership_timer",
                skipped=True,
            )
        else:
            raise AkAutomationError(
                "page",
                "AK_ROLLBACK_STATE_INVALID",
                "AK 启动回滚后没有进入绿色暂停状态。",
                observed_state=paused_state,
            )
        if paused_state != legacy_ak.PAUSED:
            raise AkAutomationError(
                "page",
                "AK_ROLLBACK_PAUSE_NOT_VERIFIED",
                "AK 启动回滚没有确认会员时长已暂停。",
                observed_state=paused_state,
            )

        close_result = None
        final_state = legacy_ak.PAUSED
        if ownership == "started_by_run":
            current_logger.bind(state="rolling_back", step="close_owned_ak")
            close_result = current_services.close_and_verify(path, logger=current_logger)
            remaining_processes = current_services.find_processes(path)
            remaining_window = current_services.get_fresh_window(path)
            if remaining_processes or remaining_window is not None:
                raise AkAutomationError(
                    "process",
                    "AK_ROLLBACK_EXIT_VERIFICATION_FAILED",
                    "关闭本轮启动的 AK 后仍发现进程或窗口。",
                    remaining_processes=remaining_processes,
                    remaining_window=remaining_window,
                )
            final_state = "exited"
        else:
            current_logger.record(
                "INFO",
                "AK 为用户原有进程；只恢复绿色暂停状态并保留窗口和进程。",
                skipped_close=True,
            )

        current_logger.bind(state="rolled_back", step="complete")
        current_logger.record("INFO", f"AK 启动回滚完成：{final_state}")
        return LauncherAkRollbackResult(
            ownership=ownership,
            initial_state=initial_state,
            final_state=final_state,
            stop_action=stop_action,
            membership_pause_action=membership_pause_action,
            close_result=close_result,
            log_path=str(current_logger.log_path) if current_logger.log_path else None,
        )
    except AkAutomationError as exc:
        _record_failure(exc, current_services, path, current_logger, "rollback")
        raise
    except Exception as unexpected:
        exc = _unexpected_error("rollback", unexpected)
        _record_failure(exc, current_services, path, current_logger, "rollback")
        raise exc from unexpected
