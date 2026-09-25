# -*- coding: utf-8 -*-
"""APEX game launch and graceful close."""
import os
import subprocess
import time

from . import processes as proc

GAME_PROCESSES = ["r5apex.exe", "r5apex_dx12.exe"]
GAME_WINDOW = "Apex Legends"


def game_running() -> bool:
    return any(proc.is_process_running(name) for name in GAME_PROCESSES)


def game_window_visible() -> bool:
    return proc.find_window(GAME_WINDOW) is not None


def game_active() -> bool:
    return game_running() or game_window_visible()


def game_exe(cfg: dict) -> str:
    steam = cfg.get("steam_path", "")
    if not steam:
        return ""
    steam_dir = os.path.dirname(steam)
    dx12 = os.path.join(steam_dir, "steamapps", "common", "Apex Legends", "r5apex_dx12.exe")
    if os.path.exists(dx12):
        return dx12
    legacy = os.path.join(steam_dir, "steamapps", "common", "Apex Legends", "r5apex.exe")
    if os.path.exists(legacy):
        return legacy
    return ""


def start_game(cfg: dict, log) -> bool:
    """Launch the game process without waiting for it to finish loading."""
    if game_active():
        log.info("游戏已在运行，跳过启动")
        return True
    steam = cfg.get("steam_path", "")
    if not steam or not os.path.exists(steam):
        log.error(f"未找到 Steam: {steam}，请在设置中配置 Steam 路径")
        return False
    exe = game_exe(cfg)
    if not exe:
        log.error("未找到游戏可执行文件，请检查 Steam 库路径")
        return False
    log.info(f"直接启动游戏: {exe}")
    subprocess.Popen(
        [exe],
        cwd=os.path.dirname(exe),
        creationflags=subprocess.CREATE_NO_WINDOW if proc.is_windows() else 0,
    )
    return True


def wait_game_active(cfg: dict, log, cancel_flag=None) -> bool:
    """Wait until the game process/window appears."""
    started = time.monotonic()
    timeout = int(cfg.get("wait_game_process", 300))
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cancel_flag and cancel_flag.is_set():
            log.info("启动已取消")
            return False
        if game_active():
            log.ok(f"游戏进程/窗口已出现，耗时 {time.monotonic() - started:.2f}s")
            return True
        time.sleep(max(0.05, float(cfg.get("game_process_poll_interval", 0.25))))
    log.warn("等待游戏进程超时（可能仍在加载）")
    return False




def force_close_game(cfg: dict, log) -> bool:
    """Force-kill the game outright and verify both process and window are gone.

    No graceful WM_CLOSE handshake: the game is killed immediately, then the
    absence of the process *and* its window is confirmed before success is
    reported, so "already exited" is still a real verified result.

    Apex hands off to its anti-cheat bootstrap right after launch, so a single
    kill can be followed by a freshly spawned process. The kill is therefore
    retried inside the same bounded timeout until the game stays gone for a
    short continuous window, and every attempt is timed.
    """
    started = time.monotonic()
    log.step("游戏强制结束")
    if not game_active():
        log.info("游戏未在运行，跳过")
        return True
    timeout = max(0.0, float(cfg.get("game_force_close_timeout", 6.0)))
    poll_interval = max(0.02, float(cfg.get("game_force_close_poll_interval", 0.05)))
    settle = max(0.0, float(cfg.get("game_force_close_settle", 0.4)))
    deadline = time.monotonic() + timeout
    attempts = 0
    while True:
        attempts += 1
        kill_started = time.monotonic()
        proc.kill_processes(GAME_PROCESSES, grace=1, graceful=False)
        log.info(
            f"第 {attempts} 次强杀已发出，耗时 {time.monotonic() - kill_started:.2f}s"
        )
        gone_since = None
        while True:
            if game_active():
                if gone_since is not None:
                    gone_since = None
                    break
            elif gone_since is None:
                gone_since = time.monotonic()
            elif time.monotonic() - gone_since >= settle:
                log.ok(
                    f"游戏已强制结束，耗时 {time.monotonic() - started:.2f}s"
                    f"（强杀 {attempts} 次）"
                )
                return True
            if time.monotonic() >= deadline:
                break
            time.sleep(poll_interval)
        if time.monotonic() >= deadline:
            break
        log.warn("检测到游戏进程重新出现（反作弊接管），立即再次强杀")
    log.error(f"游戏进程或窗口仍存在（已强杀 {attempts} 次）")
    return False
