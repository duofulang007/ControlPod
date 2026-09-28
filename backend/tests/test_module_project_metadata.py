from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.main import create_app
from app.module_registry import ModuleRegistry
from app.module_runner import ModuleRunner


def _write_manifest(modules_dir: Path, module_id: str, extra: dict) -> None:
    module_dir = modules_dir / module_id
    module_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "id": module_id,
        "projectId": module_id,
        "name": module_id,
        "version": "1.0.0",
        "projectRoot": "{console_root}",
        "actions": {"run": {"program": "python", "args": []}},
    }
    payload.update(extra)
    (module_dir / "module.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )


def _project_row(tmp_path: Path, project_id: str) -> tuple:
    conn = sqlite3.connect(tmp_path / "data" / "test.db")
    try:
        row = conn.execute(
            "SELECT name, description FROM projects WHERE id=?", (project_id,)
        ).fetchone()
    finally:
        conn.close()
    return row or ("", "")


def test_manifest_project_name_reaches_the_project_row(tmp_path: Path) -> None:
    """项目名必须来自 manifest，不能再写死成「APEX 启动」。"""
    modules_dir = tmp_path / "modules"
    _write_manifest(
        modules_dir,
        "named",
        {"projectName": "命名项目", "projectDescription": "来自 manifest 的描述"},
    )

    create_app(db_path=tmp_path / "data" / "test.db", modules_dir=modules_dir)

    assert _project_row(tmp_path, "named") == ("命名项目", "来自 manifest 的描述")


def test_manifest_without_project_name_keeps_legacy_wording(tmp_path: Path) -> None:
    """没声明 projectName 的老模块，文案必须保持原样。"""
    modules_dir = tmp_path / "modules"
    _write_manifest(modules_dir, "plain", {})

    create_app(db_path=tmp_path / "data" / "test.db", modules_dir=modules_dir)

    assert _project_row(tmp_path, "plain")[0] == "APEX 启动"


def test_runner_lab_module_opens_the_dashboard_with_the_tool_rail() -> None:
    """跑步模块的主按钮要起本地桥并打开看板（导入入口已收敛进看板里的悬浮工具轨）。

    2026-09-26 变更（多弗朗）：原来是打开 `tools/import_gui.py`（拖压缩包 + 输密码的
    Tkinter 窗口）。现在改成「起桥 + 开看板」，四个导入动作由看板右侧的悬浮工具轨触发。
    Tkinter 窗口降级为可单独双击 `从邮箱导入.cmd` 打开的备用入口，所以 `--gui` 这个
    空壳参数也一并去掉了（留着只会让人以为总控台还能开那个窗口）。
    """
    module_dir = ROOT / "backend" / "modules" / "runner-lab"
    manifest = json.loads((module_dir / "module.json").read_text(encoding="utf-8"))
    runner = (module_dir / "runner.py").read_text(encoding="utf-8")

    assert manifest["projectName"] == "跑步数据分析"
    assert manifest["requiresAdmin"] is False
    assert set(manifest["actions"]) == {"run", "stop", "restart"}
    for name, action in manifest["actions"].items():
        # 只有 {console_root} 能指到 console 的虚拟环境；写死绝对路径换台机器就废。
        # 这个解释器也是跑桥要用的：serve.py 依赖 playwright，它只装在这个 venv 里。
        assert action["program"] == "{console_root}\\backend\\.venv\\Scripts\\python.exe", name
        assert "--gui" not in action["args"], name

    # 启动真相只有一个：调 run-analytics 里那个日常在用的 .cmd（解释器挑选在里面；
    # 端口挑选与开浏览器 2026-09-27 起由桥自己负责）。runner 只负责让它脱手跑起来。
    assert "LAUNCHER_SCRIPT" in runner
    assert "打开看板.cmd" in runner
    assert "call" in runner
    # 起桥必须用 CREATE_NO_WINDOW（隐藏控制台），**不能**用 DETACHED_PROCESS ——
    # 后者会让 cmd 拿不到可继承的控制台、Windows 于是给它新分配一个**可见**的控制台，
    # 那就是总控台点「运行」时弹出来的黑窗（2026-09-27 多弗朗）。
    # 实测复现：DETACHED_PROCESS|CREATE_NEW_PROCESS_GROUP（flags 520）→ 冒出一个
    # `C:\WINDOWS\system32\cmd.exe` 可见窗口；CREATE_NO_WINDOW（flags 134218240）→ 干净。
    # 注意：旧版本这里写反了（断言「不能用 CREATE_NO_WINDOW」），那条结论是错的 ——
    # 真正不能给的是 `DETACHED_PROCESS | CREATE_NO_WINDOW` 这个**组合**
    # （CreateProcess 会报 invalid argument），不是 CREATE_NO_WINDOW 本身。
    # 断言挂在 runner 自己的自检条目上，这样「改了实现却忘了改自检」也会被兜住。
    assert 'ok("起桥用 CREATE_NO_WINDOW（隐藏控制台，不弹黑窗）"' in runner
    assert 'ok("起桥不再用 DETACHED_PROCESS（它会新分配可见控制台）"' in runner
    # 探活只认 200/403：本机代理会在端口上应答 502，那种「有响应但不通」不算就绪。
    assert "def port_serving(" in runner
    # 桥起不来时的报错必须把「手动双击哪个文件」写清楚，别只说「起不来」。
    assert "LAUNCHER_SCRIPT} 手动起" in runner
    assert "selftest" in runner


def test_action_placeholders_expand_to_an_existing_interpreter() -> None:
    """动作参数里的 {console_root} 必须能真的展开。

    真实服务日志里出现过「模块参数包含未知占位符：{console_root}\\backend\\.venv\\Scripts\\python.exe」——
    占位符当初只在 projectRoot 里被替换，动作参数里没有，模块一点就崩。这里拿真 manifest 兜住。
    """
    registry = ModuleRegistry(ROOT / "backend" / "modules")
    module = registry.load()["runner-lab"]
    runner = ModuleRunner.__new__(ModuleRunner)  # 只测变量拼装，不碰数据库 / 事件循环
    runner.registry = registry
    values = runner._run_values(module, Path("run"))

    assert values["console_root"] == str(registry.console_root)

    program = ModuleRunner._expand(module.actions["run"].program, values)
    expanded_args = [ModuleRunner._expand(arg, values) for arg in module.actions["run"].args]

    assert Path(program).is_file(), program
    assert all("{" not in arg for arg in expanded_args)


def test_project_root_supports_relative_path_next_to_console() -> None:
    """projectRoot 支持相对路径，且相对 console 根解析（不是相对服务进程 cwd）。

    模块项目仓库约定 clone 在 console 的同级目录（如 "..\\run-analytics"），
    这样模块可以是独立 git 仓库而 manifest 不写死盘符。相对路径若按
    cwd 解析，结果取决于谁拉起服务——不可接受，必须锚定 console 根。
    """
    registry = ModuleRegistry(ROOT / "backend" / "modules")
    module = registry.load()["runner-lab"]
    assert module.project_root == (ROOT.parent / "run-analytics").resolve()
