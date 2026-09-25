"""AK 视觉点击的重试与报错：瞬时失败要重试，确定性失败不许重试。

背景（2026-09-25 实测）：本机指针绝对定位会**偶发被系统拒绝**（`SetCursorPos` 返回 0、指针不动，
`mouse_event` 也压不动），而 pyautogui 不看返回值——于是旧实现只表现为「读回来的坐标对不上」，
一次校验不过就把整条流程停在「AK 暂停/关闭」那一步，后面的 Steam / 游戏步骤再也走不到。
旧启动器一直带 `ak_click_retries`（3 次 / 0.35s）这道重试，移植到这一版时丢了。
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.apex_launcher import ak, input_helper  # noqa: E402


class FakeProc:
    """只实现 _click_visual / 输入助手会碰到的那几个入口。"""

    def __init__(self, results, cursor=(5, 6)):
        self._results = list(results)
        self.calls = 0
        self.activated = 0
        self._cursor = cursor
        self._last: dict = {}

    def activate_window(self, *_args, **_kwargs):
        self.activated += 1
        return 123

    def click_at(self, x, y):
        index = min(self.calls, len(self._results) - 1)
        self._last = dict(self._results[index])
        self.calls += 1
        return bool(self._last.get("ok"))

    def last_input_result(self):
        return self._last

    def get_cursor_pos(self):
        return self._cursor


class FakeLog:
    def __init__(self):
        self.lines: list[str] = []

    def _add(self, level, message):
        self.lines.append(f"[{level}] {message}")

    def step(self, message): self._add("STEP", message)
    def info(self, message): self._add("INFO", message)
    def ok(self, message): self._add("OK", message)
    def warn(self, message): self._add("WARN", message)
    def error(self, message): self._add("ERROR", message)


# 输入助手三种返回形态
REJECTED = {"ok": False, "moved": False, "clicked": False, "actual": [5, 6],
            "reason": "pointer_move_rejected", "error": "POINTER_MOVE_REJECTED"}
DRIFTED = {"ok": False, "moved": False, "clicked": False, "actual": [5, 6], "driver": "none"}
BLOCKED = {"ok": False, "moved": True, "clicked": False, "actual": [100, 200]}
SUCCEEDED = {"ok": True, "moved": True, "clicked": True, "actual": [100, 200],
             "driver": "mouse_event+pyautogui.click"}


def _prepare(monkeypatch, proc, visual=(100, 200, 0.999)):
    monkeypatch.setattr(ak, "proc", proc)
    monkeypatch.setattr(ak, "_ak_process_ids", lambda cfg: set())
    monkeypatch.setattr(ak, "find_visual", lambda cfg, which: visual)
    monkeypatch.setattr(ak, "_diagnostic", lambda cfg, name: None)
    monkeypatch.setattr(ak, "_report_capture_failure", lambda log: False)
    monkeypatch.setattr(ak, "_record_timing", lambda *args, **kwargs: 0.0)
    return {"ak_click_retries": 3, "ak_click_interval": 0, "ak_action_cooldown": 0}


def test_transient_click_failure_is_retried_then_gives_up(monkeypatch):
    proc = FakeProc([REJECTED])
    cfg = _prepare(monkeypatch, proc)
    log = FakeLog()

    assert ak._click_visual(cfg, "accelerate", log, "abc12345") is False
    assert proc.calls == 3, "指针被拒是瞬时失败，必须按 ak_click_retries 重试满次数"
    assert ak.last_failure()["code"] == "AK_MOUSE_CONTROL_UNAVAILABLE"
    assert any("系统拒绝了指针绝对定位" in line for line in log.lines), "不能只报一个对不上的坐标"
    assert any("重试" in line for line in log.lines)


def test_transient_click_failure_recovers_on_retry(monkeypatch):
    proc = FakeProc([REJECTED, SUCCEEDED])
    cfg = _prepare(monkeypatch, proc)
    log = FakeLog()

    assert ak._click_visual(cfg, "accelerate", log, "abc12345") is True
    assert proc.calls == 2, "第二次就该成功，不该把三次重试都用完"


def test_click_injection_blocked_keeps_its_own_code(monkeypatch):
    proc = FakeProc([BLOCKED])
    cfg = _prepare(monkeypatch, proc)
    log = FakeLog()

    assert ak._click_visual(cfg, "accelerate", log, "abc12345") is False
    assert ak.last_failure()["code"] == "AK_CLICK_INJECTION_BLOCKED"
    assert any("未确认左键" in line for line in log.lines)


def test_template_not_found_is_not_retried(monkeypatch):
    proc = FakeProc([SUCCEEDED])
    cfg = _prepare(monkeypatch, proc, visual=None)
    log = FakeLog()

    assert ak._click_visual(cfg, "accelerate", log, "abc12345") is False
    assert proc.calls == 0, "模板都没找到，重试点击毫无意义"
    assert ak.last_failure()["code"] == "AK_TEMPLATE_NOT_FOUND"


def test_move_to_reports_rejection_instead_of_a_loose_coordinate(monkeypatch):
    monkeypatch.setattr(input_helper, "MOVE_SETTLE_SECONDS", 0)
    monkeypatch.setattr(input_helper, "RETRY_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(input_helper, "_cursor", lambda: (7, 8))
    monkeypatch.setattr(input_helper, "MOVERS", (("bad", lambda x, y: False),))

    actual, driver, trace = input_helper._move_to(100, 200, 2, 3)
    assert driver is None and actual == (7, 8)
    assert len(trace) == 3 and all(item["accepted"] is False for item in trace)


def test_move_to_falls_back_to_the_second_mechanism(monkeypatch):
    landed = {"cursor": (0, 0)}

    def bad(x, y):
        return False

    def good(x, y):
        landed["cursor"] = (x, y)
        return True

    monkeypatch.setattr(input_helper, "MOVE_SETTLE_SECONDS", 0)
    monkeypatch.setattr(input_helper, "RETRY_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(input_helper, "_cursor", lambda: landed["cursor"])
    monkeypatch.setattr(input_helper, "MOVERS", (("bad", bad), ("good", good)))

    actual, driver, trace = input_helper._move_to(100, 200, 2, 3)
    assert driver == "good" and actual == (100, 200)
    assert [item["driver"] for item in trace[:2]] == ["bad", "good"]
