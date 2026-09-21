from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any
from urllib import error as url_error
from urllib import request as url_request


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
SITE_URL = "http://127.0.0.1:8765"
HEALTH_URL = f"{SITE_URL}/api/health"
PORT = 8765
STAMP_PATH = DATA_DIR / "console-source.stamp"
PID_PATH = DATA_DIR / "apex-console.pid"
LOG_PATH = DATA_DIR / "console-launcher.log"
STDOUT_PATH = DATA_DIR / "console-service.out.log"
STDERR_PATH = DATA_DIR / "console-service.err.log"
MUTEX_NAME = "Local\\ApexConsoleOneClickLauncher"


class ConsoleLaunchError(RuntimeError):
    pass


class ElevationRequired(ConsoleLaunchError):
    pass


class ShellExecuteInfo(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("fMask", wintypes.ULONG),
        ("hwnd", wintypes.HWND),
        ("lpVerb", wintypes.LPCWSTR),
        ("lpFile", wintypes.LPCWSTR),
        ("lpParameters", wintypes.LPCWSTR),
        ("lpDirectory", wintypes.LPCWSTR),
        ("nShow", ctypes.c_int),
        ("hInstApp", wintypes.HINSTANCE),
        ("lpIDList", ctypes.c_void_p),
        ("lpClass", wintypes.LPCWSTR),
        ("hkeyClass", wintypes.HKEY),
        ("dwHotKey", wintypes.DWORD),
        ("hIconOrMonitor", wintypes.HANDLE),
        ("hProcess", wintypes.HANDLE),
    ]


def write_log(message: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"[{stamp}] {message}\n")


def read_health(timeout: float = 1.0) -> dict[str, Any] | None:
    try:
        with url_request.urlopen(HEALTH_URL, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8-sig"))
    except (OSError, url_error.URLError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def is_console_health(payload: dict[str, Any] | None) -> bool:
    return bool(
        payload
        and payload.get("status") == "ok"
        and payload.get("service") == "apex-console"
    )


def parse_netstat_listener(output: str, port: int = PORT) -> int | None:
    suffix = f":{port}"
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        if not parts[1].endswith(suffix) or parts[3].upper() != "LISTENING":
            continue
        if parts[-1].isdigit():
            return int(parts[-1])
    return None


def listener_pid(port: int = PORT) -> int | None:
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        capture_output=True,
        text=True,
        errors="replace",
        timeout=5,
        creationflags=creationflags,
        check=False,
    )
    if result.returncode != 0:
        raise ConsoleLaunchError("无法读取本机端口状态")
    return parse_netstat_listener(result.stdout, port)


def source_files() -> list[Path]:
    files = [
        PROJECT_DIR / "index.html",
        PROJECT_DIR / "styles.css",
        PROJECT_DIR / "app.js",
        BACKEND_DIR / "requirements.txt",
        BACKEND_DIR / "bootstrap.ps1",
        BACKEND_DIR / "start.ps1",
        Path(__file__).resolve(),
    ]
    for folder in (BACKEND_DIR / "app", BACKEND_DIR / "modules"):
        for pattern in ("*.py", "*.json"):
            files.extend(folder.rglob(pattern))
    return sorted({path.resolve() for path in files if path.is_file()})


def source_fingerprint() -> str:
    digest = hashlib.sha256()
    for path in source_files():
        digest.update(str(path.relative_to(PROJECT_DIR)).replace("\\", "/").encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def read_saved_fingerprint() -> str:
    try:
        return STAMP_PATH.read_text(encoding="ascii").strip()
    except OSError:
        return ""


def plan_launch(
    health: dict[str, Any] | None,
    owner_pid: int | None,
    saved_fingerprint: str,
    current_fingerprint: str,
) -> str:
    ours = is_console_health(health)
    if owner_pid is None:
        if ours:
            raise ConsoleLaunchError("网站已响应，但无法确认它的进程；没有执行重启")
        return "start"
    if not ours:
        raise ConsoleLaunchError("端口 8765 已被其他程序占用；没有结束任何进程")
    return "open" if saved_fingerprint == current_fingerprint else "restart"


def current_process_is_elevated() -> bool:
    return os.name == "nt" and bool(ctypes.windll.shell32.IsUserAnAdmin())


def can_terminate_process(pid: int) -> bool:
    if os.name != "nt":
        return True
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenProcess(0x0001, False, pid)  # PROCESS_TERMINATE
    if not handle:
        return False
    kernel32.CloseHandle(handle)
    return True


def run_elevated(arguments: list[str]) -> int:
    if os.name != "nt":
        raise ConsoleLaunchError("管理员权限申请只支持 Windows")
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    execute = ShellExecuteInfo()
    execute.cbSize = ctypes.sizeof(execute)
    execute.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    execute.lpVerb = "runas"
    execute.lpFile = sys.executable
    execute.lpParameters = subprocess.list2cmdline([str(Path(__file__).resolve()), *arguments])
    execute.lpDirectory = str(BACKEND_DIR)
    execute.nShow = 0
    shell32.ShellExecuteExW.argtypes = (ctypes.POINTER(ShellExecuteInfo),)
    shell32.ShellExecuteExW.restype = wintypes.BOOL
    kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.GetExitCodeProcess.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
    kernel32.GetExitCodeProcess.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    if not shell32.ShellExecuteExW(ctypes.byref(execute)):
        raise ctypes.WinError(ctypes.get_last_error())
    if not execute.hProcess:
        raise ConsoleLaunchError("管理员启动没有返回进程句柄")
    try:
        kernel32.WaitForSingleObject(execute.hProcess, 0xFFFFFFFF)
        exit_code = wintypes.DWORD()
        if not kernel32.GetExitCodeProcess(execute.hProcess, ctypes.byref(exit_code)):
            raise ctypes.WinError(ctypes.get_last_error())
        return int(exit_code.value)
    finally:
        kernel32.CloseHandle(execute.hProcess)


def terminate_process(pid: int) -> None:
    if os.name != "nt":
        raise ConsoleLaunchError("进程重启只支持 Windows")
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.TerminateProcess.argtypes = (wintypes.HANDLE, wintypes.UINT)
    kernel32.TerminateProcess.restype = wintypes.BOOL
    kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenProcess(0x00100001, False, pid)  # SYNCHRONIZE | PROCESS_TERMINATE
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if not kernel32.TerminateProcess(handle, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        kernel32.WaitForSingleObject(handle, 8000)
    finally:
        kernel32.CloseHandle(handle)


def stop_console(owner_pid: int) -> None:
    try:
        terminate_process(owner_pid)
    except OSError as exc:
        raise ConsoleLaunchError(f"无法关闭旧版总控台：{exc}") from exc
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if listener_pid() is None:
            return
        time.sleep(0.25)
    raise ConsoleLaunchError("旧版总控台没有在 8 秒内关闭")


def start_console() -> subprocess.Popen[bytes]:
    python = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
    if not python.is_file():
        raise ConsoleLaunchError("后端环境不存在，请先运行 backend\\bootstrap.ps1")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    stdout_handle = STDOUT_PATH.open("ab")
    stderr_handle = STDERR_PATH.open("ab")
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    try:
        process = subprocess.Popen(
            [
                str(python),
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(PORT),
            ],
            cwd=str(BACKEND_DIR),
            stdin=subprocess.DEVNULL,
            stdout=stdout_handle,
            stderr=stderr_handle,
            creationflags=creationflags,
            close_fds=True,
        )
    finally:
        stdout_handle.close()
        stderr_handle.close()
    PID_PATH.write_text(str(process.pid), encoding="ascii", newline="\n")
    return process


def wait_until_ready(process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise ConsoleLaunchError(f"总控台启动失败，退出码 {exit_code}")
        if is_console_health(read_health()):
            return
        time.sleep(0.3)
    raise ConsoleLaunchError("总控台没有在 20 秒内准备完成")


def find_app_browser() -> Path | None:
    if os.name != "nt":
        return None
    roots = [
        (os.environ.get("ProgramFiles(x86)"), "Microsoft/Edge/Application/msedge.exe"),
        (os.environ.get("ProgramFiles"), "Microsoft/Edge/Application/msedge.exe"),
        (os.environ.get("ProgramFiles"), "Google/Chrome/Application/chrome.exe"),
        (os.environ.get("LOCALAPPDATA"), "Google/Chrome/Application/chrome.exe"),
    ]
    for base, relative in roots:
        if not base:
            continue
        candidate = Path(base) / Path(relative)
        if candidate.is_file():
            return candidate
    return None


def open_site(fingerprint: str) -> None:
    url = f"{SITE_URL}/?v={fingerprint[:12]}"
    if os.name == "nt":
        browser = find_app_browser()
        if browser is not None:
            try:
                subprocess.Popen(
                    [str(browser), f"--app={url}"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    close_fds=True,
                )
                return
            except OSError:
                pass
        os.startfile(url)  # type: ignore[attr-defined]
        return
    import webbrowser

    webbrowser.open(url)


def run(*, open_browser: bool = True, force_restart: bool = False) -> str:
    current_fingerprint = source_fingerprint()
    health = read_health()
    owner_pid = listener_pid()
    action = plan_launch(
        health,
        owner_pid,
        "" if force_restart else read_saved_fingerprint(),
        current_fingerprint,
    )
    write_log(f"decision={action} pid={owner_pid or '-'} source={current_fingerprint[:12]}")
    if action == "restart":
        if not current_process_is_elevated() and not can_terminate_process(owner_pid or 0):
            raise ElevationRequired("需要管理员权限重新加载最新版总控台")
        stop_console(owner_pid or 0)
    if action in {"start", "restart"}:
        process = start_console()
        wait_until_ready(process)
        STAMP_PATH.write_text(current_fingerprint, encoding="ascii", newline="\n")
        write_log(f"ready pid={process.pid}")
    if open_browser:
        open_site(current_fingerprint)
    return action


def show_error(message: str) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, message, "APEX 总控台", 0x10)
    else:
        print(message, file=sys.stderr)


def acquire_mutex() -> int | None:
    if os.name != "nt":
        return 1
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not handle:
        raise ctypes.WinError()
    if ctypes.get_last_error() == 183:
        kernel32.CloseHandle(handle)
        return None
    return int(handle)


def release_mutex(handle: int | None) -> None:
    if os.name == "nt" and handle:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
        kernel32.CloseHandle.restype = wintypes.BOOL
        kernel32.CloseHandle(wintypes.HANDLE(handle))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--force-restart", action="store_true")
    parser.add_argument("--elevated-child", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    mutex = None
    try:
        mutex = None if args.elevated_child else acquire_mutex()
        if mutex is None:
            if not args.elevated_child:
                return 0
        try:
            run(open_browser=not args.no_open, force_restart=args.force_restart)
        except ElevationRequired:
            if args.elevated_child:
                raise ConsoleLaunchError("已申请管理员权限，但仍无法重启总控台")
            child_args = [
                item
                for item in (argv if argv is not None else sys.argv[1:])
                if item != "--elevated-child"
            ]
            child_args.append("--elevated-child")
            return run_elevated(child_args)
        return 0
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        write_log(f"error={message}")
        show_error(message)
        return 1
    finally:
        release_mutex(mutex)


if __name__ == "__main__":
    raise SystemExit(main())
