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


def _write_external_manifest(
    project_dir: Path, module_id: str, program: str = "python"
) -> Path:
    (project_dir / ".git").mkdir(parents=True, exist_ok=True)
    apex_dir = project_dir / ".apex"
    apex_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = apex_dir / "module.json"
    manifest_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": module_id,
                "projectId": module_id,
                "projectName": "外部项目",
                "projectDescription": "来自独立仓库",
                "name": "外部项目入口",
                "version": "1.0.0",
                "projectRoot": ".",
                "actions": {
                    "run": {
                        "program": program,
                        "cwd": "{project_root}",
                        "args": ["{project_root}/tools/run.py"],
                    }
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return manifest_path


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
    """项目名必须来自 manifest，不能在总控台按具体项目写死。"""
    modules_dir = tmp_path / "modules"
    _write_manifest(
        modules_dir,
        "named",
        {"projectName": "命名项目", "projectDescription": "来自 manifest 的描述"},
    )

    create_app(db_path=tmp_path / "data" / "test.db", modules_dir=modules_dir)

    assert _project_row(tmp_path, "named") == ("命名项目", "来自 manifest 的描述")


def test_manifest_without_project_name_uses_neutral_fallback(tmp_path: Path) -> None:
    """没声明 projectName 的老清单使用通用兜底，避免绑到具体项目。"""
    modules_dir = tmp_path / "modules"
    _write_manifest(modules_dir, "plain", {})

    create_app(db_path=tmp_path / "data" / "test.db", modules_dir=modules_dir)

    assert _project_row(tmp_path, "plain") == (
        "未命名模块项目",
        "模块清单尚未声明项目说明。",
    )


def test_external_repository_manifest_registers_from_projects_root(tmp_path: Path) -> None:
    projects_dir = tmp_path / "Projects"
    console_root = projects_dir / "ControlPod"
    modules_dir = console_root / "backend" / "modules"
    external_project = projects_dir / "example-project"
    manifest_path = _write_external_manifest(external_project, "example-project")
    # 即使总控台仓库本身声明了清单，也不把枢纽自身注册成一个外部项目。
    _write_external_manifest(console_root, "controlpod-self")

    app = create_app(
        db_path=tmp_path / "data" / "test.db",
        modules_dir=modules_dir,
        projects_dir=projects_dir,
    )

    module = app.state.registry.get("example-project")
    assert module is not None
    assert app.state.registry.get("controlpod-self") is None
    assert module.manifest_path == manifest_path.resolve()
    assert module.project_root == external_project.resolve()
    assert module.actions["run"].cwd == external_project.resolve()
    assert _project_row(tmp_path, "example-project") == (
        "外部项目",
        "来自独立仓库",
    )


def test_external_module_can_expand_console_root_runtime_paths(tmp_path: Path) -> None:
    """外部项目可以调用总控台提供的运行时，但不依赖模块所在层级推断路径。"""
    projects_dir = tmp_path / "Projects"
    console_root = projects_dir / "ControlPod"
    modules_dir = console_root / "backend" / "modules"
    external_project = projects_dir / "run-analytics"
    python_path = console_root / "backend" / ".venv" / "Scripts" / "python.exe"
    python_path.parent.mkdir(parents=True)
    python_path.write_text("", encoding="utf-8")
    _write_external_manifest(
        external_project,
        "run-analytics",
        program=r"{console_root}\backend\.venv\Scripts\python.exe",
    )

    registry = ModuleRegistry(modules_dir, external_projects_root=projects_dir)
    module = registry.load()["run-analytics"]
    runner = ModuleRunner.__new__(ModuleRunner)
    runner.registry = registry
    values = runner._run_values(module, Path("run"))

    assert values["console_root"] == str(console_root.resolve())
    program = ModuleRunner._expand(module.actions["run"].program, values)
    expanded_args = [ModuleRunner._expand(arg, values) for arg in module.actions["run"].args]
    assert Path(program) == python_path.resolve()
    assert all("{" not in arg for arg in expanded_args)
