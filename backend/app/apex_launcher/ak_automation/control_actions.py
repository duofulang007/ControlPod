# -*- coding: utf-8 -*-
"""Locate and operate AK controls with UIA-first, frozen-image fallback."""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, Sequence

from .. import ak as legacy_ak
from .. import config as config_module
from . import window_manager
from .errors import AkAutomationError
from .verifier import VerificationResult, verify_action_result
from .window_manager import WindowSnapshot

try:
    from pywinauto import Application
except Exception:  # pywinauto remains optional because the current AK exposes no usable child controls.
    Application = None


class LoggerLike(Protocol):
    def info(self, message: str) -> Any: ...
    def error(self, message: str) -> Any: ...


@dataclass(frozen=True)
class ControlSpec:
    key: str
    names: tuple[str, ...]
    control_types: tuple[str, ...] = ("Button",)
    automation_ids: tuple[str, ...] = ()
    visual_key: str | None = None
    expected_states: tuple[str, ...] = ()


@dataclass(frozen=True)
class LocatedControl:
    spec: ControlSpec
    strategy: str
    identifier: str
    window: WindowSnapshot
    name: str = ""
    automation_id: str = ""
    control_type: str = ""
    class_name: str = ""
    rectangle: tuple[int, int, int, int] | None = None
    visible: bool = True
    enabled: bool = True
    supports_invoke: bool = False
    supports_click: bool = False
    target: tuple[int, int] | None = None
    score: float | None = None
    uia_status: str = ""
    located_at: float = field(default_factory=time.time)
    wrapper: Any = field(default=None, repr=False, compare=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.spec.key,
            "strategy": self.strategy,
            "identifier": self.identifier,
            "name": self.name,
            "automation_id": self.automation_id,
            "control_type": self.control_type,
            "class_name": self.class_name,
            "rectangle": list(self.rectangle) if self.rectangle else None,
            "visible": self.visible,
            "enabled": self.enabled,
            "supports_invoke": self.supports_invoke,
            "supports_click": self.supports_click,
            "target": list(self.target) if self.target else None,
            "score": self.score,
            "uia_status": self.uia_status,
            "window": self.window.to_dict(),
            "located_at": self.located_at,
        }


@dataclass(frozen=True)
class ActionResult:
    action_id: str
    method: str
    control: LocatedControl
    verification: VerificationResult

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "method": self.method,
            "control": self.control.to_dict(),
            "verification": self.verification.to_dict(),
        }


@dataclass(frozen=True)
class PendingAction:
    """An action that has already been performed but is not yet state-confirmed."""

    action_id: str
    method: str
    control: LocatedControl
    initial_state: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "method": self.method,
            "initial_state": self.initial_state,
            "control": self.control.to_dict(),
        }


CONTROL_SPECS: dict[str, ControlSpec] = {
    "accelerate": ControlSpec(
        key="accelerate",
        names=("加速游戏", "加速"),
        visual_key="accelerate",
        expected_states=(legacy_ak.ACCELERATING,),
    ),
    "stop": ControlSpec(
        key="stop",
        names=("停止加速", "停止"),
        visual_key="pause",
        expected_states=(legacy_ak.IDLE, legacy_ak.PAUSED),
    ),
    "member_pause": ControlSpec(
        key="member_pause",
        names=("暂停会员时长", "会员时长", "暂停"),
        visual_key="member_pause",
        expected_states=(legacy_ak.PAUSED,),
    ),
}


def _log(logger: LoggerLike | logging.Logger | None, level: str, message: str) -> None:
    if logger is None:
        return
    method = getattr(logger, level, None)
    if callable(method):
        method(message)


def _resolve_spec(spec: ControlSpec | str) -> ControlSpec:
    if isinstance(spec, ControlSpec):
        return spec
    aliases = {"pause": "stop", "member": "member_pause", "membership": "member_pause"}
    key = aliases.get(str(spec), str(spec))
    try:
        return CONTROL_SPECS[key]
    except KeyError as exc:
        raise AkAutomationError(
            "control",
            "UNKNOWN_CONTROL_SPEC",
            "未定义该 AK 控件的定位规则。",
            requested=str(spec),
            available=sorted(CONTROL_SPECS),
        ) from exc


def _diagnostic_dir(cfg: dict, diagnostic_dir: str | Path | None) -> Path:
    if diagnostic_dir is not None:
        return Path(diagnostic_dir)
    configured = cfg.get("ak_diagnostic_dir")
    return Path(configured) if configured else config_module.launcher_dir() / "diagnostics"


def _prepare_window(
    cfg: dict,
    window: WindowSnapshot | None,
    logger: LoggerLike | logging.Logger | None,
    diagnostic_dir: str | Path | None,
) -> WindowSnapshot:
    if window is None:
        ak_path = cfg.get("ak_path")
        if not ak_path:
            raise AkAutomationError(
                "process", "MISSING_AK_PATH", "没有配置 AK.exe 路径，不能定位控件。"
            )
        window = window_manager.get_fresh_main_window(ak_path)
        if window is None:
            raise AkAutomationError(
                "window", "AK_MAIN_WINDOW_NOT_FOUND", "没有找到当前 AK 主窗口。"
            )
    else:
        window = window_manager.read_window_state(window.hwnd, expected_pid=window.pid)
    return window_manager.ensure_window_usable(
        window,
        timeout=float(cfg.get("ak_window_timeout", 10)),
        logger=logger,
        diagnostic_dir=_diagnostic_dir(cfg, diagnostic_dir),
    )


def _connect_uia_root(hwnd: int) -> Any:
    if Application is None:
        return None
    app = Application(backend="uia").connect(handle=hwnd, timeout=3)
    return app.window(handle=hwnd)


def _safe_call(value: Any, method: str, default: Any) -> Any:
    try:
        target = getattr(value, method, None)
        return target() if callable(target) else default
    except Exception:
        return default


def _rectangle(wrapper: Any) -> tuple[int, int, int, int] | None:
    rect = _safe_call(wrapper, "rectangle", None)
    if rect is None:
        return None
    try:
        return int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)
    except Exception:
        return None


def _candidate(wrapper: Any) -> dict[str, Any]:
    info = getattr(wrapper, "element_info", None)
    name = str(getattr(info, "name", "") or _safe_call(wrapper, "window_text", ""))
    automation_id = str(getattr(info, "automation_id", "") or "")
    control_type = str(getattr(info, "control_type", "") or "")
    class_name = str(getattr(info, "class_name", "") or _safe_call(wrapper, "class_name", ""))
    invoke = getattr(wrapper, "invoke", None)
    iface_invoke = getattr(wrapper, "iface_invoke", None)
    supports_invoke = callable(invoke) or callable(getattr(iface_invoke, "Invoke", None))
    return {
        "wrapper": wrapper,
        "name": name,
        "automation_id": automation_id,
        "control_type": control_type,
        "class_name": class_name,
        "rectangle": _rectangle(wrapper),
        "visible": bool(_safe_call(wrapper, "is_visible", False)),
        "enabled": bool(_safe_call(wrapper, "is_enabled", False)),
        "supports_invoke": supports_invoke,
        "supports_click": callable(getattr(wrapper, "click_input", None)),
    }


def _matches_type(candidate: dict[str, Any], spec: ControlSpec) -> bool:
    if not spec.control_types:
        return True
    allowed = {value.casefold() for value in spec.control_types}
    return candidate["control_type"].casefold() in allowed


def _find_uia(window: WindowSnapshot, spec: ControlSpec) -> tuple[dict[str, Any] | None, str]:
    if Application is None:
        return None, "UIA_DEPENDENCY_UNAVAILABLE"
    try:
        root = _connect_uia_root(window.hwnd)
        wrappers = list(root.descendants()) if root is not None else []
        candidates = [_candidate(wrapper) for wrapper in wrappers]
    except Exception as exc:
        return None, f"UIA_CONNECT_FAILED:{type(exc).__name__}:{exc}"

    typed = [candidate for candidate in candidates if _matches_type(candidate, spec)]
    if spec.automation_ids:
        automation_ids = {value.casefold() for value in spec.automation_ids}
        by_id = [
            candidate
            for candidate in typed
            if candidate["automation_id"].casefold() in automation_ids
        ]
        if len(by_id) == 1:
            return by_id[0], "UIA_UNIQUE_AUTOMATION_ID"
        if len(by_id) > 1:
            return None, f"UIA_AUTOMATION_ID_AMBIGUOUS:{len(by_id)}"

    names = {value.casefold() for value in spec.names}
    by_name = [candidate for candidate in typed if candidate["name"].casefold() in names]
    if len(by_name) == 1:
        return by_name[0], "UIA_UNIQUE_NAME_AND_CONTROL_TYPE"
    if len(by_name) > 1:
        return None, f"UIA_NAME_AND_TYPE_AMBIGUOUS:{len(by_name)}"
    return None, f"UIA_NO_MATCH:descendants={len(candidates)}"


def _uia_control(
    spec: ControlSpec,
    window: WindowSnapshot,
    candidate: dict[str, Any],
    status: str,
) -> LocatedControl:
    if not candidate["visible"]:
        raise AkAutomationError(
            "control",
            "CONTROL_NOT_VISIBLE",
            "UIA 已定位目标控件，但控件不可见。",
            spec=spec.key,
            uia_status=status,
            window=window.to_dict(),
        )
    if not candidate["enabled"]:
        raise AkAutomationError(
            "control",
            "CONTROL_DISABLED",
            "UIA 已定位目标控件，但控件未启用。",
            spec=spec.key,
            uia_status=status,
            window=window.to_dict(),
        )
    if not candidate["supports_invoke"] and not candidate["supports_click"]:
        raise AkAutomationError(
            "control",
            "CONTROL_NOT_CALLABLE",
            "UIA 已定位目标控件，但控件不支持 Invoke 或控件级点击。",
            spec=spec.key,
            uia_status=status,
            window=window.to_dict(),
        )
    identifier = (
        f"AutomationId={candidate['automation_id']}"
        if candidate["automation_id"]
        else f"Name={candidate['name']};ControlType={candidate['control_type']}"
    )
    return LocatedControl(
        spec=spec,
        strategy="uia",
        identifier=identifier,
        window=window,
        name=candidate["name"],
        automation_id=candidate["automation_id"],
        control_type=candidate["control_type"],
        class_name=candidate["class_name"],
        rectangle=candidate["rectangle"],
        visible=candidate["visible"],
        enabled=candidate["enabled"],
        supports_invoke=candidate["supports_invoke"],
        supports_click=candidate["supports_click"],
        uia_status=status,
        wrapper=candidate["wrapper"],
    )


def find_control(
    spec: ControlSpec | str,
    cfg: dict,
    *,
    window: WindowSnapshot | None = None,
    logger: LoggerLike | logging.Logger | None = None,
    diagnostic_dir: str | Path | None = None,
) -> LocatedControl:
    """Find one target via UIA, falling back to the existing visual locator only when needed."""
    resolved = _resolve_spec(spec)
    current_window = _prepare_window(cfg, window, logger, diagnostic_dir)
    candidate, uia_status = _find_uia(current_window, resolved)
    if candidate is not None:
        control = _uia_control(resolved, current_window, candidate, uia_status)
        _log(logger, "info", f"控件定位成功：{resolved.key} -> {control.identifier} (UIA)")
        return control

    _log(
        logger,
        "info",
        f"控件层不可用：{resolved.key} {uia_status}；转入冻结图像识别 {resolved.visual_key}",
    )
    if not resolved.visual_key:
        raise AkAutomationError(
            "control",
            "CONTROL_IDENTIFIER_NOT_FOUND",
            "UIA 未获得唯一控件标识，且没有配置图像兜底。",
            spec=resolved.key,
            uia_status=uia_status,
            window=current_window.to_dict(),
        )

    legacy_ak._failure.capture_code = None
    found = legacy_ak.find_visual(cfg, resolved.visual_key)
    if found is None:
        capture_code = getattr(legacy_ak._failure, "capture_code", None)
        stage = "window" if capture_code in legacy_ak.CAPTURE_FAILURE_MESSAGES else "control"
        code = capture_code or "AK_TEMPLATE_NOT_FOUND"
        evidence_path = window_manager.capture_window_evidence(
            current_window,
            _diagnostic_dir(cfg, diagnostic_dir),
            f"control-{resolved.key}-not-found",
        )
        raise AkAutomationError(
            stage,
            code,
            "没有定位到可安全操作的 AK 目标；未执行点击。",
            spec=resolved.key,
            uia_status=uia_status,
            visual_key=resolved.visual_key,
            window=current_window.to_dict(),
            evidence_path=evidence_path,
        )

    x, y, score = found
    control = LocatedControl(
        spec=resolved,
        strategy="image",
        identifier=f"ImageTemplate={resolved.visual_key}",
        window=current_window,
        supports_click=True,
        target=(int(x), int(y)),
        score=float(score),
        uia_status=uia_status,
    )
    _log(
        logger,
        "info",
        f"图像兜底定位成功：{resolved.key} score={score:.3f} target=({x},{y})",
    )
    return control


def _initial_state(
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    control: LocatedControl,
    diagnostic_dir: str | Path | None,
) -> str:
    observed = legacy_ak.observe_state(cfg, logger)
    if observed != legacy_ak.UNKNOWN:
        return observed
    failure = legacy_ak.last_failure()
    evidence_path = failure.get("diagnostic_path") or window_manager.capture_window_evidence(
        control.window,
        _diagnostic_dir(cfg, diagnostic_dir),
        f"before-{control.spec.key}-unknown",
    )
    raise AkAutomationError(
        "page",
        failure.get("code") or "AK_STATE_UNRECOGNIZED",
        "操作前无法确认 AK 页面状态；未执行控件操作。",
        control=control.to_dict(),
        window=control.window.to_dict(),
        evidence_path=evidence_path,
    )


def _verify(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    initial_state: str,
    timeout: float | None,
    diagnostic_dir: str | Path | None,
) -> VerificationResult:
    return verify_action_result(
        control.spec.expected_states,
        cfg,
        logger,
        initial_state=initial_state,
        window=control.window,
        control=control,
        timeout=timeout,
        diagnostic_dir=diagnostic_dir,
    )


def _annotate_action_failure(
    exc: AkAutomationError,
    control: LocatedControl,
    action_id: str,
    method: str,
) -> None:
    exc.details.setdefault("action_id", action_id)
    exc.details.setdefault("method", method)
    exc.details.setdefault("control", control.to_dict())


def _require_expected_states(control: LocatedControl) -> None:
    if control.spec.expected_states:
        return
    raise AkAutomationError(
        "flow",
        "EXPECTED_STATE_REQUIRED",
        "控件操作没有声明验收状态；未执行操作。",
        control=control.to_dict(),
    )


def dispatch_invoke_control(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    diagnostic_dir: str | Path | None = None,
) -> PendingAction:
    """Invoke a unique UIA control and return before the page-state confirmation."""
    action_id, method = uuid.uuid4().hex[:8], "uia.invoke"
    if control.strategy != "uia" or not control.supports_invoke:
        raise AkAutomationError(
            "control",
            "CONTROL_INVOKE_UNSUPPORTED",
            "该目标没有可用的 UIA Invoke 接口；未执行操作。",
            action_id=action_id,
            method=method,
            control=control.to_dict(),
        )
    _require_expected_states(control)
    initial = (
        initial_state
        if initial_state is not None
        else _initial_state(cfg, logger, control, diagnostic_dir)
    )
    try:
        _log(logger, "info", f"执行控件操作：{method} action_id={action_id}")
        invoke = getattr(control.wrapper, "invoke", None)
        if callable(invoke):
            invoke()
        else:
            control.wrapper.iface_invoke.Invoke()
    except AkAutomationError as exc:
        _annotate_action_failure(exc, control, action_id, method)
        raise
    except Exception as exc:
        evidence_path = window_manager.capture_window_evidence(
            control.window,
            _diagnostic_dir(cfg, diagnostic_dir),
            f"invoke-{control.spec.key}-failed",
        )
        raise AkAutomationError(
            "input",
            "CONTROL_INVOKE_FAILED",
            "UIA Invoke 调用失败；后续流程已停止。",
            action_id=action_id,
            method=method,
            error=f"{type(exc).__name__}: {exc}",
            control=control.to_dict(),
            window=control.window.to_dict(),
            evidence_path=evidence_path,
        ) from exc
    return PendingAction(action_id, method, control, initial)


def dispatch_click_control(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    diagnostic_dir: str | Path | None = None,
) -> PendingAction:
    """Click the control (UIA or frozen image) and return before state confirmation."""
    action_id = uuid.uuid4().hex[:8]
    method = "uia.click_input" if control.strategy == "uia" else "image.click"
    if not control.supports_click:
        raise AkAutomationError(
            "control",
            "CONTROL_CLICK_UNSUPPORTED",
            "该目标没有可用的控件级或图像点击方式；未执行操作。",
            action_id=action_id,
            method=method,
            control=control.to_dict(),
        )
    _require_expected_states(control)
    initial = (
        initial_state
        if initial_state is not None
        else _initial_state(cfg, logger, control, diagnostic_dir)
    )
    try:
        _log(logger, "info", f"执行控件操作：{method} action_id={action_id}")
        if control.strategy == "uia":
            control.wrapper.click_input()
        else:
            prelocated = (
                (control.target[0], control.target[1], control.score)
                if control.target is not None and control.score is not None
                else None
            )
            if not legacy_ak._click_visual(
                cfg,
                control.spec.visual_key,
                logger,
                action_id,
                found=prelocated,
            ):
                failure = legacy_ak.last_failure()
                code = failure.get("code") or "AK_CLICK_FAILED"
                if code in legacy_ak.CAPTURE_FAILURE_MESSAGES:
                    stage = "window"
                elif code in {"AK_MOUSE_CONTROL_UNAVAILABLE", "AK_CLICK_INJECTION_BLOCKED"}:
                    stage = "input"
                else:
                    stage = "control"
                raise AkAutomationError(
                    stage,
                    code,
                    "AK 图像目标点击未完成；后续流程已停止。",
                    action_id=action_id,
                    method=method,
                    control=control.to_dict(),
                    window=control.window.to_dict(),
                    evidence_path=failure.get("diagnostic_path"),
                )
    except AkAutomationError as exc:
        _annotate_action_failure(exc, control, action_id, method)
        raise
    except Exception as exc:
        evidence_path = window_manager.capture_window_evidence(
            control.window,
            _diagnostic_dir(cfg, diagnostic_dir),
            f"click-{control.spec.key}-failed",
        )
        raise AkAutomationError(
            "input",
            "CONTROL_CLICK_FAILED",
            "控件点击调用发生异常；后续流程已停止。",
            action_id=action_id,
            method=method,
            error=f"{type(exc).__name__}: {exc}",
            control=control.to_dict(),
            window=control.window.to_dict(),
            evidence_path=evidence_path,
        ) from exc
    return PendingAction(action_id, method, control, initial)


def dispatch_control(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    diagnostic_dir: str | Path | None = None,
) -> PendingAction:
    """Perform the control action without blocking on the post-action state check."""
    if control.strategy == "uia" and control.supports_invoke:
        return dispatch_invoke_control(
            control,
            cfg,
            logger,
            initial_state=initial_state,
            diagnostic_dir=diagnostic_dir,
        )
    return dispatch_click_control(
        control,
        cfg,
        logger,
        initial_state=initial_state,
        diagnostic_dir=diagnostic_dir,
    )


def confirm_action(
    pending: PendingAction,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    timeout: float | None = None,
    diagnostic_dir: str | Path | None = None,
) -> ActionResult:
    """Wait for the verified page-state change required by a dispatched action."""
    try:
        verification = _verify(
            pending.control, cfg, logger, pending.initial_state, timeout, diagnostic_dir
        )
    except AkAutomationError as exc:
        _annotate_action_failure(
            exc, pending.control, pending.action_id, pending.method
        )
        raise
    return ActionResult(pending.action_id, pending.method, pending.control, verification)


def invoke_control(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    timeout: float | None = None,
    diagnostic_dir: str | Path | None = None,
) -> ActionResult:
    """Invoke a unique UIA control and require a verified page-state change."""
    pending = dispatch_invoke_control(
        control,
        cfg,
        logger,
        initial_state=initial_state,
        diagnostic_dir=diagnostic_dir,
    )
    return confirm_action(
        pending, cfg, logger, timeout=timeout, diagnostic_dir=diagnostic_dir
    )


def click_control(
    control: LocatedControl,
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    timeout: float | None = None,
    diagnostic_dir: str | Path | None = None,
) -> ActionResult:
    """Use control click or frozen visual click, then require a verified state change."""
    pending = dispatch_click_control(
        control,
        cfg,
        logger,
        initial_state=initial_state,
        diagnostic_dir=diagnostic_dir,
    )
    return confirm_action(
        pending, cfg, logger, timeout=timeout, diagnostic_dir=diagnostic_dir
    )
