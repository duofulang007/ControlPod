from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import Any
from urllib import error as url_error
from urllib import request as url_request


WORKER_PORT = 8766
WORKER_BASE = f"http://127.0.0.1:{WORKER_PORT}"


class LauncherError(RuntimeError):
    pass


def write_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"{message}\n")


def write_result(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")


def console_backend_dir() -> Path:
    return Path(__file__).resolve().parents[2]


def request_json(path: str, method: str = "GET", timeout: float = 10.0) -> dict[str, Any]:
    request = url_request.Request(f"{WORKER_BASE}{path}", data=b"" if method == "POST" else None, method=method)
    try:
        with url_request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8-sig"))
    except (OSError, url_error.URLError, url_error.HTTPError, json.JSONDecodeError) as exc:
        raise LauncherError(f"APEX 内置工作进程请求失败：{exc}") from exc
    if not isinstance(payload, dict):
        raise LauncherError("APEX 内置工作进程返回了无效结果")
    return payload


def worker_healthy() -> bool:
    try:
        return request_json("/health", timeout=1).get("service") == "apex-console-worker"
    except LauncherError:
        return False


def worker_port_occupied() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex(("127.0.0.1", WORKER_PORT)) == 0


def ensure_worker(log_path: Path) -> None:
    if worker_healthy():
        return
    if worker_port_occupied():
        raise LauncherError("8766 端口被未知服务占用，未对其执行任何操作")
    backend_dir = console_backend_dir()
    data_dir = backend_dir / "data"
    logs_dir = data_dir / "apex-worker"
    logs_dir.mkdir(parents=True, exist_ok=True)
    stdout_path, stderr_path = logs_dir / "worker.out.log", logs_dir / "worker.err.log"
    creationflags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    with stdout_path.open("ab") as stdout, stderr_path.open("ab") as stderr:
        process = subprocess.Popen(
            [sys.executable, str(backend_dir / "apex_worker.py"), "--data-dir", str(data_dir)],
            cwd=str(backend_dir), stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
            creationflags=creationflags,
        )
    write_log(log_path, f"[INFO] 已启动内置 APEX 工作进程 PID {process.pid}")
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise LauncherError(f"APEX 内置工作进程提前退出，退出码 {process.returncode}")
        if worker_healthy():
            return
        time.sleep(0.25)
    raise LauncherError("APEX 内置工作进程未在限定时间内就绪")


def current_process_is_elevated() -> bool:
    return os.name == "nt" and bool(ctypes.windll.shell32.IsUserAnAdmin())


class ShellExecuteInfo(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD), ("fMask", wintypes.ULONG), ("hwnd", wintypes.HWND),
        ("lpVerb", wintypes.LPCWSTR), ("lpFile", wintypes.LPCWSTR),
        ("lpParameters", wintypes.LPCWSTR), ("lpDirectory", wintypes.LPCWSTR),
        ("nShow", ctypes.c_int), ("hInstApp", wintypes.HINSTANCE), ("lpIDList", ctypes.c_void_p),
        ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
        ("dwHotKey", wintypes.DWORD), ("hIconOrMonitor", wintypes.HANDLE),
        ("hProcess", wintypes.HANDLE),
    ]


def run_elevated(arguments: list[str]) -> int:
    if os.name != "nt":
        raise LauncherError("APEX 一键启动仅支持 Windows")
    execute = ShellExecuteInfo()
    execute.cbSize = ctypes.sizeof(execute)
    execute.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    execute.lpVerb = "runas"
    execute.lpFile = sys.executable
    execute.lpParameters = subprocess.list2cmdline([str(Path(__file__).resolve()), *arguments])
    execute.lpDirectory = str(Path(__file__).parent)
    execute.nShow = 0
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(execute)) or not execute.hProcess:
        raise LauncherError("未获得管理员权限，APEX 操作未执行")
    try:
        ctypes.windll.kernel32.WaitForSingleObject(execute.hProcess, 0xFFFFFFFF)
        exit_code = wintypes.DWORD()
        if not ctypes.windll.kernel32.GetExitCodeProcess(execute.hProcess, ctypes.byref(exit_code)):
            raise ctypes.WinError()
        return int(exit_code.value)
    finally:
        ctypes.windll.kernel32.CloseHandle(execute.hProcess)


def execute_action(action: str, log_path: Path) -> dict[str, Any]:
    ensure_worker(log_path)
    labels = {"run": "启动", "stop": "关闭", "restart": "重启"}
    write_log(log_path, f"[STEP] APEX 一键{labels[action]}")
    started = request_json(f"/actions/{action}", method="POST", timeout=20)
    target = "stopped" if action == "stop" else "running"
    if started.get("state") == target:
        return started
    revision = started.get("revision")
    if not isinstance(revision, int):
        raise LauncherError("APEX 工作进程未返回有效动作版本")
    settled = request_json(f"/wait?target={target}&revision={revision}", timeout=180)
    if settled.get("state") != target:
        raise LauncherError(str(settled.get("last_error") or settled.get("error_code") or "APEX 动作未完成"))
    return settled


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("run", "stop", "restart"), required=True)
    parser.add_argument("--result-path", type=Path, required=True)
    parser.add_argument("--log-path", type=Path, required=True)
    parser.add_argument("--elevated-child", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if not current_process_is_elevated():
            child_args = [item for item in (argv if argv is not None else sys.argv[1:]) if item != "--elevated-child"]
            child_args.append("--elevated-child")
            return run_elevated(child_args)
        status = execute_action(args.action, args.log_path)
        write_log(args.log_path, f"[OK] APEX 一键{args.action}完成")
        write_result(args.result_path, {"ok": True, "action": args.action, "status": status})
        return 0
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        write_log(args.log_path, f"[ERROR] {message}")
        write_result(args.result_path, {"ok": False, "error": message})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
