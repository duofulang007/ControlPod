from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
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
APP_WINDOW_PATH = DATA_DIR / "console-app-window.json"
APP_WINDOW_PROFILE_DIR = DATA_DIR / "console-browser-profile"
MUTEX_NAME = "Local\\ApexConsoleOneClickLauncher"
APP_WINDOW_WIDTH = 990
APP_WINDOW_HEIGHT = 700

# --app 固定窗口用的 --user-data-dir 是浏览器的完整 profile，浏览器会把自身组件与
# AI 模型下载进去（单个 ONNX 就近 170 MB），能把 data 目录撑到几百 MB。下面这些是
# 可再生的缓存 / 组件目录，与总控台业务无关：开窗前清一次，**窗口退出后再清一次**——
# 运行期间浏览器会把这些重新下回来，只有退出后清理（文件不再被占用）才真正回收空间。
# Default 主体与窗口状态保留。
APP_WINDOW_PROFILE_JUNK = (
    "ProvenanceData",
    "ProvenanceDataTensors",
    "component_crx_cache",
    "Edge Entity Extraction",
    "EdgeLanguageDetectionModel",
    "Edge Signal Triggers",
    "Edge Shopping",
    "Edge Sidebar",
    "Edge Wallet",
    "Speech Recognition",
    "Subresource Filter",
    "Safe Browsing",
    "Typosquatting",
    "ZxcvbnData",
    "hyphen-data",
    "GrShaderCache",
    "ShaderCache",
    "BrowserMetrics",
    "BrowserMetrics-spare.pma",
    "Default/Cache",
    "Default/Code Cache",
    "Default/GPUCache",
    "Default/GrShaderCache",
    "Default/DawnGraphiteCache",
    "Default/DawnWebGPUCache",
)

# 清理后仍超过这个体积就把「没清干净」写进日志——静默失败（文件被占用等）不能没人知道。
PROFILE_SIZE_WARN_MB = 150


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


def fixed_window_position(width: int = APP_WINDOW_WIDTH, height: int = APP_WINDOW_HEIGHT) -> tuple[int, int]:
    if os.name != "nt":
        return 0, 0
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    screen_width = int(user32.GetSystemMetrics(0))
    screen_height = int(user32.GetSystemMetrics(1))
    return max(0, (screen_width - width) // 2), max(0, (screen_height - height) // 2)


def _window_handle_for_title(user32, expected_title: str) -> int | None:
    """扫描可见顶层窗口，返回标题严格等于 expected_title 的唯一窗口。"""
    windows: list[int] = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @callback_type
    def visit(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        title = ctypes.create_unicode_buffer(256)
        if user32.GetWindowTextW(hwnd, title, len(title)) and title.value == expected_title:
            windows.append(int(ctypes.cast(hwnd, ctypes.c_void_p).value or 0))
        return True

    user32.EnumWindows(visit, 0)
    return windows[0] if len(windows) == 1 else None


def find_console_window(pid: int | None = None) -> int | None:
    """定位 APEX 固定窗口。

    优先按进程 pid 反查：浏览器 --app 窗口的真实标题可能被 Chrome/Edge 附加后缀，
    或存在同名隐藏宿主窗口，仅靠标题严格匹配会漏。pid 命中多个候选时，取面积最大
    的那个可见顶层窗口。
    """
    if os.name != "nt":
        return None
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    if pid:
        candidates: list[tuple[int, int]] = []
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        target_pid = int(pid)

        @callback_type
        def visit(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            owner_pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner_pid))
            if int(owner_pid.value) != target_pid:
                return True
            rect = wintypes.RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                return True
            width = max(0, int(rect.right) - int(rect.left))
            height = max(0, int(rect.bottom) - int(rect.top))
            candidates.append((width * height, int(ctypes.cast(hwnd, ctypes.c_void_p).value or 0)))
            return True

        user32.EnumWindows(visit, 0)
        if candidates:
            candidates.sort(reverse=True)
            return candidates[0][1]
    return _window_handle_for_title(user32, "APEX 控制台")


def wait_for_console_window(
    timeout_seconds: float = 30.0,
    *,
    pid: int | None = None,
) -> int | None:
    """等待固定窗口出现。

    浏览器 --app 冷启动（新建 profile + 首屏加载）常需十几秒，3 秒窗口必超时并
    导致句柄丢失；这里把默认等待放宽到 30 秒，并在超时前每轮同时尝试 pid 反查。
    """
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        hwnd = find_console_window(pid)
        if hwnd is not None:
            return hwnd
        time.sleep(0.2)
    return find_console_window(pid)


def watch_app_window(pid: int, timeout_seconds: float = 60.0) -> None:
    """后台补写窗口句柄：启动时没等到窗口，也不能让句柄永久为空。"""
    hwnd = wait_for_console_window(timeout_seconds, pid=pid)
    if hwnd is None:
        return
    existing = {}
    try:
        existing = json.loads(APP_WINDOW_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        existing = {}
    if int(existing.get("pid") or 0) != int(pid):
        return
    if int(existing.get("hwnd") or 0) == int(hwnd):
        return
    remember_app_window(pid, hwnd)


def remember_app_window(pid: int, hwnd: int | None) -> None:
    """记录固定窗口信息。

    hwnd 允许为空：浏览器 --app 冷启动时窗口可能尚未出现，此时先落盘 pid 与
    profile，后续由 watch_app_window 或后端按 pid 反查补齐句柄。
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    APP_WINDOW_PATH.write_text(
        json.dumps({
            "pid": int(pid or 0),
            "hwnd": int(hwnd) if hwnd else None,
            "title": "APEX 控制台",
            "profile": str(APP_WINDOW_PROFILE_DIR),
            "width": APP_WINDOW_WIDTH,
            "height": APP_WINDOW_HEIGHT,
        }),
        encoding="utf-8",
        newline="\n",
    )


def prune_profile() -> int:
    """清掉浏览器 profile 里可再生的缓存与组件目录，返回清理掉的条目数。

    只删 APP_WINDOW_PROFILE_JUNK 列出的缓存 / 组件目录，保留 Default 主体
    （书签、窗口尺寸与位置记忆都在那里），所以既不影响启动速度，也不会让
    --app 固定窗口退化成普通标签页。文件正被浏览器占用时静默跳过。
    """
    if not APP_WINDOW_PROFILE_DIR.exists():
        return 0
    removed = 0
    for name in APP_WINDOW_PROFILE_JUNK:
        target = APP_WINDOW_PROFILE_DIR / name
        try:
            if target.is_dir():
                shutil.rmtree(target)
                removed += 1
            elif target.exists():
                target.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def profile_usage_mb() -> int:
    """profile 当前占用的兆字节数，供清理后的自检使用。"""
    if not APP_WINDOW_PROFILE_DIR.exists():
        return 0
    total = 0
    for root, _dirs, files in os.walk(APP_WINDOW_PROFILE_DIR):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
    return total // (1024 * 1024)


def cleanup_profile_after_exit(process: Any) -> None:
    """窗口进程退出后立刻清理 profile —— 这就是「随用随清」。

    窗口运行期间浏览器会把组件与 AI 模型重新下回来（最多约 400 MB），此时文件被
    占用，开窗前那次清理等于白做；窗口一退出，它们就成了没人占用的死文件，删掉才
    真能把空间还回来。清理完再自检体积，清不干净就写日志，不静默失败。
    """
    try:
        if process is not None:
            process.wait()
    except Exception:  # noqa: BLE001 - 进程句柄失效不该影响收尾清理
        pass
    removed = prune_profile()
    size_mb = profile_usage_mb()
    write_log(f"profile cleaned after exit entries={removed} size={size_mb}MB")
    if size_mb > PROFILE_SIZE_WARN_MB:
        write_log(f"profile still oversized size={size_mb}MB limit={PROFILE_SIZE_WARN_MB}MB")


def schedule_profile_cleanup(process: Any) -> None:
    """在后台等窗口退出再清理，不阻塞启动。"""
    if process is None:
        return
    threading.Thread(
        target=cleanup_profile_after_exit,
        args=(process,),
        daemon=True,
    ).start()


def open_site(
    fingerprint: str,
    *,
    fixed_window: bool = True,
    require_app_window: bool = False,
) -> int | None:
    url = f"{SITE_URL}/?v={fingerprint[:12]}"
    if os.name == "nt":
        browser = find_app_browser()
        if browser is not None:
            try:
                args = [str(browser), f"--app={url}"]
                if fixed_window:
                    APP_WINDOW_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
                    # 先记下启动时的体积：这正是「上一次会话的峰值」，用来判断
                    # 组件更新开关有没有真的把下载挡住（对照就靠这两行日志）。
                    before_mb = profile_usage_mb()
                    pruned = prune_profile()
                    write_log(f"profile at launch size={before_mb}MB pruned={pruned}")
                    x, y = fixed_window_position()
                    args.extend([
                        f"--user-data-dir={APP_WINDOW_PROFILE_DIR}",
                        "--no-first-run",
                        # 固定窗口只加载本机页面，用不到浏览器的组件更新与后台下载。
                        # 关掉它，两块 300 MB+ 的下载就不用再被拉回来：
                        # ProvenanceData（本地 AI 视觉模型 .ort）与 component_crx_cache
                        # （组件更新包）都由组件更新器喂，两者都不是控制台需要的东西。
                        "--disable-component-update",
                        f"--window-size={APP_WINDOW_WIDTH},{APP_WINDOW_HEIGHT}",
                        f"--window-position={x},{y}",
                    ])
                process = subprocess.Popen(
                    args,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    close_fds=True,
                )
                if fixed_window:
                    pid = int(getattr(process, "pid", 0) or 0)
                    hwnd = wait_for_console_window(3.0, pid=pid) if pid else None
                    remember_app_window(pid, hwnd)
                    if pid and hwnd is None:
                        threading.Thread(
                            target=watch_app_window,
                            args=(pid,),
                            daemon=True,
                        ).start()
                    # 随用随清：等这个窗口进程退出，再把浏览器运行期间重新下回来的
                    # 组件 / 缓存删掉（那时文件不再被占用）。
                    schedule_profile_cleanup(process)
                return int(getattr(process, "pid", 0) or 0) or None
            except OSError:
                if require_app_window:
                    raise ConsoleLaunchError("无法打开受控的 APEX 固定窗口")
        if require_app_window:
            raise ConsoleLaunchError("未找到受支持的 Edge 或 Chrome，无法打开固定窗口")
        os.startfile(url)  # type: ignore[attr-defined]
        return None
    if require_app_window:
        raise ConsoleLaunchError("固定窗口仅支持 Windows 桌面环境")
    import webbrowser

    webbrowser.open(url)
    return None


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
    parser.add_argument(
        "--clean-profile",
        action="store_true",
        help="只清理固定窗口浏览器 profile 的缓存目录，不启动服务",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.clean_profile:
        removed = prune_profile()
        write_log(f"clean-profile entries={removed}")
        return 0
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
