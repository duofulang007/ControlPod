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
from typing import Any, Callable
from urllib import error as url_error
from urllib import request as url_request


API_BASE = "http://127.0.0.1:8000"
EXPECTED_API_TITLE = "Apex Launcher API"
EXPECTED_AUTOMATION_REVISION = "window-focus-v7"
BACKEND_PORT = 8000


class LauncherError(RuntimeError):
    pass


def write_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"{message}\n")


def write_result(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def _error_message(payload: Any, fallback: str) -> str:
    if not isinstance(payload, dict):
        return fallback
    detail = payload.get("detail", payload)
    if isinstance(detail, dict):
        code = str(detail.get("code") or "").strip()
        message = str(detail.get("message") or detail.get("last_error") or "").strip()
        if code and message:
            return f"{code}: {message}"
        return message or code or fallback
    return str(detail).strip() or fallback


def request_json(path: str, method: str = "GET", timeout: float = 10.0) -> Any:
    req = url_request.Request(
        f"{API_BASE}{path}",
        data=b"" if method == "POST" else None,
        method=method,
    )
    try:
        with url_request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8-sig")
    except url_error.HTTPError as exc:
        raw = exc.read().decode("utf-8-sig", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = None
        raise LauncherError(_error_message(payload, f"HTTP {exc.code}: {raw.strip()}")) from exc
    except (OSError, url_error.URLError) as exc:
        raise LauncherError(str(exc)) from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LauncherError(f"APEX backend returned invalid JSON: {exc}") from exc


def backend_compatible() -> bool:
    try:
        health = request_json("/api/health", timeout=2)
        spec = request_json("/openapi.json", timeout=2)
        automation = request_json("/api/apex/automation-info", timeout=2)
    except LauncherError:
        return False
    return (
        isinstance(health, dict)
        and health.get("status") == "ok"
        and isinstance(spec, dict)
        and spec.get("info", {}).get("title") == EXPECTED_API_TITLE
        and isinstance(automation, dict)
        and automation.get("revision") == EXPECTED_AUTOMATION_REVISION
    )


def backend_owner_pid() -> int | None:
    import psutil

    try:
        connections = psutil.net_connections(kind="tcp")
    except (psutil.AccessDenied, OSError):
        return None
    for connection in connections:
        address = connection.laddr
        if not address or address.port != BACKEND_PORT:
            continue
        if connection.status == psutil.CONN_LISTEN and connection.pid:
            return int(connection.pid)
    return None


def process_is_elevated(pid: int) -> bool:
    if os.name != "nt":
        return False
    import win32api
    import win32con
    import win32security

    process = None
    token = None
    try:
        process = win32api.OpenProcess(win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        token = win32security.OpenProcessToken(process, win32con.TOKEN_QUERY)
        return bool(win32security.GetTokenInformation(token, win32security.TokenElevation))
    except Exception:
        return False
    finally:
        if token is not None:
            token.Close()
        if process is not None:
            process.Close()


def current_process_is_elevated() -> bool:
    return os.name == "nt" and bool(ctypes.windll.shell32.IsUserAnAdmin())


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


def run_elevated(arguments: list[str]) -> int:
    if os.name != "nt":
        raise LauncherError("APEX module elevation is only supported on Windows")
    execute = ShellExecuteInfo()
    execute.cbSize = ctypes.sizeof(execute)
    execute.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    execute.lpVerb = "runas"
    execute.lpFile = sys.executable
    execute.lpParameters = subprocess.list2cmdline([str(Path(__file__).resolve()), *arguments])
    execute.lpDirectory = str(Path(__file__).resolve().parent)
    execute.nShow = 0  # SW_HIDE
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(execute)):
        raise ctypes.WinError()
    if not execute.hProcess:
        raise LauncherError("Elevated APEX module did not return a process handle")
    try:
        ctypes.windll.kernel32.WaitForSingleObject(execute.hProcess, 0xFFFFFFFF)
        exit_code = wintypes.DWORD()
        if not ctypes.windll.kernel32.GetExitCodeProcess(execute.hProcess, ctypes.byref(exit_code)):
            raise ctypes.WinError()
        return int(exit_code.value)
    finally:
        ctypes.windll.kernel32.CloseHandle(execute.hProcess)


def stop_verified_backend(pid: int, log_path: Path) -> None:
    import psutil

    write_log(log_path, f"[INFO] Replacing verified non-elevated APEX backend PID {pid}")
    process = psutil.Process(pid)
    process.kill()
    try:
        process.wait(timeout=8)
    except psutil.TimeoutExpired as exc:
        raise LauncherError("The non-elevated APEX backend did not exit") from exc


def start_backend(apex_root: Path, log_path: Path) -> subprocess.Popen[bytes]:
    backend = apex_root / "backend"
    python = backend / ".venv" / "Scripts" / "python.exe"
    if not python.is_file():
        raise LauncherError(f"APEX backend virtual environment is missing: {python}")
    launcher_logs = backend / "data" / "launcher-logs"
    launcher_logs.mkdir(parents=True, exist_ok=True)
    stdout_path = launcher_logs / "console-module.out.log"
    stderr_path = launcher_logs / "console-module.err.log"
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    stdout_handle = stdout_path.open("ab")
    stderr_handle = stderr_path.open("ab")
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
                str(BACKEND_PORT),
            ],
            cwd=str(backend),
            stdin=subprocess.DEVNULL,
            stdout=stdout_handle,
            stderr=stderr_handle,
            creationflags=creationflags,
        )
    finally:
        stdout_handle.close()
        stderr_handle.close()
    write_log(log_path, f"[INFO] Persistent APEX backend PID {process.pid}")
    return process


def wait_backend_ready(process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise LauncherError(f"APEX backend exited early with code {exit_code}")
        if backend_compatible():
            return
        time.sleep(0.4)
    raise LauncherError("APEX backend was not ready within 20 seconds")


def ensure_backend(apex_root: Path, log_path: Path) -> None:
    compatible = backend_compatible()
    owner_pid = backend_owner_pid()
    if owner_pid is not None:
        if not compatible:
            raise LauncherError("Port 8000 is occupied by an unknown service; no process was stopped")
        if process_is_elevated(owner_pid):
            return
        stop_verified_backend(owner_pid, log_path)
    elif compatible:
        raise LauncherError("Compatible APEX backend was found, but its process identity could not be verified")
    process = start_backend(apex_root, log_path)
    wait_backend_ready(process)


def append_new_apex_logs(previous_count: int, log_path: Path) -> None:
    try:
        current = request_json("/api/apex/logs?limit=1000", timeout=10)
    except LauncherError as exc:
        write_log(log_path, f"[ERROR] Failed to read APEX logs: {exc}")
        return
    if not isinstance(current, list):
        return
    for entry in current[previous_count:]:
        if not isinstance(entry, dict):
            continue
        level = str(entry.get("level") or "INFO").upper()
        text = str(entry.get("text") or "")
        write_log(log_path, f"[{level}] {text}")


def invoke_transition(api_action: str, target: str, log_path: Path) -> dict[str, Any]:
    write_log(log_path, f"[STEP] APEX phase {api_action}")
    previous = request_json("/api/apex/logs?limit=1000", timeout=10)
    previous_count = len(previous) if isinstance(previous, list) else 0
    try:
        started = request_json(f"/api/apex/{api_action}", method="POST", timeout=30)
        if not isinstance(started, dict):
            raise LauncherError(f"APEX {api_action} returned an invalid status")
        if started.get("state") == target:
            settled = started
        else:
            revision = started.get("revision")
            if not isinstance(revision, int):
                raise LauncherError(f"APEX {api_action} did not return a valid revision")
            settled = request_json(
                f"/api/apex/wait?target={target}&revision={revision}",
                timeout=75,
            )
        if not isinstance(settled, dict) or settled.get("state") != target:
            message = _error_message(settled, f"APEX {api_action} did not reach {target}")
            raise LauncherError(message)
        return settled
    finally:
        append_new_apex_logs(previous_count, log_path)


def execute_action(
    action: str,
    log_path: Path,
    transition: Callable[[str, str, Path], dict[str, Any]] = invoke_transition,
) -> dict[str, Any]:
    write_log(log_path, f"[STEP] APEX one-click {action}")
    if action == "restart":
        transition("stop", "stopped", log_path)
        return transition("start", "running", log_path)
    if action == "run":
        return transition("start", "running", log_path)
    return transition("stop", "stopped", log_path)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("run", "stop", "restart"), required=True)
    parser.add_argument("--apex-root", type=Path, required=True)
    parser.add_argument("--result-path", type=Path, required=True)
    parser.add_argument("--log-path", type=Path, required=True)
    parser.add_argument("--elevated-child", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        python = args.apex_root / "backend" / ".venv" / "Scripts" / "python.exe"
        if not python.is_file():
            raise LauncherError(f"APEX backend virtual environment is missing: {python}")
        compatible = backend_compatible()
        owner_pid = backend_owner_pid() if compatible else None
        reusable_elevated = bool(owner_pid and process_is_elevated(owner_pid))
        if not current_process_is_elevated() and not reusable_elevated:
            child_args = [item for item in (argv if argv is not None else sys.argv[1:]) if item != "--elevated-child"]
            child_args.append("--elevated-child")
            return run_elevated(child_args)
        ensure_backend(args.apex_root, args.log_path)
        settled = execute_action(args.action, args.log_path)
        write_log(args.log_path, f"[OK] APEX one-click {args.action} completed")
        write_result(
            args.result_path,
            {"ok": True, "action": args.action, "status": settled},
        )
        return 0
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        write_log(args.log_path, f"[ERROR] {message}")
        write_result(args.result_path, {"ok": False, "error": message})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
