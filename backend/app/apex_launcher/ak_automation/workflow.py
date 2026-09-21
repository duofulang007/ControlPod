# -*- coding: utf-8 -*-
"""Verified end-to-end AK workflow assembled from the existing automation layers."""

from __future__ import annotations

import base64
import os
import re
import subprocess
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from .. import ak as legacy_ak
from .. import config as config_module
from . import control_actions, process_manager, window_manager
from .control_actions import ActionResult, LocatedControl, PendingAction
from .errors import AkAutomationError
from .logger import WorkflowLogger
from .process_manager import CloseResult, ProcessSnapshot, StartResult
from .window_manager import WindowSnapshot


AK_PATH = Path(r"D:\AKPlatform\AK.exe")
MEMBERSHIP_CARD_REGION = (0.66, 0.64, 0.32, 0.25)


class WorkflowState(str, Enum):
    NOT_RUNNING = "not_running"
    STARTING = "starting"
    WINDOW_USABLE = "window_usable"
    READY_TO_ACCELERATE = "ready_to_accelerate"
    ACCELERATED = "accelerated"
    STOPPING_ACCELERATION = "stopping_acceleration"
    ACCELERATION_STOPPED = "acceleration_stopped"
    MEMBERSHIP_TIMER_PAUSED = "membership_timer_paused"
    READING_MEMBERSHIP = "reading_membership"
    MEMBERSHIP_INFO_READ = "membership_info_read"
    MEMBERSHIP_PAGE_CLOSED = "membership_page_closed"
    CLOSING_ACCELERATOR = "closing_accelerator"
    ACCELERATOR_CLOSED = "accelerator_closed"
    EXITED = "exited"
    FAILED = "failed"


_ALLOWED_TRANSITIONS: dict[WorkflowState, set[WorkflowState]] = {
    WorkflowState.NOT_RUNNING: {WorkflowState.STARTING, WorkflowState.FAILED},
    WorkflowState.STARTING: {WorkflowState.WINDOW_USABLE, WorkflowState.FAILED},
    WorkflowState.WINDOW_USABLE: {WorkflowState.READY_TO_ACCELERATE, WorkflowState.FAILED},
    WorkflowState.READY_TO_ACCELERATE: {WorkflowState.ACCELERATED, WorkflowState.FAILED},
    WorkflowState.ACCELERATED: {WorkflowState.STOPPING_ACCELERATION, WorkflowState.FAILED},
    WorkflowState.STOPPING_ACCELERATION: {
        WorkflowState.ACCELERATION_STOPPED,
        WorkflowState.FAILED,
    },
    WorkflowState.ACCELERATION_STOPPED: {
        WorkflowState.MEMBERSHIP_TIMER_PAUSED,
        WorkflowState.FAILED,
    },
    WorkflowState.MEMBERSHIP_TIMER_PAUSED: {
        WorkflowState.READING_MEMBERSHIP,
        WorkflowState.FAILED,
    },
    WorkflowState.READING_MEMBERSHIP: {
        WorkflowState.MEMBERSHIP_INFO_READ,
        WorkflowState.FAILED,
    },
    WorkflowState.MEMBERSHIP_INFO_READ: {
        WorkflowState.MEMBERSHIP_PAGE_CLOSED,
        WorkflowState.FAILED,
    },
    WorkflowState.MEMBERSHIP_PAGE_CLOSED: {
        WorkflowState.CLOSING_ACCELERATOR,
        WorkflowState.FAILED,
    },
    WorkflowState.CLOSING_ACCELERATOR: {
        WorkflowState.ACCELERATOR_CLOSED,
        WorkflowState.FAILED,
    },
    WorkflowState.ACCELERATOR_CLOSED: {WorkflowState.EXITED, WorkflowState.FAILED},
    WorkflowState.EXITED: set(),
    WorkflowState.FAILED: set(),
}


@dataclass(frozen=True)
class MembershipInfo:
    hours: int
    minutes: int
    raw_text: str
    normalized_text: str
    evidence_path: str
    reader: str = "windows.media.ocr"
    page_opened: bool = False

    @property
    def total_minutes(self) -> int:
        return self.hours * 60 + self.minutes

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["total_minutes"] = self.total_minutes
        return data


@dataclass(frozen=True)
class MembershipPageCloseResult:
    already_closed: bool
    page_opened_by_workflow: bool
    verified_main_state: str
    window: WindowSnapshot

    def to_dict(self) -> dict[str, Any]:
        return {
            "already_closed": self.already_closed,
            "page_opened_by_workflow": self.page_opened_by_workflow,
            "verified_main_state": self.verified_main_state,
            "window": self.window.to_dict(),
        }


@dataclass
class WorkflowResult:
    success: bool
    final_state: WorkflowState
    elapsed_seconds: float
    initial_processes: tuple[ProcessSnapshot, ...] = ()
    start_result: StartResult | None = None
    initial_page_state: str | None = None
    accelerate_action: ActionResult | None = None
    stop_action: ActionResult | None = None
    membership_pause_action: ActionResult | None = None
    membership_info: MembershipInfo | None = None
    membership_page_close: MembershipPageCloseResult | None = None
    close_result: CloseResult | None = None
    error: dict[str, Any] | None = None
    log_path: str | None = None
    evidence_paths: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        def convert(value: Any) -> Any:
            if value is None:
                return None
            if isinstance(value, Enum):
                return value.value
            if isinstance(value, tuple):
                return [convert(item) for item in value]
            if isinstance(value, list):
                return [convert(item) for item in value]
            if hasattr(value, "to_dict") and callable(value.to_dict):
                return value.to_dict()
            return value

        return {
            "success": self.success,
            "final_state": self.final_state.value,
            "elapsed_seconds": self.elapsed_seconds,
            "initial_processes": convert(self.initial_processes),
            "start_result": convert(self.start_result),
            "initial_page_state": self.initial_page_state,
            "accelerate_action": convert(self.accelerate_action),
            "stop_action": convert(self.stop_action),
            "membership_pause_action": convert(self.membership_pause_action),
            "membership_info": convert(self.membership_info),
            "membership_page_close": convert(self.membership_page_close),
            "close_result": convert(self.close_result),
            "error": self.error,
            "log_path": self.log_path,
            "evidence_paths": list(self.evidence_paths),
        }


_WINDOWS_OCR_SCRIPT = r"""
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRt {
    param($AsyncOperation, [Type]$ResultType)
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq "AsTask" -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    $task.Wait()
    return $task.Result
}

$imagePath = [Environment]::GetEnvironmentVariable("AK_MEMBERSHIP_IMAGE")
$storageFileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$bitmapDecoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$ocrEngineType = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$file = Await-WinRt ($storageFileType::GetFileFromPathAsync($imagePath)) $storageFileType
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRt ($bitmapDecoderType::CreateAsync($stream)) $bitmapDecoderType
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = $ocrEngineType::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw "Windows OCR engine is unavailable." }
$result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$result.Text
"""


def _diagnostic_dir(cfg: dict, diagnostic_dir: str | Path | None) -> Path:
    if diagnostic_dir is not None:
        return Path(diagnostic_dir)
    configured = cfg.get("ak_diagnostic_dir")
    return Path(configured) if configured else config_module.launcher_dir() / "diagnostics"


def _membership_region(cfg: dict) -> tuple[float, float, float, float]:
    raw = cfg.get("ak_membership_region", MEMBERSHIP_CARD_REGION)
    try:
        region = tuple(float(value) for value in raw)
    except (TypeError, ValueError) as exc:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_REGION_INVALID",
            "会员时长截图区域配置无效。",
            region=raw,
        ) from exc
    if len(region) != 4 or any(value < 0 or value > 1 for value in region):
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_REGION_INVALID",
            "会员时长截图区域必须由四个 0 到 1 的相对坐标组成。",
            region=list(region),
        )
    x, y, width, height = region
    if width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_REGION_INVALID",
            "会员时长截图区域超出 AK 窗口范围。",
            region=list(region),
        )
    return x, y, width, height


def _capture_membership_card(
    window: WindowSnapshot,
    cfg: dict,
    diagnostic_dir: str | Path | None,
) -> Path:
    try:
        from PIL import Image, ImageGrab
    except Exception as exc:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_CAPTURE_UNAVAILABLE",
            "缺少 Pillow，无法截取会员时长区域。",
            error=f"{type(exc).__name__}: {exc}",
        ) from exc

    left, top, right, bottom = window.rectangle
    window_width, window_height = right - left, bottom - top
    if window_width <= 0 or window_height <= 0:
        raise AkAutomationError(
            "window",
            "WINDOW_RECTANGLE_INVALID",
            "AK 窗口矩形无效，无法截取会员时长。",
            window=window.to_dict(),
        )
    x, y, width, height = _membership_region(cfg)
    crop_box = (
        left + int(window_width * x),
        top + int(window_height * y),
        left + int(window_width * (x + width)),
        top + int(window_height * (y + height)),
    )
    folder = _diagnostic_dir(cfg, diagnostic_dir)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"ak-membership-card-{int(time.time() * 1000)}.png"
    try:
        card = ImageGrab.grab(bbox=crop_box, all_screens=True)
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        enlarged = card.resize((card.width * 3, card.height * 3), resampling)
        enlarged.save(path)
    except Exception as exc:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_CAPTURE_FAILED",
            "截取会员时长区域失败。",
            error=f"{type(exc).__name__}: {exc}",
            window=window.to_dict(),
            crop_box=list(crop_box),
        ) from exc
    return path


def _run_windows_ocr(image_path: Path, timeout: float) -> str:
    encoded = base64.b64encode(_WINDOWS_OCR_SCRIPT.encode("utf-16le")).decode("ascii")
    environment = os.environ.copy()
    environment["AK_MEMBERSHIP_IMAGE"] = str(image_path.resolve())
    try:
        completed = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-EncodedCommand",
                encoded,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(0.1, timeout),
            check=False,
            env=environment,
        )
    except subprocess.TimeoutExpired as exc:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_OCR_TIMEOUT",
            "Windows OCR 在超时内没有返回会员时长。",
            timeout=timeout,
            evidence_path=str(image_path),
        ) from exc
    except OSError as exc:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_OCR_UNAVAILABLE",
            "无法启动 Windows PowerShell OCR。",
            error=f"{type(exc).__name__}: {exc}",
            evidence_path=str(image_path),
        ) from exc
    if completed.returncode != 0:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_OCR_FAILED",
            "Windows OCR 未能读取会员时长。",
            returncode=completed.returncode,
            stderr=completed.stderr.strip()[-2000:],
            evidence_path=str(image_path),
        )
    return completed.stdout.strip()


def read_membership_info(
    window: WindowSnapshot,
    cfg: dict,
    logger: WorkflowLogger,
    *,
    diagnostic_dir: str | Path | None = None,
    timeout: float = 10.0,
) -> MembershipInfo:
    """Read the visible main-page membership card without opening another page."""
    total_started = time.monotonic()
    phase_started = time.monotonic()
    latest = window_manager.read_window_state(window.hwnd, expected_pid=window.pid)
    latest = window_manager.ensure_window_usable(
        latest,
        timeout=float(cfg.get("ak_window_timeout", 10)),
        logger=logger,
        diagnostic_dir=_diagnostic_dir(cfg, diagnostic_dir),
    )
    logger.timing("membership.ensure_window_usable", phase_started)
    phase_started = time.monotonic()
    evidence_path = _capture_membership_card(latest, cfg, diagnostic_dir)
    logger.timing("membership.capture", phase_started, evidence_path=str(evidence_path))
    phase_started = time.monotonic()
    raw_text = _run_windows_ocr(evidence_path, timeout)
    logger.timing("membership.ocr", phase_started)
    normalized = re.sub(r"\s+", "", raw_text)
    match = re.search(r"会员时长.*?(\d+)时(\d+)分", normalized)
    if match is None:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_TEXT_NOT_RECOGNIZED",
            "OCR 输出中没有唯一识别到“会员时长 X 时 Y 分”。",
            raw_text=raw_text,
            normalized_text=normalized,
            evidence_path=str(evidence_path),
        )
    hours, minutes = int(match.group(1)), int(match.group(2))
    if minutes < 0 or minutes > 59:
        raise AkAutomationError(
            "page",
            "MEMBERSHIP_DURATION_INVALID",
            "识别到的会员分钟数超出有效范围。",
            hours=hours,
            minutes=minutes,
            raw_text=raw_text,
            evidence_path=str(evidence_path),
        )
    info = MembershipInfo(
        hours=hours,
        minutes=minutes,
        raw_text=raw_text,
        normalized_text=normalized,
        evidence_path=str(evidence_path),
    )
    logger.record(
        "INFO",
        f"会员时长读取成功：{hours} 时 {minutes} 分。",
        step="read_membership",
        membership=info,
    )
    logger.timing("membership.total", total_started)
    return info


@dataclass(frozen=True)
class WorkflowServices:
    find_processes: Callable[..., list[ProcessSnapshot]] = process_manager.find_ak_processes
    start_or_connect: Callable[..., StartResult] = process_manager.start_or_connect_ak
    get_fresh_window: Callable[..., WindowSnapshot | None] = window_manager.get_fresh_main_window
    ensure_window_usable: Callable[..., WindowSnapshot] = window_manager.ensure_window_usable
    find_control: Callable[..., LocatedControl] = control_actions.find_control
    dispatch_control: Callable[..., PendingAction] = control_actions.dispatch_control
    confirm_action: Callable[..., ActionResult] = control_actions.confirm_action
    invoke_control: Callable[..., ActionResult] = control_actions.invoke_control
    click_control: Callable[..., ActionResult] = control_actions.click_control
    observe_state: Callable[..., str] = legacy_ak.observe_state
    read_membership: Callable[..., MembershipInfo] = read_membership_info
    close_and_verify: Callable[..., CloseResult] = process_manager.close_ak_and_verify


class AkWorkflow:
    def __init__(
        self,
        cfg: dict,
        *,
        output_dir: str | Path | None = None,
        logger: WorkflowLogger | None = None,
        services: WorkflowServices | None = None,
    ) -> None:
        self.cfg = dict(cfg)
        self.ak_path = Path(self.cfg.get("ak_path") or AK_PATH)
        self.diagnostic_dir = _diagnostic_dir(self.cfg, output_dir)
        self.logger = logger or WorkflowLogger(self.diagnostic_dir)
        self.services = services or WorkflowServices()
        self.state = WorkflowState.NOT_RUNNING
        self.evidence_paths: list[str] = []

    def _transition(self, new_state: WorkflowState, step: str, **details: Any) -> None:
        if new_state not in _ALLOWED_TRANSITIONS[self.state]:
            raise AkAutomationError(
                "flow",
                "INVALID_WORKFLOW_TRANSITION",
                "AK 业务流程试图执行未允许的状态跳转。",
                previous_state=self.state.value,
                requested_state=new_state.value,
                step=step,
            )
        previous = self.state
        self.state = new_state
        self.logger.transition(previous, new_state, step=step, **details)

    def _observe_known_state(self, step: str) -> str:
        self.logger.bind(state=self.state, step=step)
        observed = self.services.observe_state(self.cfg, self.logger)
        self.logger.record(
            "INFO",
            f"AK 页面状态：{observed}",
            step=step,
            process_state="present",
            page_state=observed,
        )
        if observed == legacy_ak.UNKNOWN:
            failure = legacy_ak.last_failure()
            raise AkAutomationError(
                "page",
                failure.get("code") or "AK_STATE_UNRECOGNIZED",
                "无法确认 AK 页面处于待加速、已加速或会员暂停状态。",
                evidence_path=failure.get("diagnostic_path"),
            )
        return observed

    def _operate(
        self,
        key: str,
        window: WindowSnapshot,
        step: str,
        *,
        initial_state: str | None = None,
    ) -> ActionResult:
        self.logger.bind(state=self.state, step=step)
        control = self.services.find_control(
            key,
            self.cfg,
            window=window,
            logger=self.logger,
            diagnostic_dir=self.diagnostic_dir,
        )
        self.logger.record(
            "INFO",
            f"目标控件已定位：{key}",
            step=step,
            control_state={
                "visible": control.visible,
                "enabled": control.enabled,
                "supports_invoke": control.supports_invoke,
                "supports_click": control.supports_click,
            },
            control=control,
        )
        kwargs = {
            "initial_state": initial_state,
            "timeout": float(
                self.cfg.get(
                    {
                        "accelerate": "ak_accelerate_timeout",
                        "stop": "ak_stop_timeout",
                        "member_pause": "ak_membership_pause_timeout",
                    }.get(key, "ak_state_timeout"),
                    self.cfg.get("ak_state_timeout", 30),
                )
            ),
            "diagnostic_dir": self.diagnostic_dir,
        }
        if control.strategy == "uia" and control.supports_invoke:
            return self.services.invoke_control(control, self.cfg, self.logger, **kwargs)
        return self.services.click_control(control, self.cfg, self.logger, **kwargs)

    def _fresh_usable_window(self, step: str) -> WindowSnapshot:
        fresh = self.services.get_fresh_window(self.ak_path)
        if fresh is None:
            raise AkAutomationError(
                "window",
                "AK_MAIN_WINDOW_NOT_FOUND",
                "重新获取 PID/HWND 后没有找到 AK 主窗口。",
                step=step,
            )
        usable = self.services.ensure_window_usable(
            fresh,
            timeout=float(self.cfg.get("ak_window_timeout", 10)),
            logger=self.logger,
            diagnostic_dir=self.diagnostic_dir,
        )
        self.logger.record(
            "INFO",
            "已重新获取并验证 AK 主窗口。",
            step=step,
            process_state="present",
            window_state=usable,
        )
        return usable

    def _verify_membership_page_closed(self) -> MembershipPageCloseResult:
        window = self._fresh_usable_window("close_membership_page")
        observed = self._observe_known_state("close_membership_page")
        if observed != legacy_ak.PAUSED:
            raise AkAutomationError(
                "page",
                "MEMBERSHIP_PAGE_CLOSE_VERIFICATION_FAILED",
                "会员信息读取后未回到可确认的主页面会员暂停状态。",
                observed_state=observed,
                window=window.to_dict(),
            )
        result = MembershipPageCloseResult(
            already_closed=True,
            page_opened_by_workflow=False,
            verified_main_state=observed,
            window=window,
        )
        self.logger.record(
            "INFO",
            "会员时长直接从主页面读取；本轮未打开独立会员页，已验证无需关闭。",
            step="close_membership_page",
            result=result,
        )
        return result

    def _capture_failure(self, reason: str) -> str | None:
        try:
            window = self.services.get_fresh_window(self.ak_path)
            if window is not None:
                path = self.logger.capture(window, reason, required=True)
                if path:
                    self.evidence_paths.append(path)
                return path
        except Exception as capture_error:
            self.logger.record(
                "ERROR",
                "保存失败现场时发生异常。",
                code="FAILURE_EVIDENCE_CAPTURE_FAILED",
                error=f"{type(capture_error).__name__}: {capture_error}",
            )
        return None

    def run(self) -> WorkflowResult:
        started = time.monotonic()
        initial_processes: tuple[ProcessSnapshot, ...] = ()
        start_result: StartResult | None = None
        initial_page_state: str | None = None
        accelerate_action: ActionResult | None = None
        stop_action: ActionResult | None = None
        membership_pause_action: ActionResult | None = None
        membership_info: MembershipInfo | None = None
        membership_page_close: MembershipPageCloseResult | None = None
        close_result: CloseResult | None = None

        try:
            self.logger.bind(state=self.state, step="discover_process")
            initial_processes = tuple(self.services.find_processes(self.ak_path))
            self.logger.record(
                "INFO",
                "已重新检查 AK 进程。",
                step="discover_process",
                process_state="present" if initial_processes else "absent",
                processes=initial_processes,
            )

            self._transition(WorkflowState.STARTING, "start_or_connect")
            start_result = self.services.start_or_connect(
                self.ak_path,
                timeout=float(self.cfg.get("ak_start_timeout", 20)),
                window_ready_timeout=float(self.cfg.get("ak_window_timeout", 10)),
                logger=self.logger,
                diagnostic_dir=self.diagnostic_dir,
            )
            window = self._fresh_usable_window("reacquire_main_window")
            self._transition(
                WorkflowState.WINDOW_USABLE,
                "verify_window_usable",
                start_result=start_result,
                window=window,
            )

            initial_page_state = self._observe_known_state("verify_ready_to_accelerate")
            self._transition(
                WorkflowState.READY_TO_ACCELERATE,
                "verify_ready_to_accelerate",
                page_state=initial_page_state,
            )
            if initial_page_state == legacy_ak.ACCELERATING:
                self.logger.record(
                    "INFO",
                    "AK 已处于加速状态；不重复点击，保留已验证状态。",
                    step="accelerate",
                    skipped=True,
                )
            else:
                accelerate_action = self._operate(
                    "accelerate",
                    window,
                    "accelerate",
                    initial_state=initial_page_state,
                )
            self._transition(
                WorkflowState.ACCELERATED,
                "verify_accelerated",
                action=accelerate_action,
            )

            self._transition(WorkflowState.STOPPING_ACCELERATION, "stop_acceleration")
            window = self._fresh_usable_window("stop_acceleration")
            stop_action = self._operate(
                "stop",
                window,
                "stop_acceleration",
                initial_state=legacy_ak.ACCELERATING,
            )
            stopped_state = stop_action.verification.observed_state
            self._transition(
                WorkflowState.ACCELERATION_STOPPED,
                "verify_acceleration_stopped",
                action=stop_action,
                page_state=stopped_state,
            )

            if stopped_state == legacy_ak.IDLE:
                window = self._fresh_usable_window("pause_membership_timer")
                membership_pause_action = self._operate(
                    "member_pause",
                    window,
                    "pause_membership_timer",
                    initial_state=stopped_state,
                )
                paused_state = membership_pause_action.verification.observed_state
            elif stopped_state == legacy_ak.PAUSED:
                paused_state = stopped_state
                self.logger.record(
                    "INFO",
                    "停止加速后会员计时已暂停；不重复点击。",
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
            self._transition(
                WorkflowState.MEMBERSHIP_TIMER_PAUSED,
                "verify_membership_timer_paused",
                action=membership_pause_action,
                page_state=paused_state,
            )

            self._transition(WorkflowState.READING_MEMBERSHIP, "read_membership")
            window = self._fresh_usable_window("read_membership")
            membership_info = self.services.read_membership(
                window,
                self.cfg,
                self.logger,
                diagnostic_dir=self.diagnostic_dir,
                timeout=float(self.cfg.get("ak_membership_ocr_timeout", 10)),
            )
            self.evidence_paths.append(membership_info.evidence_path)
            self._transition(
                WorkflowState.MEMBERSHIP_INFO_READ,
                "verify_membership_read",
                membership=membership_info,
            )

            membership_page_close = self._verify_membership_page_closed()
            self._transition(
                WorkflowState.MEMBERSHIP_PAGE_CLOSED,
                "verify_membership_page_closed",
                result=membership_page_close,
            )

            self._transition(WorkflowState.CLOSING_ACCELERATOR, "close_accelerator")
            close_result = self.services.close_and_verify(
                self.ak_path,
                logger=self.logger,
            )
            self._transition(
                WorkflowState.ACCELERATOR_CLOSED,
                "verify_accelerator_closed",
                close_result=close_result,
            )
            remaining_processes = self.services.find_processes(self.ak_path)
            remaining_window = self.services.get_fresh_window(self.ak_path)
            if remaining_processes or remaining_window is not None:
                raise AkAutomationError(
                    "process",
                    "AK_EXIT_VERIFICATION_FAILED",
                    "关闭接口返回后重新检查仍发现 AK 进程或窗口。",
                    remaining_processes=remaining_processes,
                    remaining_window=remaining_window,
                )
            self._transition(
                WorkflowState.EXITED,
                "verify_exit",
                process_state="absent",
                window_state="absent",
            )
            result = WorkflowResult(
                success=True,
                final_state=self.state,
                elapsed_seconds=time.monotonic() - started,
                initial_processes=initial_processes,
                start_result=start_result,
                initial_page_state=initial_page_state,
                accelerate_action=accelerate_action,
                stop_action=stop_action,
                membership_pause_action=membership_pause_action,
                membership_info=membership_info,
                membership_page_close=membership_page_close,
                close_result=close_result,
                log_path=str(self.logger.log_path) if self.logger.log_path else None,
                evidence_paths=list(self.evidence_paths),
            )
            self.logger.record(
                "INFO", "AK 完整业务流程验收成功。", step="complete", result=result.to_dict()
            )
            return result
        except AkAutomationError as exc:
            failure_state = self.state
            if self.state != WorkflowState.FAILED:
                self._transition(
                    WorkflowState.FAILED,
                    "failure",
                    failed_from=failure_state,
                    error=exc.to_dict(),
                )
            existing_evidence = exc.details.get("evidence_path")
            if existing_evidence:
                self.evidence_paths.append(str(existing_evidence))
            else:
                captured = self._capture_failure(f"workflow-{exc.stage}-{exc.code}")
                if captured:
                    exc.details["evidence_path"] = captured
            self.logger.record(
                "ERROR",
                "AK 流程在首个失败处停止；未执行后续业务动作。",
                code=exc.code,
                failed_from=failure_state,
                error=exc.to_dict(),
            )
            return WorkflowResult(
                success=False,
                final_state=self.state,
                elapsed_seconds=time.monotonic() - started,
                initial_processes=initial_processes,
                start_result=start_result,
                initial_page_state=initial_page_state,
                accelerate_action=accelerate_action,
                stop_action=stop_action,
                membership_pause_action=membership_pause_action,
                membership_info=membership_info,
                membership_page_close=membership_page_close,
                close_result=close_result,
                error=exc.to_dict(),
                log_path=str(self.logger.log_path) if self.logger.log_path else None,
                evidence_paths=list(dict.fromkeys(self.evidence_paths)),
            )
        except Exception as unexpected:
            failure_state = self.state
            exc = AkAutomationError(
                "flow",
                "UNEXPECTED_WORKFLOW_ERROR",
                "AK 流程发生未分类异常，已在当前步骤安全停止。",
                error=f"{type(unexpected).__name__}: {unexpected}",
                failed_from=failure_state.value,
            )
            if WorkflowState.FAILED in _ALLOWED_TRANSITIONS[self.state]:
                self._transition(
                    WorkflowState.FAILED,
                    "failure",
                    failed_from=failure_state,
                    error=exc.to_dict(),
                )
            else:
                self.state = WorkflowState.FAILED
                self.logger.bind(state=self.state, step="failure")
            captured = self._capture_failure(
                f"workflow-{exc.stage}-{exc.code.lower()}"
            )
            if captured:
                exc.details["evidence_path"] = captured
            self.logger.record(
                "ERROR",
                "AK 流程在未分类异常处停止；未执行后续业务动作。",
                code=exc.code,
                failed_from=failure_state,
                error=exc.to_dict(),
            )
            return WorkflowResult(
                success=False,
                final_state=self.state,
                elapsed_seconds=time.monotonic() - started,
                initial_processes=initial_processes,
                start_result=start_result,
                initial_page_state=initial_page_state,
                accelerate_action=accelerate_action,
                stop_action=stop_action,
                membership_pause_action=membership_pause_action,
                membership_info=membership_info,
                membership_page_close=membership_page_close,
                close_result=close_result,
                error=exc.to_dict(),
                log_path=str(self.logger.log_path) if self.logger.log_path else None,
                evidence_paths=list(dict.fromkeys(self.evidence_paths)),
            )


def run_full_workflow(
    cfg: dict,
    *,
    output_dir: str | Path | None = None,
    logger: WorkflowLogger | None = None,
    services: WorkflowServices | None = None,
) -> WorkflowResult:
    return AkWorkflow(
        cfg,
        output_dir=output_dir,
        logger=logger,
        services=services,
    ).run()


def workflow_result_for_ui(
    result: WorkflowResult,
    logger: WorkflowLogger,
) -> dict[str, Any]:
    """Map one complete workflow result to the existing AK test API contract."""
    error = result.error or {}
    error_details = error.get("details") if isinstance(error.get("details"), dict) else {}
    diagnostic_path = error_details.get("evidence_path")
    if not diagnostic_path and result.evidence_paths:
        diagnostic_path = result.evidence_paths[-1]
    membership = (
        result.membership_info.to_dict()
        if result.membership_info is not None
        else None
    )
    logs = [
        {
            "level": record.level,
            "at": datetime.fromtimestamp(
                record.timestamp, tz=timezone.utc
            ).isoformat(),
            "text": record.message,
            "seq": index,
            "state": record.state,
            "step": record.step,
            "code": record.code,
        }
        for index, record in enumerate(logger.records, start=1)
    ]
    return {
        "ok": result.success,
        "code": error.get("code"),
        "message": (
            "AK 完整业务流程已完成。"
            if result.success
            else error.get("message", "AK 完整业务流程未完成。")
        ),
        "state": result.final_state.value,
        "failure_stage": error.get("stage"),
        "membership": membership,
        "diagnostic_path": diagnostic_path,
        "log_path": result.log_path,
        "logs": logs,
        "workflow": result.to_dict(),
    }


def run_full_workflow_for_ui(
    cfg: dict,
    *,
    output_dir: str | Path | None = None,
    services: WorkflowServices | None = None,
) -> dict[str, Any]:
    """Run exactly one complete state machine and return its HTTP/UI payload."""
    folder = (
        Path(output_dir)
        if output_dir is not None
        else _diagnostic_dir(cfg, None) / "workflow"
    )
    logger = WorkflowLogger(folder, run_name="full-workflow")
    result = run_full_workflow(
        cfg,
        output_dir=folder,
        logger=logger,
        services=services,
    )
    return workflow_result_for_ui(result, logger)
