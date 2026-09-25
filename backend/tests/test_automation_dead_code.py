"""一键启动/关闭链路里的死代码不得回潮（2026-09-25 清扫）。

背景：这条链路早已改走 `ak_automation`（`dispatch_ak_for_launcher` /
`stop_ak_for_launcher`）与 `apex.start_game` / `wait_game_active` /
`force_close_game`、`steam.ensure_steam_running` / `force_close_steam`。
被删掉的那批函数只服务于已下线的旧 GUI（`*_for_ui`、`test_mouse_move`）或已被
强制结束版取代（`close_game`、`close_steam`），全仓零调用 —— 静态引用计数与
`service.py` 的实际调用点都已核对过。这里按裸名字扫源码，谁把它们加回来就红。
"""

from __future__ import annotations

import re
from pathlib import Path

LAUNCHER = Path(__file__).resolve().parents[1] / "app" / "apex_launcher"

# 文件 → 已彻底移除的名字（裸名字匹配：定义、调用、字符串引用都算回潮）
REMOVED: dict[str, list[str]] = {
    "ak.py": [
        "AUTOMATION_REVISION",
        "test_mouse_move",
        "start_acceleration_for_ui",
        "pause_and_close_for_ui",
        "capture_template",
        "ensure_ak_running",
        "start_acceleration",
        "pause_and_close_ak",
        "_wait_ak_window",
        "_wait_ak_handle",
        "_find_ak_window",
        "_wait_state",
    ],
    "apex.py": ["launch_game", "close_game"],
    "config.py": ["save_config"],
    "processes.py": [
        "_set_cursor_pos",
        "move_mouse",
        "click_left",
        "_send_mouse_input",
        "_MouseInput",
        "_InputUnion",
        "_Input",
    ],
    "steam.py": ["close_steam"],
}


def test_removed_automation_helpers_stay_removed() -> None:
    leftovers: list[str] = []
    for filename, names in REMOVED.items():
        source = (LAUNCHER / filename).read_text(encoding="utf-8")
        for name in names:
            if re.search(rf"(?<![\w.]){re.escape(name)}(?![\w])", source):
                leftovers.append(f"{filename}:{name}")
    assert leftovers == []


def test_live_automation_entrypoints_survive() -> None:
    """负向断言的对照面：清扫不能过头 —— 活链路依赖的入口必须还在。"""
    ak = (LAUNCHER / "ak.py").read_text(encoding="utf-8")
    service = (LAUNCHER / "service.py").read_text(encoding="utf-8")

    assert "def observe_state(" in ak
    assert "def _wait_any_state(" in ak
    assert "def _click_visual(" in ak
    assert "def calibrated(" in ak
    assert "def find_visual(" in ak

    for call in (
        "ak_module.calibrated(cfg",
        "ak_module.ak_running()",
        "ak_module.last_failure()",
        "apex_module.start_game(cfg, log)",
        "apex_module.wait_game_active(cfg, log",
        "apex_module.force_close_game(cfg, log)",
        "steam_module.ensure_steam_running(cfg, log)",
        "steam_module.force_close_steam(cfg, log)",
    ):
        assert call in service, call
