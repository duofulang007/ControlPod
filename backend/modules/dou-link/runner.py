"""APEX 总控台的 DouLink 执行模块。只调用项目现有的启停入口。"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import psutil


def args_from_cli() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("run", "stop"), required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--result-path", type=Path, required=True)
    parser.add_argument("--log-path", type=Path, required=True)
    return parser.parse_args()


def write_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(message + "\n")


def write_result(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def session_id(pid: int) -> int | None:
    api = ctypes.windll.kernel32.ProcessIdToSessionId
    api.argtypes = [wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    api.restype = wintypes.BOOL
    value = wintypes.DWORD()
    if not api(pid, ctypes.byref(value)):
        return None
    return value.value


def listener_pid(exe: Path) -> int | None:
    expected = os.path.normcase(str(exe.resolve()))
    current_session = session_id(os.getpid())
    for process in psutil.process_iter(["pid", "exe"]):
        try:
            path = process.info["exe"]
            if path and os.path.normcase(os.path.abspath(path)) == expected:
                if session_id(process.info["pid"]) == current_session:
                    return process.info["pid"]
        except (psutil.NoSuchProcess, psutil.AccessDenied, OSError):
            continue
    return None


def listener_ready() -> bool:
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenEventW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.OpenEventW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenEventW(0x00100000, False, "Local\\DouLink.Stop")
    if not handle:
        return False
    kernel32.CloseHandle(handle)
    return True


def wait_for_state(exe: Path, running: bool, seconds: float) -> int | None:
    deadline = time.monotonic() + seconds
    while True:
        pid = listener_pid(exe)
        if ((pid is not None and listener_ready()) if running else pid is None):
            return pid
        if time.monotonic() >= deadline:
            raise RuntimeError("DouLink 未能启动" if running else "DouLink 未能停止")
        time.sleep(0.1)


def run_script(root: Path, name: str) -> None:
    script = root / name
    if not script.is_file():
        raise FileNotFoundError(f"缺少项目入口：{script}")
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(script)],
        cwd=root,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=75,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(detail or f"{name} 退出码 {result.returncode}")


def main() -> int:
    args = args_from_cli()
    root = args.root.resolve()
    exe = root / "publish" / "DouLink.exe"
    try:
        if not root.is_dir():
            raise FileNotFoundError(f"DouLink 项目目录不存在：{root}")
        if args.action == "run":
            pid = listener_pid(exe)
            if pid is None or not listener_ready():
                write_log(args.log_path, "[STEP] 启动 DouLink 剪贴板监听")
                run_script(root, "start.ps1")
                pid = wait_for_state(exe, True, 5)
            else:
                write_log(args.log_path, f"[INFO] 复用已运行的 DouLink 进程 {pid}")
            write_result(args.result_path, {"ok": True, "status": {"state": "running", "pid": pid}})
            write_log(args.log_path, f"[OK] DouLink 正在运行，PID {pid}")
        else:
            pid = listener_pid(exe)
            if pid is not None:
                write_log(args.log_path, f"[STEP] 停止 DouLink 进程 {pid}")
                run_script(root, "stop.ps1")
                wait_for_state(exe, False, 5)
            write_result(args.result_path, {"ok": True, "status": {"state": "stopped"}})
            write_log(args.log_path, "[OK] DouLink 已停止")
        return 0
    except Exception as error:
        message = str(error) or type(error).__name__
        write_log(args.log_path, f"[ERROR] {message}")
        write_result(args.result_path, {"ok": False, "error": message})
        return 1


if __name__ == "__main__":
    sys.exit(main())
