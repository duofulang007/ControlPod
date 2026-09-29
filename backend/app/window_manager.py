from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os

from . import config


class ConsoleWindowError(RuntimeError):
    pass


class ConsoleWindowManager:
    """只控制唯一匹配 ControlPod 标题的原生窗口，歧义时拒绝操作。"""

    window_title = "ControlPod"
    state_path = config.DATA_DIR / "console-app-window.json"

    def _saved_state(self) -> dict:
        try:
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return {}
        return raw if isinstance(raw, dict) else {}

    def _saved_handle(self) -> int | None:
        try:
            hwnd = int(self._saved_state().get("hwnd", 0))
        except (ValueError, TypeError):
            return None
        return hwnd if hwnd > 0 else None

    def _saved_pid(self) -> int | None:
        try:
            pid = int(self._saved_state().get("pid", 0))
        except (ValueError, TypeError):
            return None
        return pid if pid > 0 else None

    @staticmethod
    def _user32():
        if os.name != "nt":
            raise ConsoleWindowError("窗口置顶仅支持 Windows 桌面环境")
        return ctypes.WinDLL("user32", use_last_error=True)

    def _window_title_is_expected(self, hwnd: int) -> bool:
        user32 = self._user32()
        target = wintypes.HWND(hwnd)
        if not user32.IsWindow(target) or not user32.IsWindowVisible(target):
            return False
        title = ctypes.create_unicode_buffer(256)
        return bool(user32.GetWindowTextW(target, title, len(title)) and title.value == self.window_title)

    def _find_by_pid(self, pid: int) -> int | None:
        """按进程 pid 反查固定窗口。

        浏览器 --app 窗口标题可能被 Chrome/Edge 追加后缀，或同时存在同名隐藏宿主
        窗口，只靠标题严格匹配会判为「不唯一」而丢失控制权；pid 命中多个时取面积最大者。
        """
        user32 = self._user32()
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
        if not candidates:
            return None
        candidates.sort(reverse=True)
        return candidates[0][1]

    def _find_unique_window(self) -> int | None:
        user32 = self._user32()
        matched: list[int] = []
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        @callback_type
        def visit(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            title = ctypes.create_unicode_buffer(256)
            if user32.GetWindowTextW(hwnd, title, len(title)) and title.value == self.window_title:
                matched.append(int(ctypes.cast(hwnd, ctypes.c_void_p).value or 0))
            return True

        user32.EnumWindows(visit, 0)
        return matched[0] if len(matched) == 1 else None

    def _window_handle(self) -> int | None:
        saved = self._saved_handle()
        if saved is not None and self._window_title_is_expected(saved):
            return saved
        # 句柄可能因窗口重建而失效：先按 pid 反查，再退回标题扫描。
        pid = self._saved_pid()
        if pid is not None:
            found = self._find_by_pid(pid)
            if found is not None:
                self._remember(found)
                return found
        found = self._find_unique_window()
        if found is None:
            # 唯一标题窗口也扫不到时，按记录里的 pid 再试一次（pid 可能刚被补写）。
            return None
        self._remember(found)
        return found

    def _remember(self, hwnd: int) -> None:
        """把新发现的句柄（及其真实 pid）写回记录文件，避免每次请求都全屏枚举。"""
        state = self._saved_state()
        changed = False
        if int(state.get("hwnd") or 0) != int(hwnd):
            state["hwnd"] = int(hwnd)
            changed = True
        if not int(state.get("pid") or 0):
            owner = self._pid_of_window(hwnd)
            if owner:
                state["pid"] = owner
                changed = True
        if not changed:
            return
        try:
            self.state_path.write_text(
                json.dumps(state, ensure_ascii=False, indent=2),
                encoding="utf-8",
                newline="\n",
            )
        except OSError:
            pass

    def _pid_of_window(self, hwnd: int) -> int | None:
        try:
            user32 = self._user32()
            owner = wintypes.DWORD()
            user32.GetWindowThreadProcessId(wintypes.HWND(hwnd), ctypes.byref(owner))
            value = int(owner.value)
        except (OSError, AttributeError, ValueError):
            return None
        return value if value > 0 else None

    def status(self) -> dict[str, object]:
        hwnd = self._window_handle()
        if hwnd is None:
            return {"available": False, "topmost": False, "width": 990, "height": 700}
        user32 = self._user32()
        ex_style = int(user32.GetWindowLongW(wintypes.HWND(hwnd), -20))
        return {
            "available": True,
            "topmost": bool(ex_style & 0x00000008),
            "width": 990,
            "height": 700,
        }

    def set_topmost(self, enabled: bool) -> dict[str, object]:
        hwnd = self._window_handle()
        if hwnd is None:
            raise ConsoleWindowError("没有可控制的 ControlPod 窗口，请先打开 ControlPod")
        user32 = self._user32()
        flags = 0x0001 | 0x0002 | 0x0010 | 0x0040  # NOSIZE | NOMOVE | NOACTIVATE | SHOWWINDOW
        insert_after = ctypes.c_void_p(-1 if enabled else -2)  # HWND_TOPMOST / HWND_NOTOPMOST
        if not user32.SetWindowPos(wintypes.HWND(hwnd), insert_after, 0, 0, 0, 0, flags):
            raise ConsoleWindowError(f"无法更新窗口置顶状态：{ctypes.WinError(ctypes.get_last_error())}")
        state = self.status()
        if state["topmost"] is not enabled:
            raise ConsoleWindowError("窗口置顶操作后校验失败")
        return state
