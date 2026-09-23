from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import Database, LATEST_SCHEMA_VERSION


def database_version(path: Path) -> int:
    with sqlite3.connect(path) as conn:
        return int(conn.execute("PRAGMA user_version").fetchone()[0])


def test_new_database_records_latest_schema_version(tmp_path: Path) -> None:
    path = tmp_path / "new.db"

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
        }
    assert {
        "projects", "tasks", "notes", "modules", "project_modules", "project_files", "runs",
        "project_executions", "execution_steps",
    } <= tables


def test_unversioned_database_is_adopted_without_losing_data(tmp_path: Path) -> None:
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '正常',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE modules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                manifest_path TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE runs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                exit_code INTEGER,
                error TEXT,
                run_dir TEXT NOT NULL
            );
            INSERT INTO projects VALUES (
                'apex', 'APEX Automation', '保留项目', '正常', '2026-09-16', '2026-09-16'
            );
            INSERT INTO modules VALUES (
                'apex-launcher', 'APEX 启动', '1.0.0', 'module.json', 1, '2026-09-16'
            );
            INSERT INTO runs VALUES (
                'run-1', 'apex', 'apex-launcher', 'succeeded', '2026-09-16',
                '2026-09-16', 0, NULL, 'runs/run-1'
            );
            """
        )

    db = Database(path)
    db.init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    assert db.fetch_one("SELECT name,description FROM projects WHERE id='apex'") == {
        "name": "APEX Automation",
        "description": "保留项目",
    }
    assert db.fetch_one("SELECT action FROM runs WHERE id='run-1'") == {"action": "run"}
    module = db.fetch_one(
        "SELECT type,description,entry,args FROM modules WHERE id='apex-launcher'"
    )
    assert module == {"type": "script", "description": "", "entry": "", "args": ""}


def test_version_one_database_adds_task_kind_with_default(tmp_path: Path) -> None:
    path = tmp_path / "version-one.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                due_date TEXT,
                priority TEXT NOT NULL DEFAULT '中',
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO tasks VALUES (
                'task-1', 'apex', '保留旧任务', '今天', '中', 0, '2026-09-16', '2026-09-16'
            );
            PRAGMA user_version = 1;
            """
        )

    db = Database(path)
    db.init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    assert db.fetch_one("SELECT title,kind FROM tasks WHERE id='task-1'") == {
        "title": "保留旧任务",
        "kind": "todo",
    }


def test_version_two_database_adds_project_notes(tmp_path: Path) -> None:
    path = tmp_path / "version-two.db"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version = 2")

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(notes)")}
    assert {"id", "project_id", "title", "tag", "body", "pinned", "links_json"} <= columns


def test_version_three_database_adds_project_context(tmp_path: Path) -> None:
    path = tmp_path / "version-three.db"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version = 3")

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(project_contexts)")}
    assert {"project_id", "module", "files_json", "rules_json", "updated_at"} <= columns


def test_version_four_database_adds_application_catalog(tmp_path: Path) -> None:
    path = tmp_path / "version-four.db"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version = 4")

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        initialized = conn.execute("SELECT initialized FROM app_catalog_meta WHERE id=1").fetchone()[0]
    assert {"applications", "app_catalog_meta"} <= tables
    assert initialized == 0


def test_version_five_database_adds_project_files(tmp_path: Path) -> None:
    path = tmp_path / "version-five.db"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version = 5")

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(project_files)")}
    assert {"id", "project_id", "name", "path", "created_at", "updated_at"} <= columns


def test_version_six_database_adds_project_execution_history(tmp_path: Path) -> None:
    path = tmp_path / "version-six.db"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA user_version = 6")

    Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    with sqlite3.connect(path) as conn:
        execution_columns = {row[1] for row in conn.execute("PRAGMA table_info(project_executions)")}
        step_columns = {row[1] for row in conn.execute("PRAGMA table_info(execution_steps)")}
    assert {"id", "project_id", "action", "status", "started_at", "finished_at", "error"} <= execution_columns
    assert {"execution_id", "sort_order", "module_id", "module_name", "action", "status", "run_id"} <= step_columns


def test_version_seven_database_adds_application_launch_targets_without_losing_rows(tmp_path: Path) -> None:
    path = tmp_path / "version-seven.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE applications (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT 'idea',
                favorite INTEGER NOT NULL DEFAULT 0,
                size_label TEXT NOT NULL DEFAULT '—',
                use_count INTEGER NOT NULL DEFAULT 0,
                last_opened_at TEXT,
                running INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO applications VALUES (
                'legacy', '旧应用', '效率', 'idea', 0, '—', 0, NULL, 0, '2026-09-20', '2026-09-20'
            );
            PRAGMA user_version = 7;
            """
        )

    db = Database(path)
    db.init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    assert db.fetch_one(
        "SELECT name,launch_path,source_key FROM applications WHERE id='legacy'"
    ) == {"name": "旧应用", "launch_path": "", "source_key": ""}


def test_version_nine_database_adds_project_order_without_reordering_existing_rows(
    tmp_path: Path,
) -> None:
    path = tmp_path / "version-nine.db"
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '正常',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT INTO projects VALUES ('b', '第二个', '', '正常', '2026-01-02', '2026-01-02');
            INSERT INTO projects VALUES ('a', '第一个', '', '正常', '2026-01-01', '2026-01-01');
            INSERT INTO projects VALUES ('c', '第三个', '', '正常', '2026-01-03', '2026-01-03');
            PRAGMA user_version = 9;
            """
        )

    db = Database(path)
    db.init()

    assert database_version(path) == LATEST_SCHEMA_VERSION
    rows = db.fetch_all("SELECT id,sort_order FROM projects ORDER BY sort_order, created_at, id")
    assert [(row["id"], row["sort_order"]) for row in rows] == [("a", 0), ("b", 1), ("c", 2)]


def test_database_newer_than_code_fails_closed(tmp_path: Path) -> None:
    path = tmp_path / "future.db"
    with sqlite3.connect(path) as conn:
        conn.execute(f"PRAGMA user_version = {LATEST_SCHEMA_VERSION + 1}")

    with pytest.raises(RuntimeError, match="高于当前程序支持"):
        Database(path).init()

    assert database_version(path) == LATEST_SCHEMA_VERSION + 1
