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


def test_runner_lab_module_opens_the_import_window() -> None:
    """跑步模块的主按钮要打开导入窗口（拖压缩包 + 输密码），且不能写死 console 路径。"""
    module_dir = ROOT / "backend" / "modules" / "runner-lab"
    manifest = json.loads((module_dir / "module.json").read_text(encoding="utf-8"))
    runner = (module_dir / "runner.py").read_text(encoding="utf-8")

    assert manifest["projectName"] == "跑步数据分析"
    assert manifest["requiresAdmin"] is False
    assert set(manifest["actions"]) == {"run", "stop", "restart"}
    for name, action in manifest["actions"].items():
        # 只有 {console_root} 能指到 console 的虚拟环境；写死绝对路径换台机器就废。
        assert action["program"] == "{console_root}\\backend\\.venv\\Scripts\\python.exe", name
        assert "--gui" in action["args"], name
    # 无界面导入仍保留给自动化用：缺密码必须立刻失败，不能停在输入提示上。
    assert "--no-prompt" in runner
    assert "timeout=IMPORT_TIMEOUT_SECONDS" in runner
    assert "EXIT_MESSAGES" in runner
    assert "pythonw.exe" in runner


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
