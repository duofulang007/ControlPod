# -*- coding: utf-8 -*-
"""「跑步数据导入」模块的执行入口。

职责很窄：调用 run-analytics 里的导入器（唯一实现），把最新的小米导出包变成 data.js，
再打开本地看板。导入逻辑不在这里复制一份，避免两处口径漂移。

契约（与 modules/apex-launcher/runner.py 一致）：
    runner.py --action {run|stop|restart} --root <run-analytics 目录>
              --result-path <结果 json> --log-path <日志>
期望写 {"ok": true, ...} 并退出 0；失败写 {"ok": false, "error": ...} 并退出 1。
导入器的返回码（2/3/4/5/6/7）统一翻译成中文提示，见 EXIT_MESSAGES。
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any


IMPORT_SCRIPT = Path("tools") / "import_zip.py"
GUI_SCRIPT = Path("tools") / "import_gui.py"
DASHBOARD = "index.html"
IMPORT_TIMEOUT_SECONDS = 600

# 窗口进程的 pid 存在系统临时目录（不进任何仓库），供 stop / restart 精确结束它。
# 之前记在 D:\RunningData\import-gui.pid；2026-09-23 起导入投放目录收敛进 run-analytics
# 项目内，pid 这种运行时产物改放 %TEMP%\run-analytics\——重启即清，清掉也无碍，
# 进程不在时本来就没人再读它。
STATE_DIR = Path(tempfile.gettempdir()) / "run-analytics"
GUI_PID_FILE = STATE_DIR / "import-gui.pid"

# 与 tools/import_zip.py 的返回码约定保持一致
EXIT_MESSAGES = {
    2: "找不到导出包。请把小米导出的 zip 放进 D:\\RunningData\\inbox 后重试。",
    3: "没有拿到压缩包密码。请在导入窗口里输入；或用 MIFITNESS_ZIP_PASSWORD 环境变量传一次（不落盘）。",
    4: "压缩包密码不正确。请在导入窗口里重新输入（密码不做保存，每次都要现填）。",
    5: "这个包是 AES 加密，标准库解不开，需要先安装 pyzipper。",
    6: "本次解析出的场次比上一版少，已拒绝写入（导出可能漏了历史）。确认无误后加 --force 重跑。",
    7: "这个压缩包里没有跑步数据成员。请确认丢进来的是小米运动健康的导出包，并且下载完整。",
}


def write_log(path: Path, message: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"{message}\n")


def write_result(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )


def creation_flags() -> int:
    if os.name != "nt":
        return 0
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def detached_flags(breakaway: bool = False) -> int:
    """让窗口进程脱离调用方：调用方退出后窗口还在，且不弹控制台。

    breakaway 再加一个 CREATE_BREAKAWAY_FROM_JOB：console 服务若是被任务计划或别的
    带 Job 的父进程拉起来的，Job 关闭时会连坐把子进程一起收走，表现为「点了启动窗口一闪就没」。
    只在父进程确实处于 Job 中且允许 breakaway 时才会成功，否则 CreateProcess 直接报错，
    调用方要能降级重试（见 launch_gui）。
    """
    if os.name != "nt":
        return 0
    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
        subprocess, "CREATE_NEW_PROCESS_GROUP", 0
    )
    if breakaway:
        flags |= getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0)
    return flags


def window_python() -> Path:
    """优先用同目录的 pythonw.exe 启动窗口，避免闪出黑框。"""
    candidate = Path(sys.executable).with_name("pythonw.exe")
    return candidate if candidate.is_file() else Path(sys.executable)


def read_gui_pid() -> int | None:
    try:
        return int(GUI_PID_FILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def kill_gui(log_path: Path) -> str:
    """结束之前打开的导入窗口；没有就当作无事发生。"""
    pid = read_gui_pid()
    if pid is None:
        write_log(log_path, "[SKIP] 没有记录到导入窗口进程")
        return "none"
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags(),
        )
    else:
        try:
            os.kill(pid, 15)
        except OSError:
            pass
    GUI_PID_FILE.unlink(missing_ok=True)
    write_log(log_path, f"[STEP] 已关闭导入窗口 pid={pid}")
    return "killed"


def launch_gui(root: Path, log_path: Path) -> dict[str, Any]:
    """打开「跑步数据导入」窗口：拖压缩包 + 输密码都在窗口里完成。

    故意不等待窗口关闭 —— 它归用户操作，占着模块运行位没有意义。
    """
    script = root / GUI_SCRIPT
    if not script.is_file():
        raise RuntimeError(f"run-analytics 导入窗口不存在：{script}")
    kill_gui(log_path)  # 避免开出第二个窗口
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    command = [str(window_python()), str(script)]
    popen_kwargs = {"cwd": str(root), "close_fds": True}
    try:
        proc = subprocess.Popen(command, creationflags=detached_flags(breakaway=True), **popen_kwargs)
    except OSError as exc:
        write_log(log_path, f"[WARN] 脱离进程组启动失败，降级为普通分离：{exc}")
        proc = subprocess.Popen(command, creationflags=detached_flags(), **popen_kwargs)
    GUI_PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    write_log(log_path, f"[STEP] 已打开导入窗口 pid={proc.pid}")
    return {"exit_code": 0, "pid": proc.pid, "window": str(script)}


def run_import(root: Path, log_path: Path) -> dict[str, Any]:
    script = root / IMPORT_SCRIPT
    if not script.is_file():
        raise RuntimeError(f"run-analytics 导入器不存在：{script}")

    write_log(log_path, f"[STEP] 运行导入器 {script}")
    try:
        completed = subprocess.run(
            [sys.executable, str(script), "--no-prompt"],
            cwd=str(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags(),
            close_fds=True,
            timeout=IMPORT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"导入器运行超过 {IMPORT_TIMEOUT_SECONDS} 秒仍未结束，已中止（导出包过大或磁盘异常）"
        )
    for line in (completed.stdout or "").splitlines():
        write_log(log_path, f"[IMPORT] {line}")

    if completed.returncode != 0:
        raise RuntimeError(
            EXIT_MESSAGES.get(completed.returncode)
            or f"导入器退出码 {completed.returncode}，详见日志"
        )
    return {"exit_code": completed.returncode}


def open_dashboard(root: Path, log_path: Path) -> str:
    page = root / DASHBOARD
    if not page.is_file():
        raise RuntimeError(f"看板文件不存在：{page}")
    if os.name == "nt":
        os.startfile(str(page))  # type: ignore[attr-defined]
    else:
        import webbrowser

        webbrowser.open(page.as_uri())
    write_log(log_path, f"[STEP] 已打开看板 {page}")
    return str(page)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=("run", "stop", "restart"), required=True)
    parser.add_argument("--root", type=Path, required=True, help="run-analytics 项目目录")
    parser.add_argument("--result-path", type=Path, required=True)
    parser.add_argument("--log-path", type=Path, required=True)
    parser.add_argument(
        "--gui",
        action="store_true",
        help="打开导入窗口（拖压缩包 + 输密码），而不是走无界面导入",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    try:
        if args.gui:
            if args.action == "stop":
                status = kill_gui(args.log_path)
                write_result(
                    args.result_path,
                    {"ok": True, "action": "stop", "status": "stopped" if status == "killed" else "noop"},
                )
                return 0
            if args.action == "restart":
                kill_gui(args.log_path)
            result = launch_gui(root, args.log_path)
            write_log(args.log_path, "[OK] 已打开跑步数据导入窗口")
            write_result(
                args.result_path,
                {"ok": True, "action": args.action, "status": "gui-opened", **result},
            )
            return 0
        if args.action != "run":
            # 导入是一次性任务，没有常驻进程；停止 / 重启按无操作处理，避免前端按钮报错。
            write_log(args.log_path, f"[SKIP] {args.action} 对一次性导入任务无作用")
            write_result(
                args.result_path,
                {"ok": True, "action": args.action, "status": "noop"},
            )
            return 0
        result = run_import(root, args.log_path)
        dashboard = open_dashboard(root, args.log_path)
        write_log(args.log_path, "[OK] 跑步数据导入完成")
        write_result(
            args.result_path,
            {"ok": True, "action": "run", "status": "imported", "dashboard": dashboard, **result},
        )
        return 0
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        write_log(args.log_path, f"[ERROR] {message}")
        write_result(args.result_path, {"ok": False, "error": message})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
