# -*- coding: utf-8 -*-
"""Portable config for the real one-click APEX launcher."""
import json
import os
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
SHIPPED_TEMPLATES = PACKAGE_ROOT / "resources" / "templates"

DEFAULT_CONFIG = {
    "steam_path": r"D:\steam\steam.exe",
    "ak_path": r"D:\AKPlatform\AK.exe",
    "game_appid": 1172470,
    "steam_close_wait": 2.0,
    "steam_close_poll_interval": 0.1,
    "ak_control": "vision",
    "ak_vision_threshold": 0.92,
    "ak_vision_scales": [0.85, 0.92, 1.0, 1.08, 1.15],
    "ak_visual_regions": {
        "accelerate": [0.18, 0.40, 0.47, 0.28],
        "pause": [0.18, 0.40, 0.47, 0.28],
        "member_pause": [0.76, 0.66, 0.21, 0.20],
        "paused_text": [0.76, 0.66, 0.21, 0.20],
    },
    "ak_visual_full_fallback": True,
    "ak_state_timeout": 30,
    "ak_accelerate_timeout": 18,
    "ak_stop_timeout": 10,
    "ak_membership_pause_timeout": 10,
    "ak_membership_pause_attempts": 3,
    "ak_membership_pause_retry_interval": 1.5,
    "ak_membership_pause_settle": 1.2,
    "ak_membership_pause_confirm": 2.5,
    "ak_static_verify_timeout": 3,
    "ak_state_poll_interval": 0.05,
    "ak_stable_samples": 2,
    "ak_action_cooldown": 0.05,
    # 点击重试：旧启动器（core/config.py）里就是这两个值，移植时丢了。
    # 视觉点击撞上系统对指针定位的瞬时拒绝（实测 SetCursorPos 会返回 0）时，
    # 重新定位再点一次，而不是一次抖动就中断整条流程。
    "ak_click_retries": 3,
    "ak_click_interval": 0.35,
    "wait_steam_after_launch": 6,
    "wait_game_process": 120,
    "game_process_poll_interval": 0.25,
    "ak_start_timeout": 12,
    "ak_window_timeout": 3,
    "ak_page_settle_seconds": 0.1,
    "game_close_grace": 2.0,
    "game_close_poll_interval": 0.1,
    "ak_state_settle_timeout": 5.0,
    "game_force_close_timeout": 6.0,
    "game_force_close_poll_interval": 0.05,
    "game_force_close_settle": 0.4,
    "steam_force_close_timeout": 6.0,
    "steam_force_close_poll_interval": 0.05,
    "steam_force_close_settle": 0.4,
}


def data_root() -> Path:
    env_root = os.environ.get("APEX_DATA_DIR")
    if env_root:
        root = Path(env_root)
    else:
        root = PACKAGE_ROOT.parents[1] / "data"
    root.mkdir(parents=True, exist_ok=True)
    return root


def launcher_dir() -> Path:
    path = data_root() / "apex_launcher"
    path.mkdir(parents=True, exist_ok=True)
    return path


def config_path() -> Path:
    return launcher_dir() / "config.json"


def templates_dir() -> Path:
    path = launcher_dir() / "templates"
    path.mkdir(parents=True, exist_ok=True)
    return path


def template_path(which: str) -> Path:
    name = f"{which}.png"
    target = templates_dir() / name
    if not target.exists():
        source = SHIPPED_TEMPLATES / name
        if source.exists():
            target.write_bytes(source.read_bytes())
    return target


def load_config() -> dict:
    cfg = {key: value for key, value in DEFAULT_CONFIG.items()}
    path = config_path()
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                cfg.update(data)
        except Exception:
            pass
    # Coordinate automation was retired. Ignore stale runtime config values.
    cfg["ak_control"] = "vision"
    return cfg

