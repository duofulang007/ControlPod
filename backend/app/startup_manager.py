from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

from . import config


class StartupRegistrationError(RuntimeError):
    pass


class WindowsStartupManager:
    """管理当前 Windows 用户的 APEX 总控台启动项，并在写入后读回确认。"""

    value_name = "APEX Console"
    registry_path = r"Software\Microsoft\Windows\CurrentVersion\Run"

    def __init__(self, *, command: str | None = None, registry: Any | None = None) -> None:
        self.command = command or self._launcher_command()
        self._registry = registry

    @staticmethod
    def _launcher_command() -> str:
        pythonw = config.BACKEND_DIR / ".venv" / "Scripts" / "pythonw.exe"
        launcher = config.BACKEND_DIR / "console_launcher.py"
        return subprocess.list2cmdline([str(pythonw), str(launcher), "--no-open"])

    def _winreg(self) -> Any:
        if self._registry is not None:
            return self._registry
        if os.name != "nt":
            raise StartupRegistrationError("开机自启动仅支持 Windows")
        import winreg

        return winreg

    def _read_value(self) -> str | None:
        reg = self._winreg()
        try:
            with reg.OpenKey(reg.HKEY_CURRENT_USER, self.registry_path, 0, reg.KEY_READ) as key:
                value, _ = reg.QueryValueEx(key, self.value_name)
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise StartupRegistrationError(f"无法读取 Windows 启动项：{exc}") from exc
        return value if isinstance(value, str) else None

    def status(self) -> dict[str, object]:
        return {"enabled": self._read_value() == self.command, "command": self.command}

    def set_enabled(self, enabled: bool) -> dict[str, object]:
        reg = self._winreg()
        try:
            with reg.OpenKey(
                reg.HKEY_CURRENT_USER,
                self.registry_path,
                0,
                reg.KEY_SET_VALUE | reg.KEY_QUERY_VALUE,
            ) as key:
                if enabled:
                    reg.SetValueEx(key, self.value_name, 0, reg.REG_SZ, self.command)
                else:
                    try:
                        reg.DeleteValue(key, self.value_name)
                    except FileNotFoundError:
                        pass
        except OSError as exc:
            raise StartupRegistrationError(f"无法更新 Windows 启动项：{exc}") from exc

        state = self.status()
        if state["enabled"] is not enabled:
            raise StartupRegistrationError("Windows 启动项写入后校验失败")
        return state
