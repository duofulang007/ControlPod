# -*- coding: utf-8 -*-
"""AK control using window-local visual state confirmation only."""
import os
import threading
import time
import uuid
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
AUTOMATION_REVISION = "window-focus-v7"
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


def _find_ak_window(cfg: dict):
    process_ids = _ak_process_ids(cfg)
    return proc.find_window(AK_WINDOW, process_ids=process_ids) if process_ids else None


def _wait_ak_handle(cfg: dict, timeout: float):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        handle = _find_ak_window(cfg)
        if handle:
            return handle
        time.sleep(0.25)
    return None


def _wait_ak_window(cfg: dict, log, timeout: float, settle: float = 0) -> bool:
    if _wait_ak_handle(cfg, timeout):
        proc.activate_window(AK_WINDOW, process_ids=_ak_process_ids(cfg))
        if settle:
            time.sleep(settle)
        return True
    _set_failure("AK_WINDOW_TIMEOUT")
    log.error("AK 窗口未出现，已安全停止")
    return False


def ensure_ak_running(cfg: dict, log) -> bool:
    log.step("AK 检查")
    proc.set_dpi_aware()
    timeout, settle = float(cfg.get("ak_window_timeout", 10)), float(cfg.get("ak_page_settle_seconds", 3))
    path = cfg.get("ak_path", "")
    if not path or not os.path.exists(path):
        _set_failure("MISSING_AK_PATH")
        log.error(f"未找到 AK 加速器: {path}")
        return False
    if ak_running():
        handle = _wait_ak_handle(cfg, min(timeout, 1.5))
        if handle:
            log.info("AK 已在运行，窗口已找到并激活")
            proc.activate_window(AK_WINDOW, process_ids=_ak_process_ids(cfg))
            if settle:
                time.sleep(settle)
            return True
        log.info("AK 进程在后台但窗口未显示，重新执行 AK.exe 唤出界面")
    log.info(f"执行 AK 启动命令: {path}")
    if not proc.start_process(path):
        _set_failure("AK_START_FAILED")
        log.error("AK 启动命令执行失败；请检查路径或 Windows 权限")
        return False
    log.info("AK 启动命令已执行，正在等待窗口出现")
    return _wait_ak_window(cfg, log, timeout, settle)


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
        if actual == (int(x), int(y)):
            code = "AK_CLICK_INJECTION_BLOCKED"
            message = f"鼠标已到目标 ({actual[0]},{actual[1]})，但 Windows 未确认左键按下/抬起；点击未执行"
        else:
            code = "AK_MOUSE_CONTROL_UNAVAILABLE"
            message = f"鼠标未到视觉目标：目标 ({x},{y})，实际 ({actual[0]},{actual[1]})；点击未执行"
        _set_failure(code, _diagnostic(cfg, f"mouse-{which}"))
        log.error(message)
        return False
    log.info(f"Windows 已确认左键按下和抬起，操作 {action_id}")
    cooldown = max(0.0, float(cfg.get("ak_action_cooldown", 1)))
    if cooldown:
        time.sleep(cooldown)
    return True


def test_mouse_move(cfg: dict, log) -> dict:
    """Start AK when needed, find the start button, and move only (never click)."""
    log.step("AK 鼠标移动测试")
    if not ak_running() and not ensure_ak_running(cfg, log):
        return {"ok": False, "code": last_failure()["code"], "message": "AK 未能启动", "target": None, "actual": None, "score": None, "diagnostic_path": last_failure()["diagnostic_path"]}
    if not _wait_ak_window(cfg, log, float(cfg.get("ak_window_timeout", 10))):
        return {"ok": False, "code": last_failure()["code"], "message": "未找到 AK 窗口", "target": None, "actual": None, "score": None, "diagnostic_path": last_failure()["diagnostic_path"]}
    found = find_visual(cfg, "accelerate")
    if not found:
        path = _diagnostic(cfg, "missing-accelerate-test")
        _set_failure("AK_TEMPLATE_NOT_FOUND", path)
        log.error("未找到红色“加速游戏”按钮；未移动鼠标")
        return {"ok": False, "code": "AK_TEMPLATE_NOT_FOUND", "message": "未识别到红色“加速游戏”按钮", "target": None, "actual": None, "score": None, "diagnostic_path": path}
    x, y, score = found
    moved = proc.move_mouse(x, y)
    raw_actual = proc.last_input_result().get("actual")
    actual = tuple(raw_actual) if isinstance(raw_actual, list) and len(raw_actual) == 2 else proc.get_cursor_pos()
    if not moved:
        path = _diagnostic(cfg, "mouse-move-test")
        _set_failure("AK_MOUSE_CONTROL_UNAVAILABLE", path)
        log.error("鼠标未移动到视觉目标；未执行点击")
        return {"ok": False, "code": "AK_MOUSE_CONTROL_UNAVAILABLE", "message": "鼠标未移动到按钮中心", "target": [x, y], "actual": list(actual), "score": score, "diagnostic_path": path}
    log.ok(f"鼠标已移动到按钮中心 ({x}, {y})，未执行点击")
    return {"ok": True, "code": None, "message": "鼠标已移动到按钮中心；未执行点击", "target": [x, y], "actual": list(actual), "score": score, "diagnostic_path": None}


def start_acceleration_for_ui(cfg: dict, log) -> dict:
    """Run the real AK-only start sequence; Steam and the game are never touched here."""
    ok = start_acceleration(cfg, log)
    failure = last_failure()
    messages = {
        **CAPTURE_FAILURE_MESSAGES,
        "MISSING_AK_PATH": "没有找到配置中的 AK.exe，请检查 AK 路径",
        "AK_START_FAILED": "Windows 未能启动 AK.exe，请检查路径或权限",
        "AK_WINDOW_TIMEOUT": "AK 启动后没有检测到窗口，请查看 AK 是否弹出更新或登录界面",
        "AK_VISION_UNAVAILABLE": "视觉识别依赖不可用",
        "AK_STATE_UNRECOGNIZED": "无法识别当前 AK 页面，未执行点击",
        "AK_TEMPLATE_NOT_FOUND": "没有识别到需要点击的 AK 按钮，未执行点击",
        "AK_MOUSE_CONTROL_UNAVAILABLE": "鼠标没有到达识别目标，未执行点击",
        "AK_CLICK_INJECTION_BLOCKED": "鼠标已到按钮，但 Windows 阻止了左键输入，请检查 AK 与启动台权限是否一致",
        "AK_STATE_CONFIRMATION_TIMEOUT": "点击后没有确认到小方形停止图标，加速未确认",
    }
    return {
        "ok": ok,
        "code": None if ok else failure["code"],
        "message": "已确认 AK 正在加速 APEX" if ok else messages.get(failure["code"], "AK 加速未完成，请查看步骤日志"),
        "state": ACCELERATING if ok else (UNKNOWN if failure["code"] in CAPTURE_FAILURE_MESSAGES else observe_state(cfg, log)),
        "diagnostic_path": None if ok else failure["diagnostic_path"],
    }


def pause_and_close_for_ui(cfg: dict, log) -> dict:
    """Run the real AK-only stop sequence; Steam and the game are never touched here."""
    ok = pause_and_close_ak(cfg, log)
    failure = last_failure()
    messages = {
        **CAPTURE_FAILURE_MESSAGES,
        "AK_CLOSE_FAILED": "会员计时已确认暂停，但 AK 窗口或后台进程未能退出",
        "AK_CLICK_INJECTION_BLOCKED": "鼠标已到按钮，但 Windows 阻止了左键输入，请检查 AK 与启动台权限是否一致",
        "AK_STATE_CONFIRMATION_TIMEOUT": "操作后没有确认到目标状态，已停止后续步骤",
    }
    return {
        "ok": ok,
        "code": None if ok else failure["code"],
        "message": "已确认会员计时暂停，AK 已关闭" if ok else messages.get(failure["code"], "AK 暂停或关闭未完成，请查看步骤日志"),
        "state": PAUSED if ok else (observe_state(cfg, log) if failure["code"] not in CAPTURE_FAILURE_MESSAGES and ak_running() else UNKNOWN),
        "diagnostic_path": None if ok else failure["diagnostic_path"],
    }


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


def _wait_state(cfg: dict, log, expected: str) -> bool:
    return _wait_any_state(cfg, log, (expected,)) == expected


def start_acceleration(cfg: dict, log) -> bool:
    log.step("AK 加速确认")
    if not ensure_ak_running(cfg, log):
        return False
    state = observe_state(cfg, log)
    if state == ACCELERATING:
        log.ok("已视觉确认 APEX 正在加速，跳过点击")
        return True
    # AK 的未加速页面会同时显示绿色“恢复”和红色“加速游戏”。
    # “恢复”仅用于停止流程的会员计时确认；启动统一从“加速游戏”进入，
    # 以随后出现的小方形停止图标作为唯一成功条件。
    if state not in (IDLE, PAUSED):
        return False
    if not _click_visual(cfg, "accelerate", log, uuid.uuid4().hex[:8]):
        return False
    if _wait_state(cfg, log, ACCELERATING):
        log.ok("已视觉确认 APEX 加速成功")
        return True
    return False


def pause_and_close_ak(cfg: dict, log) -> bool:
    log.step("AK 暂停并关闭")
    if not ak_running():
        log.info("AK 未运行，先打开界面确认会员计时状态")
    if not ensure_ak_running(cfg, log):
        return False
    state = observe_state(cfg, log)
    paused_confirmed = False
    if state == ACCELERATING:
        if not _click_visual(cfg, "pause", log, uuid.uuid4().hex[:8]):
            return False
        state = _wait_any_state(cfg, log, (IDLE, PAUSED))
        if state is None:
            return False
        paused_confirmed = state == PAUSED
    if state == IDLE:
        log.info("加速已停止，继续暂停会员计时")
        if not _click_visual(cfg, "member_pause", log, uuid.uuid4().hex[:8]):
            return False
        if not _wait_state(cfg, log, PAUSED):
            return False
    elif state != PAUSED:
        return False
    elif not paused_confirmed and not _wait_state(cfg, log, PAUSED):
        return False
    log.ok("已视觉确认会员计时暂停")
    install_dir = os.path.dirname(cfg.get("ak_path", "")) or None
    log.info("会员计时已暂停，直接强制结束 AK 及安装目录内后台进程")
    if not proc.kill_processes([AK_EXE, "AKPlatform.exe"], grace=5, install_dir=install_dir, graceful=False):
        _set_failure("AK_CLOSE_FAILED")
        log.error("AK 窗口或安装目录内的后台进程仍未退出")
        return False
    log.ok("AK 窗口和安装目录内的后台进程均已退出")
    return True


def capture_template(which: str, cfg: dict, log) -> bool:
    if which not in TEMPLATES or not HAVE_VISION:
        return False
    x, y = proc.get_cursor_pos()
    try:
        with mss.mss() as sct:
            shot = sct.grab({"left": max(0, x - 48), "top": max(0, y - 48), "width": 96, "height": 96})
            if not _write_image(template_path(which), cv2.cvtColor(np.array(shot), cv2.COLOR_BGRA2BGR)):
                raise OSError("模板图片写入失败")
        log.ok(f"已保存视觉模板 {template_path(which).name}")
        return True
    except Exception as exc:
        log.error(f"截图失败: {exc}")
        return False


def calibrated(cfg: dict, which: str) -> bool:
    return HAVE_VISION and _read_image(template_path(which), cv2.IMREAD_GRAYSCALE) is not None
