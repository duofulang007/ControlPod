# -*- coding: utf-8 -*-
"""Steam smart-start and graceful shutdown."""
import os
import time

from . import processes as proc

STEAM_CLOSE_PROCESSES = ("steam.exe", "steamservice.exe", "steamwebhelper.exe")


def steam_running() -> bool:
    """True while any Steam process (client, service, or CEF helper) is alive."""
    return proc.any_process_running(STEAM_CLOSE_PROCESSES)


def ensure_steam_running(cfg: dict, log) -> bool:
    log.step("Steam 检查")
    if proc.is_process_running("steam.exe"):
        log.info("Steam 已在运行，跳过启动")
        return True
    steam = cfg.get("steam_path", "")
    if not steam or not os.path.exists(steam):
        log.error(f"未找到 Steam: {steam}，请在设置中修改路径")
        return False
    log.info(f"启动 Steam: {steam}")
    proc.start_process(steam)
    timeout = int(cfg.get("wait_steam_after_launch", 6))
    if proc.wait_window("Steam", timeout):
        log.ok("Steam 窗口已出现")
        return True
    if proc.is_process_running("steam.exe"):
        log.ok("Steam 进程已出现")
        return True
    log.warn("Steam 未在限定时间内出现，继续后续步骤")
    return True



def force_close_steam(cfg: dict, log) -> bool:
    """Force-kill Steam outright (no -shutdown handshake) and verify it is gone.

    The kill covers steam.exe, its service, and the steamwebhelper CEF
    children: killing only steam.exe leaves helpers holding the Steam window
    and tray icon alive, which is not a real exit.
    """
    started = time.monotonic()
    log.step("Steam 强制结束")
    if not steam_running():
        log.info("Steam 未在运行，跳过")
        return True
    kill_started = time.monotonic()
    proc.kill_processes(STEAM_CLOSE_PROCESSES, grace=1, graceful=False)
    log.info(f"Steam 强杀已发出，耗时 {time.monotonic() - kill_started:.2f}s")
    deadline = time.monotonic() + max(
        0.0, float(cfg.get("steam_force_close_timeout", 6.0))
    )
    poll_interval = max(0.02, float(cfg.get("steam_force_close_poll_interval", 0.05)))
    settle = max(0.0, float(cfg.get("steam_force_close_settle", 0.4)))
    gone_since = None
    while True:
        if steam_running():
            gone_since = None
        elif gone_since is None:
            gone_since = time.monotonic()
        elif time.monotonic() - gone_since >= settle:
            log.ok(f"Steam 已强制关闭，耗时 {time.monotonic() - started:.2f}s")
            return True
        if time.monotonic() >= deadline:
            break
        time.sleep(poll_interval)
    log.error("Steam 仍未能关闭")
    return False
