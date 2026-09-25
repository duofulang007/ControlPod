# -*- coding: utf-8 -*-
"""Process, window, and mouse helpers used by the one-click flow."""
import ctypes
import ctypes.wintypes
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Optional

try:
    import psutil
except Exception:
    psutil = None

try:
    import win32con
    import win32gui
    import win32process
    HAVE_WIN32 = True
except Exception:
    HAVE_WIN32 = False

try:
    import pyautogui
    HAVE_PYAUTOGUI = True
except Exception:
    HAVE_PYAUTOGUI = False

_input_state = threading.local()
# 「输入助手用哪个解释器去动鼠标」是这套流程里不能随手改的一环。
# 参考实现（旧启动脚本的 .bat，以及 D:\Py项目\APEX 那份）把这里**写死成系统 Python 3.14**：
# 旧启动脚本就是用它跑的，是「验证过的驱动」；搬到本仓库时被换成 sys.executable（venv 的 python），
# 动鼠标的进程与权限环境随之改变，表现为 AK 视觉点击报 AK_MOUSE_CONTROL_UNAVAILABLE、流程停在第一步。
# 顺序：环境变量 APEX_INPUT_PYTHON > 参考解释器（存在才用）> 当前解释器。
_REFERENCE_INPUT_PYTHON = Path(r"C:\Users\23221\AppData\Local\Programs\Python\Python314\python.exe")
REFERENCE_INPUT_PYTHON = Path(
    os.environ.get("APEX_INPUT_PYTHON")
    or (_REFERENCE_INPUT_PYTHON if _REFERENCE_INPUT_PYTHON.exists() else sys.executable)
)


@dataclass(frozen=True)
class ProcessIdentity:
    """Immutable process identity used to avoid acting on a reused PID."""

    pid: int
    name: str
    executable: str
    created_at: float

    @property
    def key(self) -> tuple[int, float, str]:
        return (
            self.pid,
            self.created_at,
            os.path.normcase(os.path.abspath(self.executable)),
        )

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ExactProcessCloseResult:
    requested_pids: tuple[int, ...]
    graceful_pids: tuple[int, ...]
    terminated_pids: tuple[int, ...]
    killed_pids: tuple[int, ...]
    remaining_pids: tuple[int, ...]
    identity_mismatch_pids: tuple[int, ...]
    inaccessible_pids: tuple[int, ...]
    elapsed_seconds: float

    @property
    def success(self) -> bool:
        return not (
            self.remaining_pids
            or self.identity_mismatch_pids
            or self.inaccessible_pids
        )

    def to_dict(self) -> dict:
        data = asdict(self)
        data["success"] = self.success
        return data


def is_windows() -> bool:
    return os.name == "nt"


def is_process_running(name: str) -> bool:
    target = name.lower()
    if psutil is not None:
        try:
            for proc in psutil.process_iter(["name"]):
                try:
                    if proc.info.get("name") and proc.info["name"].lower() == target:
                        return True
                except Exception:
                    continue
        except Exception:
            pass
    if is_windows():
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {name}", "/NH"],
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            return name.lower() in result.stdout.lower()
        except Exception:
            pass
    return False


def any_process_running(names) -> bool:
    """Return whether any of the given images is running in a single scan."""
    if isinstance(names, str):
        names = [names]
    targets = {name.lower() for name in names}
    if psutil is not None:
        try:
            for proc in psutil.process_iter(["name"]):
                try:
                    name = proc.info.get("name")
                    if name and name.lower() in targets:
                        return True
                except Exception:
                    continue
            return False
        except Exception:
            pass
    if is_windows():
        try:
            result = subprocess.run(
                ["tasklist", "/NH"],
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            lowered = (result.stdout or "").lower()
            return any(name in lowered for name in targets)
        except Exception:
            pass
    return False


def find_pids_by_name(name: str) -> list[int]:
    target = name.lower()
    pids: list[int] = []
    if psutil is not None:
        try:
            for proc in psutil.process_iter(["name", "pid"]):
                try:
                    if proc.info.get("name") and proc.info["name"].lower() == target:
                        pids.append(proc.info["pid"])
                except Exception:
                    continue
        except Exception:
            pass
    return pids


def find_pids_in_directory(directory: str) -> list[int]:
    """Return only processes whose executable is confirmed inside directory."""
    if psutil is None or not directory:
        return []
    try:
        root = os.path.normcase(os.path.abspath(directory))
    except Exception:
        return []
    pids: list[int] = []
    try:
        for process in psutil.process_iter(["pid", "exe"]):
            try:
                executable = process.info.get("exe")
                if not executable:
                    continue
                candidate = os.path.normcase(os.path.abspath(executable))
                if os.path.commonpath((root, candidate)) == root:
                    pids.append(int(process.info["pid"]))
            except (OSError, ValueError, psutil.Error):
                continue
    except Exception:
        pass
    return pids


def snapshot_process_identities(
    names: Iterable[str],
    *,
    install_dir: str | None = None,
) -> tuple[ProcessIdentity, ...]:
    """Snapshot named processes, optionally requiring an executable under one directory."""
    if psutil is None:
        raise RuntimeError("psutil 不可用，无法建立进程所有权基线。")
    wanted = {str(name).casefold() for name in names if str(name)}
    if not wanted:
        raise ValueError("进程所有权快照至少需要一个进程名。")
    root = os.path.normcase(os.path.abspath(install_dir)) if install_dir else None
    found: list[ProcessIdentity] = []
    inaccessible: list[int] = []
    for process in psutil.process_iter(["pid", "name", "exe", "create_time"]):
        try:
            name = str(process.info.get("name") or "")
            if name.casefold() not in wanted:
                continue
            executable = str(process.info.get("exe") or "")
            created_at = float(process.info.get("create_time") or 0.0)
            if not executable or created_at <= 0:
                inaccessible.append(int(process.info["pid"]))
                continue
            candidate = os.path.normcase(os.path.abspath(executable))
            if root:
                try:
                    if os.path.commonpath((root, candidate)) != root:
                        continue
                except ValueError:
                    continue
            found.append(
                ProcessIdentity(
                    pid=int(process.info["pid"]),
                    name=name,
                    executable=executable,
                    created_at=created_at,
                )
            )
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied:
            try:
                inaccessible.append(int(process.pid))
            except Exception:
                pass
    if inaccessible:
        raise RuntimeError(
            "无法读取目标进程的路径或创建时间，已拒绝推断所有权："
            + ",".join(str(pid) for pid in sorted(set(inaccessible)))
        )
    return tuple(sorted(found, key=lambda item: (item.created_at, item.pid)))


def new_process_identities(
    baseline: Iterable[ProcessIdentity],
    current: Iterable[ProcessIdentity],
) -> tuple[ProcessIdentity, ...]:
    """Return identities that did not exist in the pre-launch baseline."""
    before = {item.key for item in baseline}
    return tuple(item for item in current if item.key not in before)


def _identity_state(identity: ProcessIdentity) -> str:
    try:
        process = psutil.Process(identity.pid)
        if abs(float(process.create_time()) - identity.created_at) > 0.01:
            return "mismatch"
        executable = os.path.normcase(os.path.abspath(process.exe()))
        expected = os.path.normcase(os.path.abspath(identity.executable))
        return "matching" if executable == expected else "mismatch"
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return "gone"
    except psutil.AccessDenied:
        return "inaccessible"


def _classify_identities(
    identities: Iterable[ProcessIdentity],
) -> tuple[list[ProcessIdentity], list[int], list[int]]:
    matching: list[ProcessIdentity] = []
    mismatched: list[int] = []
    inaccessible: list[int] = []
    for identity in identities:
        state = _identity_state(identity)
        if state == "matching":
            matching.append(identity)
        elif state == "mismatch":
            mismatched.append(identity.pid)
        elif state == "inaccessible":
            inaccessible.append(identity.pid)
    return matching, mismatched, inaccessible


def _wait_exact_processes(
    identities: Iterable[ProcessIdentity], timeout: float
) -> tuple[list[ProcessIdentity], list[int], list[int]]:
    deadline = time.monotonic() + max(0.0, timeout)
    while True:
        matching, mismatched, inaccessible = _classify_identities(identities)
        if not matching or mismatched or inaccessible or time.monotonic() >= deadline:
            return matching, mismatched, inaccessible
        time.sleep(0.15)


def _signal_exact_processes(
    identities: Iterable[ProcessIdentity], method: str
) -> tuple[list[int], list[int], list[int]]:
    acted: list[int] = []
    mismatched: list[int] = []
    inaccessible: list[int] = []
    for identity in identities:
        state = _identity_state(identity)
        if state == "gone":
            continue
        if state == "mismatch":
            mismatched.append(identity.pid)
            continue
        if state == "inaccessible":
            inaccessible.append(identity.pid)
            continue
        try:
            getattr(psutil.Process(identity.pid), method)()
            acted.append(identity.pid)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied:
            inaccessible.append(identity.pid)
    return acted, mismatched, inaccessible


def close_process_identities(
    identities: Iterable[ProcessIdentity],
    *,
    graceful_timeout: float = 2.0,
    terminate_timeout: float = 3.0,
    kill_timeout: float = 3.0,
) -> ExactProcessCloseResult:
    """Close only exact PID/create-time/path identities and verify their exit."""
    if psutil is None:
        raise RuntimeError("psutil 不可用，无法安全关闭本轮进程。")
    targets = tuple(identities)
    started = time.monotonic()
    requested = tuple(identity.pid for identity in targets)
    matching, mismatched, inaccessible = _classify_identities(targets)
    if mismatched or inaccessible:
        return ExactProcessCloseResult(
            requested,
            (),
            (),
            (),
            tuple(identity.pid for identity in matching),
            tuple(sorted(set(mismatched))),
            tuple(sorted(set(inaccessible))),
            time.monotonic() - started,
        )

    graceful = tuple(
        identity.pid for identity in matching if send_wm_close_to_pid(identity.pid)
    )
    matching, mismatched, inaccessible = _wait_exact_processes(
        matching, graceful_timeout
    )
    if mismatched or inaccessible:
        return ExactProcessCloseResult(
            requested,
            graceful,
            (),
            (),
            tuple(identity.pid for identity in matching),
            tuple(sorted(set(mismatched))),
            tuple(sorted(set(inaccessible))),
            time.monotonic() - started,
        )

    terminated, mismatch_after_terminate, inaccessible_after_terminate = (
        _signal_exact_processes(matching, "terminate")
    )
    matching, wait_mismatch, wait_inaccessible = _wait_exact_processes(
        matching, terminate_timeout
    )
    mismatched = mismatch_after_terminate + wait_mismatch
    inaccessible = inaccessible_after_terminate + wait_inaccessible
    if mismatched or inaccessible:
        return ExactProcessCloseResult(
            requested,
            graceful,
            tuple(terminated),
            (),
            tuple(identity.pid for identity in matching),
            tuple(sorted(set(mismatched))),
            tuple(sorted(set(inaccessible))),
            time.monotonic() - started,
        )

    killed, mismatch_after_kill, inaccessible_after_kill = _signal_exact_processes(
        matching, "kill"
    )
    matching, wait_mismatch, wait_inaccessible = _wait_exact_processes(
        matching, kill_timeout
    )
    mismatched = mismatch_after_kill + wait_mismatch
    inaccessible = inaccessible_after_kill + wait_inaccessible
    return ExactProcessCloseResult(
        requested,
        graceful,
        tuple(terminated),
        tuple(killed),
        tuple(identity.pid for identity in matching),
        tuple(sorted(set(mismatched))),
        tuple(sorted(set(inaccessible))),
        time.monotonic() - started,
    )


def find_related_pids(names, install_dir: str | None = None) -> list[int]:
    if isinstance(names, str):
        names = [names]
    found = {pid for name in names for pid in find_pids_by_name(name)}
    found.update(find_pids_in_directory(install_dir or ""))
    return sorted(found)


def _taskkill_image(name: str) -> bool:
    try:
        result = subprocess.run(
            ["taskkill", "/f", "/im", name],
            capture_output=True,
            timeout=8,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return result.returncode == 0
    except Exception:
        return False


def _run_elevated_taskkill(name: str) -> bool:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        return False
    command = (
        "$ErrorActionPreference='Stop'; "
        f"$p=Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/f','/im','{name}') "
        "-Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            capture_output=True,
            timeout=45,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        return result.returncode == 0
    except Exception:
        return False


def _force_kill_image(name: str) -> bool:
    if _taskkill_image(name):
        return True
    if not is_process_running(name):
        return True
    return _run_elevated_taskkill(name)


def start_process(path: str) -> bool:
    """Start a program without a console window and report dispatch success."""
    try:
        subprocess.Popen(
            [path],
            cwd=os.path.dirname(path) or None,
            creationflags=subprocess.CREATE_NO_WINDOW if is_windows() else 0,
        )
        return True
    except Exception:
        if is_windows():
            try:
                os.startfile(path)  # type: ignore[attr-defined]
                return True
            except Exception:
                pass
    return False


def kill_processes(names, grace: int = 3, install_dir: str | None = None, graceful: bool = True) -> bool:
    if isinstance(names, str):
        names = [names]
    if is_windows():
        if graceful:
            for pid in find_related_pids(names, install_dir):
                send_wm_close_to_pid(pid)
            gentle_deadline = time.time() + min(max(float(grace), 1.0), 1.5)
            while time.time() < gentle_deadline:
                if not find_related_pids(names, install_dir):
                    return True
                time.sleep(0.2)

        deadline = time.time() + max(1.0, grace)
        image_kill_attempted: set[str] = set()
        while time.time() < deadline:
            for name in names:
                if name not in image_kill_attempted:
                    _force_kill_image(name)
                    image_kill_attempted.add(name)
                else:
                    _taskkill_image(name)
            for pid in find_pids_in_directory(install_dir or ""):
                try:
                    subprocess.run(
                        ["taskkill", "/f", "/t", "/pid", str(pid)],
                        capture_output=True,
                        timeout=8,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                except Exception:
                    pass
            time.sleep(0.4)
            if not any(is_process_running(name) for name in names) and not find_pids_in_directory(install_dir or ""):
                return True
        return not any(is_process_running(name) for name in names) and not find_pids_in_directory(install_dir or "")
    if psutil is None:
        return True
    deadline = time.time() + grace
    for name in names:
        for pid in find_pids_by_name(name):
            try:
                psutil.Process(pid).terminate()
            except Exception:
                pass
    while time.time() < deadline and any(find_pids_by_name(name) for name in names):
        time.sleep(0.3)
    for name in names:
        for pid in find_pids_by_name(name):
            try:
                psutil.Process(pid).kill()
            except Exception:
                pass
    return not any(find_pids_by_name(name) for name in names)


def find_window(title: str, process_ids: set[int] | None = None) -> Optional[int]:
    if not HAVE_WIN32:
        return None
    needle = title.lower()
    allowed_pids = set(process_ids) if process_ids is not None else None
    exact = None
    best_partial = None
    best_partial_area = -1

    def callback(hwnd, _unused):
        nonlocal exact, best_partial, best_partial_area
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return True
            if allowed_pids is not None:
                _thread_id, process_id = win32process.GetWindowThreadProcessId(hwnd)
                if process_id not in allowed_pids:
                    return True
            text = win32gui.GetWindowText(hwnd).lower()
            if text == needle:
                exact = hwnd
                return True
            if needle not in text:
                return True
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            area = (right - left) * (bottom - top)
            if area > best_partial_area:
                best_partial_area = area
                best_partial = hwnd
        except Exception:
            pass
        return True

    win32gui.EnumWindows(callback, None)
    return exact if exact is not None else best_partial


def window_rect(hwnd: int):
    if not HAVE_WIN32:
        return None
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        return left, top, right - left, bottom - top
    except Exception:
        return None


def activate_window(title: str, process_ids: set[int] | None = None) -> Optional[int]:
    handle = find_window(title, process_ids=process_ids)
    if not handle or not HAVE_WIN32:
        return None
    try:
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(handle)
        time.sleep(0.15)
    except Exception:
        pass
    return handle


FOREGROUND_FOCUS_ATTEMPTS = 3
FOREGROUND_FOCUS_POLL_INTERVAL = 0.1


def _focus_with_thread_input(handle: int) -> Optional[str]:
    """Activate a window even while another application owns the foreground.

    Attaching our input queue to the current foreground thread lifts the
    Windows foreground lock for the duration of the call. Returns an error
    string when a step failed so callers can report why activation was denied.
    """
    errors: list[str] = []
    attached: list[tuple[int, int]] = []
    try:
        current_thread = int(ctypes.windll.kernel32.GetCurrentThreadId())
        target_thread, _target_pid = win32process.GetWindowThreadProcessId(handle)
        foreground_hwnd = int(win32gui.GetForegroundWindow())
        foreground_thread = 0
        if foreground_hwnd:
            foreground_thread, _foreground_pid = win32process.GetWindowThreadProcessId(
                foreground_hwnd
            )
        for other_thread in {int(target_thread), int(foreground_thread)} - {0, current_thread}:
            try:
                if ctypes.windll.user32.AttachThreadInput(current_thread, other_thread, True):
                    attached.append((current_thread, other_thread))
            except Exception as exc:
                errors.append(f"AttachThreadInput({other_thread}): {exc}")
        try:
            win32gui.SetForegroundWindow(handle)
        except Exception as exc:
            errors.append(f"SetForegroundWindow: {exc}")
        try:
            win32gui.BringWindowToTop(handle)
        except Exception as exc:
            errors.append(f"BringWindowToTop: {exc}")
        try:
            win32gui.SetFocus(handle)
        except Exception as exc:
            errors.append(f"SetFocus: {exc}")
    except Exception as exc:
        errors.append(f"focus: {exc}")
    finally:
        for own_thread, other_thread in reversed(attached):
            try:
                ctypes.windll.user32.AttachThreadInput(own_thread, other_thread, False)
            except Exception:
                pass
    return "; ".join(errors) or None


def prepare_window(title: str, center: bool = True, process_ids: set[int] | None = None) -> Optional[int]:
    """Restore, expose and optionally center a window before screen capture.

    The temporary topmost transition raises the target above ordinary windows.
    It is immediately returned to the normal (non-topmost) band so AK will not
    remain above Steam or the game after automation finishes.
    """
    handle = find_window(title, process_ids=process_ids)
    if not handle or not HAVE_WIN32:
        return None
    try:
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        left, top, right, bottom = win32gui.GetWindowRect(handle)
        width, height = right - left, bottom - top
        if width <= 0 or height <= 0:
            return None
        if center:
            screen_width, screen_height = screen_size()
            left = max(0, (screen_width - width) // 2)
            top = max(0, (screen_height - height) // 2)

        win32gui.SetWindowPos(
            handle,
            win32con.HWND_TOPMOST,
            int(left),
            int(top),
            int(width),
            int(height),
            win32con.SWP_SHOWWINDOW,
        )
        win32gui.BringWindowToTop(handle)
        foreground_error = None
        # Bounded focus acquisition. Windows refuses a plain
        # SetForegroundWindow while another application (Steam or the game)
        # owns the foreground, so attach thread input until the target really
        # is the foreground window. The final check below still fails closed.
        foreground = int(win32gui.GetForegroundWindow())
        for _attempt in range(FOREGROUND_FOCUS_ATTEMPTS):
            if foreground == handle:
                break
            error = _focus_with_thread_input(handle)
            if error:
                foreground_error = error
            time.sleep(FOREGROUND_FOCUS_POLL_INTERVAL)
            foreground = int(win32gui.GetForegroundWindow())
        win32gui.SetWindowPos(
            handle,
            win32con.HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW,
        )
        if not win32gui.IsWindowVisible(handle) or win32gui.IsIconic(handle):
            return None
        foreground = int(win32gui.GetForegroundWindow())
        if foreground != handle:
            logging.getLogger(__name__).warning(
                "AK window foreground check failed: target=%s actual=%s foreground_error=%s",
                handle, foreground, foreground_error,
            )
            return None
        return handle
    except Exception as exc:
        logging.getLogger(__name__).warning("AK window preparation failed: target=%s error=%s", handle, exc)
        return None


def wait_window(title: str, timeout: float, process_ids: set[int] | None = None) -> Optional[int]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        handle = find_window(title, process_ids=process_ids)
        if handle:
            return handle
        time.sleep(0.25)
    return None


def set_dpi_aware() -> None:
    """Set per-monitor DPI awareness like the working reference version."""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass


def screen_size():
    width = ctypes.windll.user32.GetSystemMetrics(0)
    height = ctypes.windll.user32.GetSystemMetrics(1)
    return width, height


def _run_input_helper(x: int, y: int, click: bool) -> dict:
    helper = Path(__file__).with_name("input_helper.py")
    python = str(REFERENCE_INPUT_PYTHON) if REFERENCE_INPUT_PYTHON.exists() else sys.executable
    command = [python, str(helper), "--x", str(int(x)), "--y", str(int(y))]
    if click:
        command.append("--click")
    started = time.monotonic()
    try:
        # 超时放宽到 15s：helper 现在会为「指针被系统拒绝」重试若干轮（实测 SetCursorPos 会偶发返回 0、
        # 指针不动），5s 会把重试掐在半路，反过来又变成一个看不出原因的 TimeoutExpired。
        completed = subprocess.run(
            command,
            cwd=str(helper.parent.parent),
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if is_windows() else 0,
        )
        output = completed.stdout.strip().splitlines()
        result = json.loads(output[-1]) if output else {}
        # helper 的原始信息一律带出去：以前只留 ok/moved/clicked/actual，
        # 返回码与 stderr 被丢掉，上游就只能看到一个对不上的坐标，猜不出到底发生了什么。
        result.setdefault("returncode", completed.returncode)
        if completed.stderr.strip():
            result.setdefault("stderr", completed.stderr.strip()[:300])
    except Exception as exc:
        result = {
            "ok": False,
            "moved": False,
            "clicked": False,
            "error": type(exc).__name__,
            "error_detail": str(exc)[:200],
        }
    result.setdefault("elapsed_seconds", round(time.monotonic() - started, 2))
    _input_state.result = result
    return result


def last_input_result() -> dict:
    return getattr(_input_state, "result", {})


def get_cursor_pos():
    if is_windows():
        point = ctypes.wintypes.POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(point))
        return point.x, point.y
    if HAVE_PYAUTOGUI:
        pos = pyautogui.position()
        return pos.x, pos.y
    return 0, 0


def click_at(x: int, y: int) -> bool:
    """Move and click atomically in one fresh desktop-input helper."""
    result = _run_input_helper(int(x), int(y), click=True)
    return bool(result.get("ok") and result.get("moved") and result.get("clicked"))


def send_wm_close_to_pid(pid: int) -> bool:
    if not HAVE_WIN32:
        return False
    sent = False

    def callback(hwnd, _unused):
        nonlocal sent
        try:
            _, found_pid = win32process.GetWindowThreadProcessId(hwnd)
            if found_pid == pid and win32gui.IsWindowVisible(hwnd):
                win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                sent = True
        except Exception:
            pass

    win32gui.EnumWindows(callback, None)
    return sent
