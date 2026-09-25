# -*- coding: utf-8 -*-
"""Short-lived input helper：把指针挪到目标、确认到位、再在目标上点击。

为什么不能简单写成「pyautogui.click(x, y) + 回读 ±2px 校验」——2026-09-25 实测：
本机 `SetCursorPos` 会**偶发被系统拒绝**（返回 0，指针纹丝不动），而 pyautogui 根本不看
`SetCursorPos` 的返回值，于是唯一的现象就是回读坐标对不上。旧启动器（reference）的
`click_at` 是 `move_mouse → sleep(0.15) → click_left()`，它**从不校验**，所以撞上同一个拒绝
也照样往下走；新版一次校验不过就把「鼠标没到目标」写进失败码，整条流程停在第一步。

所以这里按实测结论写：
- 两套绝对移动轮流试，每次移动后回读指针校验：
  `mouse_event(MOVE|ABSOLUTE)`（旧脚本写过的回退路径）与 `SetCursorPos`；
- 默认最多 6 轮、每轮之间短暂停，只为了熬过瞬时拒绝；
- **确认指针在目标上才点击**，点击用 `pyautogui.click()`（旧脚本验证过的原地点击）；
- 把真实原因写进 JSON：指针压根没被挪动是 `pointer_move_rejected`（附两套机制的每次返回值），
  而不是只丢一个对不上的坐标让人去猜。
"""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import time

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000

DEFAULT_ATTEMPTS = 6
DEFAULT_TOLERANCE = 2
MOVE_SETTLE_SECONDS = 0.05
RETRY_INTERVAL_SECONDS = 0.12


def _user32():
    return ctypes.windll.user32


def _cursor() -> tuple[int, int]:
    point = wintypes.POINT()
    _user32().GetCursorPos(ctypes.byref(point))
    return int(point.x), int(point.y)


def _move_by_mouse_event(x: int, y: int) -> bool:
    """旧脚本的回退路径：mouse_event 绝对坐标移动。"""
    user32 = _user32()
    width = max(1, int(user32.GetSystemMetrics(0)) - 1)
    height = max(1, int(user32.GetSystemMetrics(1)) - 1)
    user32.mouse_event(
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
        int(x * 65535 / width),
        int(y * 65535 / height),
        0,
        0,
    )
    return True


def _move_by_set_cursor_pos(x: int, y: int) -> bool:
    """返回值必须看：被系统拒绝时它返回 0，而 pyautogui 会把 0 丢掉。"""
    return bool(_user32().SetCursorPos(int(x), int(y)))


MOVERS = (
    ("mouse_event", _move_by_mouse_event),
    ("SetCursorPos", _move_by_set_cursor_pos),
)


def _move_to(x: int, y: int, tolerance: int, attempts: int) -> tuple[tuple[int, int], str | None, list[dict]]:
    """移动到 (x, y) 并确认到位，返回 (实际坐标, 成功使用的驱动或 None, 每次尝试的轨迹)。"""
    trace: list[dict] = []
    for attempt in range(1, attempts + 1):
        for name, mover in MOVERS:
            try:
                accepted = bool(mover(x, y))
            except Exception as exc:                      # noqa: BLE001 - 逐个机制兜底，不让一个机制炸掉整轮
                trace.append({"attempt": attempt, "driver": name, "accepted": False,
                              "error": type(exc).__name__})
                continue
            time.sleep(MOVE_SETTLE_SECONDS)
            actual = _cursor()
            trace.append({"attempt": attempt, "driver": name, "accepted": accepted,
                          "actual": [actual[0], actual[1]]})
            if abs(actual[0] - x) <= tolerance and abs(actual[1] - y) <= tolerance:
                return actual, name, trace
        time.sleep(RETRY_INTERVAL_SECONDS)
    return _cursor(), None, trace


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--x", required=True, type=int)
    parser.add_argument("--y", required=True, type=int)
    parser.add_argument("--click", action="store_true")
    parser.add_argument("--attempts", type=int, default=DEFAULT_ATTEMPTS)
    parser.add_argument("--tolerance", type=int, default=DEFAULT_TOLERANCE)
    args = parser.parse_args(argv)

    target = (int(args.x), int(args.y))
    result: dict = {
        "ok": False,
        "moved": False,
        "clicked": False,
        "actual": None,
        "target": [target[0], target[1]],
        "driver": "none",
    }
    try:
        actual, driver, trace = _move_to(target[0], target[1], int(args.tolerance),
                                         max(1, int(args.attempts)))
        result["actual"] = [actual[0], actual[1]]
        result["moves"] = trace
        result["moved"] = driver is not None
        if driver is None:
            # 指针压根没被挪动：系统/会话层面拒绝了绝对定位，不是「鼠标偏了一点」。
            result["driver"] = "none"
            result["reason"] = "pointer_move_rejected"
            result["error"] = "POINTER_MOVE_REJECTED"
        else:
            result["driver"] = driver
            if args.click:
                import pyautogui
                pyautogui.click()          # 指针已在目标上，原地点击（reference 的 click_left）
                result["clicked"] = True
                result["driver"] = f"{driver}+pyautogui.click"
        result["ok"] = bool(result["moved"] and (result["clicked"] if args.click else True))
    except Exception as exc:                # noqa: BLE001 - 任何异常都要变成可读 JSON，不能吞成空结果
        result["error"] = type(exc).__name__
        result["error_detail"] = str(exc)[:200]
    print(json.dumps(result))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
