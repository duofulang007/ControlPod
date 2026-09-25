from __future__ import annotations

import os
import subprocess
from typing import Any

from . import config


class StartupRegistrationError(RuntimeError):
    pass


class WindowsStartupManager:
    """管理当前 Windows 用户的 APEX 总控台启动项，并在写入后读回确认。

    启动项有两个互不相干的位置，只看其中一个就会说谎：

    - ``Run``：真正被执行的命令。值存在且等于我们的命令才算注册上。
    - ``Explorer\\StartupApproved\\Run``：任务管理器「启动应用」列表里的开关状态。
      这一项**没有记录 = 默认启用**；一旦用户在任务管理器里点过「禁用」，
      这里会留下一条 ``03`` 开头的记录，而 ``Run`` 里的值仍然在。
      只比对 ``Run`` 就会在用户已经禁用的情况下继续显示「已开启」—— 那是假绿。
    """

    value_name = "APEX Console"
    registry_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    approved_path = (
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
    )
    # StartupApproved 的值是 12 字节 REG_BINARY：首 4 字节标志位 + 8 字节时间戳。
    # 实测 02 = 启用、03 = 禁用，所以「bit0 = 1」即被禁用。
    approved_disabled_flag = 0x01
    approved_enabled_value = b"\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"

    def __init__(self, *, command: str | None = None, registry: Any | None = None) -> None:
        self.command = command or self._launcher_command()
        self._registry = registry

    @staticmethod
    def _launcher_command() -> str:
        """开机要执行的命令：直接拉 WinUI 壳。

        壳（shell/ApexShell.exe）启动时会自己打开总控台窗口，并托管 Python 后端
        （探测 8765，没跑就静默拉起 uvicorn），所以注册表只需指向壳这一个入口。
        壳还没构建（路径不存在，比如刚 clone 没编译）时回退旧的 console_launcher
        方案，保证开机自启动不倒退。要静默起服务请手动跑
        ``console_launcher.py --no-open``，别写回启动项。
        """
        shell_exe = (
            config.PROJECT_DIR / "shell" / "bin" / "x64" / "Debug"
            / "net8.0-windows10.0.19041.0" / "win-x64" / "ApexShell.exe"
        )
        if shell_exe.exists():
            return subprocess.list2cmdline([str(shell_exe)])
        pythonw = config.BACKEND_DIR / ".venv" / "Scripts" / "pythonw.exe"
        launcher = config.BACKEND_DIR / "console_launcher.py"
        return subprocess.list2cmdline([str(pythonw), str(launcher)])

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

    def _read_approved(self) -> bool:
        """Windows 侧是否允许启动。没有记录 = 启用（多数机器上不会生成这一项）。"""
        reg = self._winreg()
        try:
            with reg.OpenKey(reg.HKEY_CURRENT_USER, self.approved_path, 0, reg.KEY_READ) as key:
                raw, _ = reg.QueryValueEx(key, self.value_name)
        except FileNotFoundError:
            return True
        except OSError as exc:
            raise StartupRegistrationError(f"无法读取 Windows 启动项开关：{exc}") from exc
        if not isinstance(raw, (bytes, bytearray)) or len(raw) < 4:
            return True
        return not (int.from_bytes(bytes(raw[:4]), "little") & self.approved_disabled_flag)

    def status(self) -> dict[str, object]:
        registered = self._read_value() == self.command
        approved = self._read_approved()
        return {
            # enabled 只有一个含义：登录后它真的会跑起来。
            "enabled": registered and approved,
            "registered": registered,
            "approved": approved,
            "command": self.command,
        }

    def _write_run_value(self, enabled: bool) -> None:
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

    def _write_approved(self, enabled: bool) -> None:
        """同步任务管理器里的那个开关。

        少了这一步，「开启」会被上一次的禁用记录压过去：``Run`` 写成功了，但
        ``status()`` 仍然算出未启用，用户看到开关自己弹回去，只能去任务管理器手动
        恢复。所以开启时必须把禁用记录改回启用，关闭时顺手把这条记录清掉。
        """
        reg = self._winreg()
        access = reg.KEY_SET_VALUE | reg.KEY_QUERY_VALUE
        try:
            try:
                key = reg.OpenKey(reg.HKEY_CURRENT_USER, self.approved_path, 0, access)
            except FileNotFoundError:
                if not enabled:
                    return  # 本来就没有记录要清，不必凭空建这个键
                key = reg.CreateKeyEx(reg.HKEY_CURRENT_USER, self.approved_path, 0, access)
            with key:
                if enabled:
                    reg.SetValueEx(
                        key, self.value_name, 0, reg.REG_BINARY, self.approved_enabled_value
                    )
                else:
                    try:
                        reg.DeleteValue(key, self.value_name)
                    except FileNotFoundError:
                        pass
        except OSError as exc:
            raise StartupRegistrationError(f"无法更新 Windows 启动项开关：{exc}") from exc

    def set_enabled(self, enabled: bool) -> dict[str, object]:
        self._write_run_value(enabled)
        self._write_approved(enabled)

        state = self.status()
        if state["enabled"] is not enabled:
            raise StartupRegistrationError("Windows 启动项写入后校验失败")
        return state
