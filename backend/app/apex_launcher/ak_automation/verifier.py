# -*- coding: utf-8 -*-
"""Post-action page-state verification for AK controls."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Sequence

from .. import ak as legacy_ak
from .. import config as config_module
from . import window_manager
from .errors import AkAutomationError
from .window_manager import WindowSnapshot


class LoggerLike(Protocol):
    def info(self, message: str) -> Any: ...
    def error(self, message: str) -> Any: ...


@dataclass(frozen=True)
class VerificationResult:
    expected_states: tuple[str, ...]
    initial_state: str | None
    observed_state: str
    changed: bool
    elapsed_seconds: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "expected_states": list(self.expected_states),
            "initial_state": self.initial_state,
            "observed_state": self.observed_state,
            "changed": self.changed,
            "elapsed_seconds": self.elapsed_seconds,
        }


def _log(logger: LoggerLike | logging.Logger | None, level: str, message: str) -> None:
    if logger is None:
        return
    method = getattr(logger, level, None)
    if callable(method):
        method(message)


def _normalise_expected(expected_state: str | Sequence[str]) -> tuple[str, ...]:
    if isinstance(expected_state, str):
        values = (expected_state,)
    else:
        values = tuple(str(value) for value in expected_state)
    values = tuple(value for value in values if value)
    if not values:
        raise AkAutomationError(
            "flow",
            "EXPECTED_STATE_REQUIRED",
            "控件操作必须声明需要验证的 AK 页面状态。",
        )
    return values


def _default_diagnostic_dir(cfg: dict) -> Path:
    configured = cfg.get("ak_diagnostic_dir")
    return Path(configured) if configured else config_module.launcher_dir() / "diagnostics"


def _control_context(control: Any) -> dict[str, Any] | None:
    to_dict = getattr(control, "to_dict", None)
    if callable(to_dict):
        return to_dict()
    return None


def _fresh_window_context(window: WindowSnapshot | None) -> tuple[WindowSnapshot | None, dict[str, Any] | None]:
    if window is None:
        return None, None
    try:
        latest = window_manager.read_window_state(window.hwnd, expected_pid=window.pid)
        return latest, latest.to_dict()
    except AkAutomationError as exc:
        return window, {"refresh_error": exc.to_dict(), "last_known": window.to_dict()}


def _failure_evidence(
    cfg: dict,
    window: WindowSnapshot | None,
    reason: str,
    diagnostic_dir: str | Path | None,
) -> tuple[str | None, dict[str, Any] | None]:
    latest, context = _fresh_window_context(window)
    if latest is None:
        return None, context
    folder = Path(diagnostic_dir) if diagnostic_dir is not None else _default_diagnostic_dir(cfg)
    return window_manager.capture_window_evidence(latest, folder, reason), context


def verify_action_result(
    expected_state: str | Sequence[str],
    cfg: dict,
    logger: LoggerLike | logging.Logger | None,
    *,
    initial_state: str | None = None,
    window: WindowSnapshot | None = None,
    control: Any = None,
    timeout: float | None = None,
    diagnostic_dir: str | Path | None = None,
) -> VerificationResult:
    """Wait for a stable expected state and fail closed if no real change is proved."""
    expected = _normalise_expected(expected_state)
    verify_cfg = dict(cfg)
    if timeout is not None:
        verify_cfg["ak_state_timeout"] = max(0.0, float(timeout))

    started = time.monotonic()
    observed = legacy_ak._wait_any_state(verify_cfg, logger, expected)
    elapsed = time.monotonic() - started
    if observed is None:
        failure = legacy_ak.last_failure()
        code = failure.get("code") or "AK_STATE_CONFIRMATION_TIMEOUT"
        evidence_path = failure.get("diagnostic_path")
        window_context = None
        if not evidence_path:
            evidence_path, window_context = _failure_evidence(
                verify_cfg, window, "page-verification-failed", diagnostic_dir
            )
        elif window is not None:
            _latest, window_context = _fresh_window_context(window)
        raise AkAutomationError(
            "page",
            code,
            "控件操作后没有确认到目标页面状态，后续流程已停止。",
            expected_states=list(expected),
            initial_state=initial_state,
            elapsed_seconds=elapsed,
            window=window_context,
            control=_control_context(control),
            evidence_path=evidence_path,
        )

    changed = initial_state is None or observed != initial_state
    if not changed:
        evidence_path, window_context = _failure_evidence(
            verify_cfg, window, "page-state-unchanged", diagnostic_dir
        )
        raise AkAutomationError(
            "page",
            "AK_PAGE_STATE_UNCHANGED",
            "操作后页面仍是原状态，不能据此判定操作成功。",
            expected_states=list(expected),
            initial_state=initial_state,
            observed_state=observed,
            elapsed_seconds=elapsed,
            window=window_context,
            control=_control_context(control),
            evidence_path=evidence_path,
        )

    result = VerificationResult(
        expected_states=expected,
        initial_state=initial_state,
        observed_state=observed,
        changed=True,
        elapsed_seconds=elapsed,
    )
    _log(
        logger,
        "info",
        f"页面验证成功：{initial_state or '未记录'} -> {observed}，耗时 {elapsed:.2f}s",
    )
    return result
