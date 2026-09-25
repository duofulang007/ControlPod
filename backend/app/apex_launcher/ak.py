# -*- coding: utf-8 -*-
"""AK control using window-local visual state confirmation only."""
import os
import threading
import time
from datetime import datetime, timezone

from . import config as config_module
from . import processes as proc

try:
    import cv2
    import mss
    import numpy as np
    HAVE_VISION = True
except Exception:
    HAVE_VISION = False

AK_EXE, AK_WINDOW = "AK.exe", "AK加速器"
AK_PROCESSES = [AK_EXE, "AKPlatform.exe"]
ACCELERATING, IDLE, PAUSED, UNKNOWN = "accelerating", "idle", "paused", "unknown"
TEMPLATES = {
    "accelerate": "accelerate.png",
    "pause": "pause_button.png",
    "member_pause": "member_pause.png",
    "paused_text": "paused_text.png",
}
DEFAULT_VISUAL_REGIONS = {
    "accelerate": (0.18, 0.40, 0.47, 0.28),
    "pause": (0.18, 0.40, 0.47, 0.28),
    "member_pause": (0.76, 0.66, 0.21, 0.20),
    "paused_text": (0.76, 0.66, 0.21, 0.20),
}
_failure = threading.local()
CAPTURE_FAILURE_MESSAGES = {
    "AK_WINDOW_PREPARE_FAILED": "AK 窗口恢复或前置失败，未截图、未点击；请将 AK 切到前台后重试",
    "AK_SCREENSHOT_FAILED": "AK 窗口截图失败，未执行识别或点击",
}


def _report_capture_failure(log) -> bool:
    code = getattr(_failure, "capture_code", None)
    if code not in CAPTURE_FAILURE_MESSAGES:
        return False
    _set_failure(code)
    log.error(CAPTURE_FAILURE_MESSAGES[code])
    return True


def _record_timing(log, operation: str, started_at: float, **details) -> float:
    elapsed = max(0.0, time.monotonic() - started_at)
    timing = getattr(log, "timing", None)
    if callable(timing):
        return timing(operation, started_at, **details)
    record = getattr(log, "record", None)
    if callable(record):
        record(
            "INFO",
            f"耗时记录：{operation} {elapsed:.3f}s",
            perf_operation=operation,
            duration_seconds=elapsed,
            **details,
        )
    return elapsed


def _set_failure(code: str, path: str | None = None) -> None:
    _failure.code, _failure.diagnostic_path = code, path


def last_failure() -> dict[str, str | None]:
    return {"code": getattr(_failure, "code", "AK_VISION_FAILED"), "diagnostic_path": getattr(_failure, "diagnostic_path", None)}


def ak_running() -> bool:
    return proc.is_process_running(AK_EXE)


def template_path(which: str):
    return config_module.template_path(TEMPLATES.get(which, which).removesuffix(".png"))


def _read_image(path, flags):
    """Decode through Python bytes so Windows paths containing Chinese work."""
    try:
        encoded = np.frombuffer(path.read_bytes(), dtype=np.uint8)
        return cv2.imdecode(encoded, flags)
    except Exception:
        return None


def _write_image(path, image) -> bool:
    """Encode first, then let pathlib write the Unicode Windows path."""
    try:
        ok, encoded = cv2.imencode(path.suffix or ".png", image)
        if not ok:
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encoded.tobytes())
        return True
    except Exception:
        return False


def _ak_process_ids(cfg: dict) -> set[int]:
    install_dir = os.path.dirname(cfg.get("ak_path", "")) or None
    return set(proc.find_related_pids(AK_PROCESSES, install_dir))


def _capture_window_bgr(cfg: dict):
    _failure.capture_code = None
    if not HAVE_VISION:
        return None
    handle = proc.prepare_window(AK_WINDOW, center=True, process_ids=_ak_process_ids(cfg))
    if not handle:
        _failure.capture_code = "AK_WINDOW_PREPARE_FAILED"
        return None
    rect = proc.window_rect(handle) if handle else None
    if not rect:
        _failure.capture_code = "AK_SCREENSHOT_FAILED"
        return None
    left, top, width, height = rect
    try:
        with mss.mss() as sct:
            shot = sct.grab({"left": left, "top": top, "width": width, "height": height})
            return cv2.cvtColor(np.array(shot), cv2.COLOR_BGRA2BGR), (left, top)
    except Exception:
        _failure.capture_code = "AK_SCREENSHOT_FAILED"
        return None


def _diagnostic(cfg: dict, reason: str) -> str | None:
    captured = _capture_window_bgr(cfg)
    if not captured:
        return None
    try:
        folder = config_module.launcher_dir() / "diagnostics"
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        path = folder / f"ak-{reason}-{stamp}.png"
        return str(path) if _write_image(path, captured[0]) else None
    except Exception:
        return None


def _visual_region(cfg: dict, which: str, image) -> tuple[int, int, int, int] | None:
    configured = cfg.get("ak_visual_regions", {})
    region = configured.get(which) if isinstance(configured, dict) else None
    if region is None:
        region = DEFAULT_VISUAL_REGIONS.get(which)
    if not isinstance(region, (list, tuple)) or len(region) != 4:
        return None
    try:
        x, y, width, height = (float(value) for value in region)
    except (TypeError, ValueError):
        return None
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 or y + height > 1:
        return None
    image_height, image_width = image.shape[:2]
    left = max(0, min(image_width - 1, int(image_width * x)))
    top = max(0, min(image_height - 1, int(image_height * y)))
    right = max(left + 1, min(image_width, int(image_width * (x + width))))
    bottom = max(top + 1, min(image_height, int(image_height * (y + height))))
    return left, top, right, bottom


def _match_visual_in_capture(
    cfg: dict,
    which: str,
    captured,
    *,
    use_region: bool,
):
    """Match against one existing capture while preserving frozen match parameters."""
    path = template_path(which)
    if not captured or not path.exists():
        return None, None, None
    path = template_path(which)
    template = _read_image(path, cv2.IMREAD_COLOR)
    if template is None:
        return None, None, None
    image, (left, top) = captured
    region = _visual_region(cfg, which, image) if use_region else None
    if region is None:
        region_left, region_top, region_right, region_bottom = 0, 0, image.shape[1], image.shape[0]
    else:
        region_left, region_top, region_right, region_bottom = region
    search_image = image[region_top:region_bottom, region_left:region_right]
    best = None
    for scale in cfg.get("ak_vision_scales", [1.0]):
        scale = float(scale)
        if scale <= 0:
            continue
        resized = cv2.resize(template, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        height, width = resized.shape[:2]
        if height < 1 or width < 1 or height > search_image.shape[0] or width > search_image.shape[1]:
            continue
        _, score, _, location = cv2.minMaxLoc(cv2.matchTemplate(search_image, resized, cv2.TM_CCOEFF_NORMED))
        candidate = (
            left + region_left + location[0] + width // 2,
            top + region_top + location[1] + height // 2,
            float(score),
        )
        if best is None or candidate[2] > best[2]:
            best = candidate
    result = best if best and best[2] >= float(cfg.get("ak_vision_threshold", .92)) else None
    return result, best, region


def find_visual(cfg: dict, which: str):
    """Find one frozen template using a fast ROI and same-capture full fallback."""
    started = time.monotonic()
    capture_started = time.monotonic()
    captured = _capture_window_bgr(cfg)
    capture_seconds = time.monotonic() - capture_started
    match_started = time.monotonic()
    result, best, region = _match_visual_in_capture(cfg, which, captured, use_region=True)
    full_fallback = False
    if (
        captured
        and result is None
        and bool(cfg.get("ak_visual_full_fallback", True))
        and region is not None
    ):
        full_fallback = True
        result, full_best, _unused = _match_visual_in_capture(
            cfg, which, captured, use_region=False
        )
        if full_best is not None and (best is None or full_best[2] > best[2]):
            best = full_best
    _failure.visual_timing = {
        "visual_key": which,
        "duration_seconds": time.monotonic() - started,
        "capture_seconds": capture_seconds,
        "match_seconds": time.monotonic() - match_started,
        "matched": result is not None,
        "score": float(best[2]) if best is not None else None,
        "region": list(region) if region is not None else None,
        "full_fallback": full_fallback,
    }
    return result


def observe_state(cfg: dict, log) -> str:
    started = time.monotonic()
    _failure.capture_code = None
    if not HAVE_VISION:
        _set_failure("AK_VISION_UNAVAILABLE")
        log.error("视觉识别依赖不可用，已安全停止")
        _record_timing(log, "visual_state_observation", started, success=False)
        return UNKNOWN
    capture_started = time.monotonic()
    captured = _capture_window_bgr(cfg)
    capture_seconds = time.monotonic() - capture_started
    if not captured:
        _report_capture_failure(log)
        _record_timing(log, "visual_state_observation", started, success=False)
        return UNKNOWN
    matches = []
    timings = []
    best_by_name = {}
    for name in ("accelerate", "pause", "paused_text"):
        match_started = time.monotonic()
        result, best, region = _match_visual_in_capture(
            cfg, name, captured, use_region=True
        )
        matches.append(result is not None)
        best_by_name[name] = best
        timings.append({
            "visual_key": name,
            "capture_seconds": capture_seconds,
            "match_seconds": time.monotonic() - match_started,
            "matched": result is not None,
            "score": float(best[2]) if best is not None else None,
            "region": list(region) if region is not None else None,
            "full_fallback": False,
        })
    if not any(matches) and bool(cfg.get("ak_visual_full_fallback", True)):
        matches = []
        for index, name in enumerate(("accelerate", "pause", "paused_text")):
            match_started = time.monotonic()
            result, best, _unused = _match_visual_in_capture(
                cfg, name, captured, use_region=False
            )
            matches.append(result is not None)
            if best is not None and (
                best_by_name[name] is None or best[2] > best_by_name[name][2]
            ):
                best_by_name[name] = best
            timings[index].update({
                "match_seconds": timings[index]["match_seconds"] + time.monotonic() - match_started,
                "matched": result is not None,
                "score": float(best_by_name[name][2]) if best_by_name[name] is not None else None,
                "full_fallback": True,
            })
    accelerate, pause, paused_text = matches
    observed = UNKNOWN
    if pause:
        observed = ACCELERATING
    elif paused_text:
        observed = PAUSED
    elif accelerate:
        observed = IDLE
    _record_timing(
        log,
        "visual_state_observation",
        started,
        success=observed != UNKNOWN,
        observed_state=observed,
        templates=timings,
    )
    if observed == UNKNOWN:
        _set_failure("AK_STATE_UNRECOGNIZED", _diagnostic(cfg, "ambiguous"))
        log.error("无法唯一确认 AK 状态；未执行点击")
    return observed


def _click_visual(cfg: dict, which: str, log, action_id: str, found=None) -> bool:
    """定位 → 移动 → 点击，并把「瞬时失败」和「确定性失败」分开处理。

    实测（2026-09-25）：本机指针绝对定位会**偶发**被系统拒绝——`SetCursorPos` 返回 0、
    指针纹丝不动，而 pyautogui 不看这个返回值，于是只表现为「读回来的坐标对不上」。
    这类瞬时失败重试几次就过去了；而「模板没找到」「状态识别不出」这种确定性失败重试也没用，
    必须直接停。旧启动器一直带 `ak_click_retries` 这道重试（core/config.py 里就是 3 次 / 0.35s），
    移植到这一版时丢了，所以现在一次抖动就把整条流程卡在第一步、后面的步骤再也走不到。
    """
    attempts = max(1, int(cfg.get("ak_click_retries", 3)))
    interval = max(0.0, float(cfg.get("ak_click_interval", 0.35)))
    transient = {"AK_MOUSE_CONTROL_UNAVAILABLE", "AK_CLICK_INJECTION_BLOCKED"}
    for attempt in range(1, attempts + 1):
        # 重试时重新定位（found=None），不要拿着上一次那份已经过期的坐标反复点
        if _click_visual_once(cfg, which, log, action_id, found if attempt == 1 else None):
            return True
        code = last_failure().get("code")
        if code not in transient or attempt >= attempts:
            return False
        log.warn(f"[{which}] 第 {attempt}/{attempts} 次点击未被系统接受（{code}）；{interval}s 后重新定位重试")
        time.sleep(interval)
    return False


def _click_visual_once(cfg: dict, which: str, log, action_id: str, found=None) -> bool:
    _failure.capture_code = None
    proc.activate_window(AK_WINDOW, process_ids=_ak_process_ids(cfg))
    locate_started = time.monotonic()
    prelocated = found is not None
    if found is None:
        found = find_visual(cfg, which)
    timing = getattr(_failure, "visual_timing", None)
    _record_timing(
        log,
        "visual_click_target",
        locate_started,
        success=found is not None,
        visual_key=which,
        prelocated=prelocated,
        visual_timing=dict(timing) if isinstance(timing, dict) else None,
    )
    if _report_capture_failure(log):
        return False
    if not found:
        _set_failure("AK_TEMPLATE_NOT_FOUND", _diagnostic(cfg, f"missing-{which}"))
        log.error(f"未找到 [{which}] 模板；未执行点击")
        return False
    x, y, score = found
    log.info(f"视觉命中 [{which}] {score:.2f} @({x},{y})，操作 {action_id}")
    if not proc.click_at(x, y):
        input_result = proc.last_input_result()
        raw_actual = input_result.get("actual")
        actual = tuple(raw_actual) if isinstance(raw_actual, list) and len(raw_actual) == 2 else proc.get_cursor_pos()
        reason = str(input_result.get("reason") or input_result.get("error") or "")
        log.info("输入助手返回：" + str({
            key: input_result[key] for key in
            ("driver", "returncode", "error", "error_detail", "stderr", "elapsed_seconds")
            if input_result.get(key) not in (None, "")
        }))
        if reason == "pointer_move_rejected":
            code = "AK_MOUSE_CONTROL_UNAVAILABLE"
            message = (f"系统拒绝了指针绝对定位（mouse_event 与 SetCursorPos 都没生效），"
                       f"指针还停在 ({actual[0]},{actual[1]})，目标 ({x},{y})；未执行点击")
        elif actual == (int(x), int(y)):
            code = "AK_CLICK_INJECTION_BLOCKED"
            message = f"鼠标已到目标 ({actual[0]},{actual[1]})，但 Windows 未确认左键按下/抬起；点击未执行"
        else:
            code = "AK_MOUSE_CONTROL_UNAVAILABLE"
            detail = f"（输入助手原因：{reason}）" if reason else ""
            message = f"鼠标未到视觉目标：目标 ({x},{y})，实际 ({actual[0]},{actual[1]}){detail}；点击未执行"
        _set_failure(code, _diagnostic(cfg, f"mouse-{which}"))
        log.error(message)
        return False
    log.info(f"Windows 已确认左键按下和抬起，操作 {action_id}")
    cooldown = max(0.0, float(cfg.get("ak_action_cooldown", 1)))
    if cooldown:
        time.sleep(cooldown)
    return True


def _wait_any_state(cfg: dict, log, expected: tuple[str, ...]) -> str | None:
    deadline = time.monotonic() + float(cfg.get("ak_state_timeout", 8))
    required = max(1, int(cfg.get("ak_stable_samples", 3)))
    candidate = None
    consecutive = 0
    while time.monotonic() < deadline:
        _failure.capture_code = None
        observed = observe_state(cfg, log)
        if getattr(_failure, "capture_code", None) in CAPTURE_FAILURE_MESSAGES:
            return None
        if observed in expected:
            if observed == candidate:
                consecutive += 1
            else:
                candidate, consecutive = observed, 1
            if consecutive >= required:
                log.info(f"AK 状态 [{observed}] 已连续确认 {consecutive} 次")
                return observed
        else:
            candidate = None
            consecutive = 0
        time.sleep(max(.01, float(cfg.get("ak_state_poll_interval", .4))))
    _set_failure("AK_STATE_CONFIRMATION_TIMEOUT", _diagnostic(cfg, f"wait-{expected}"))
    log.error("AK 状态确认超时；未重复点击")
    return None


def calibrated(cfg: dict, which: str) -> bool:
    return HAVE_VISION and _read_image(template_path(which), cv2.IMREAD_GRAYSCALE) is not None
