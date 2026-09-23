from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


SCHEMA_STATEMENTS = (
    """CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '正常',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT '中',
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'script',
    description TEXT NOT NULL DEFAULT '',
    entry TEXT NOT NULL DEFAULT '',
    args TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL,
    manifest_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
)""",
    """CREATE TABLE IF NOT EXISTS project_modules (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (project_id, module_id)
)""",
    """CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    action TEXT NOT NULL DEFAULT 'run',
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    exit_code INTEGER,
    error TEXT,
    run_dir TEXT NOT NULL
)""",
)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _migration_1_baseline(conn: sqlite3.Connection) -> None:
    """Adopt an unversioned database and bring it to the current baseline."""
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)

    if "action" not in _columns(conn, "runs"):
        conn.execute("ALTER TABLE runs ADD COLUMN action TEXT NOT NULL DEFAULT 'run'")

    module_columns = _columns(conn, "modules")
    additions = {
        "type": "TEXT NOT NULL DEFAULT 'script'",
        "description": "TEXT NOT NULL DEFAULT ''",
        "entry": "TEXT NOT NULL DEFAULT ''",
        "args": "TEXT NOT NULL DEFAULT ''",
    }
    for name, definition in additions.items():
        if name not in module_columns:
            conn.execute(f"ALTER TABLE modules ADD COLUMN {name} {definition}")


def _migration_2_task_kind(conn: sqlite3.Connection) -> None:
    """Keep the frontend's internal todo/fix distinction in persisted tasks."""
    if "kind" not in _columns(conn, "tasks"):
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo' "
            "CHECK(kind IN ('todo', 'fix'))"
        )


def _migration_3_project_notes(conn: sqlite3.Connection) -> None:
    """Persist project records separately from the browser-only prototype seed."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT '日常',
        body TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0,
        links_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )"""
    )


def _migration_4_project_context(conn: sqlite3.Connection) -> None:
    """Persist the editable project-development context and its Agent rules."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS project_contexts (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        module TEXT NOT NULL DEFAULT '',
        module_id TEXT NOT NULL DEFAULT '',
        module_path TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        dev_status TEXT NOT NULL DEFAULT '开发中',
        next_step TEXT NOT NULL DEFAULT '',
        rules_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
    )"""
    )


def _migration_5_applications(conn: sqlite3.Connection) -> None:
    """Persist the console application catalog without claiming to manage installation files."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS applications (
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
    )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS app_catalog_meta (
        id INTEGER PRIMARY KEY CHECK(id=1),
        initialized INTEGER NOT NULL DEFAULT 0
    )"""
    )
    conn.execute("INSERT OR IGNORE INTO app_catalog_meta(id,initialized) VALUES(1,0)")


def _migration_6_project_files(conn: sqlite3.Connection) -> None:
    """Track project-owned local files without taking ownership of their contents."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS project_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, path)
    )"""
    )


def _migration_7_project_executions(conn: sqlite3.Connection) -> None:
    """Store one project action and its ordered module steps separately from raw runs."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS project_executions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK(action IN ('run', 'stop', 'restart')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'stopped', 'interrupted')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT
    )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS execution_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES project_executions(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        module_name TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('run', 'stop')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'stopped', 'interrupted')),
        run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
        error TEXT
    )"""
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_executions_project_started "
        "ON project_executions(project_id, started_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_order "
        "ON execution_steps(execution_id, sort_order)"
    )


def _migration_8_application_launch_targets(conn: sqlite3.Connection) -> None:
    """Attach a verified Windows shortcut to real, launchable catalog entries."""
    columns = _columns(conn, "applications")
    if not columns:
        _migration_5_applications(conn)
        columns = _columns(conn, "applications")
    if "launch_path" not in columns:
        conn.execute("ALTER TABLE applications ADD COLUMN launch_path TEXT NOT NULL DEFAULT ''")
    if "source_key" not in columns:
        conn.execute("ALTER TABLE applications ADD COLUMN source_key TEXT NOT NULL DEFAULT ''")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_source_key "
        "ON applications(source_key) WHERE source_key<>''"
    )


def _migration_9_activity_heartbeats(conn: sqlite3.Connection) -> None:
    """Persist per-day console presence minutes for the activity heatmap."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS activity_heartbeats (
        day TEXT PRIMARY KEY,
        minutes INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    )"""
    )


def _migration_10_project_order(conn: sqlite3.Connection) -> None:
    """Persist the card order chosen by dragging cards on the project selection page."""
    columns = _columns(conn, "projects")
    if not columns:
        return
    if "sort_order" not in columns:
        conn.execute("ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
    # 旧库按原有展示顺序（created_at, id）回填，升级前后看到的顺序保持一致
    for index, row in enumerate(
        conn.execute("SELECT id FROM projects ORDER BY created_at, id").fetchall()
    ):
        conn.execute("UPDATE projects SET sort_order=? WHERE id=?", (index, row[0]))


Migration = Callable[[sqlite3.Connection], None]
MIGRATIONS: tuple[tuple[int, Migration], ...] = (
    (1, _migration_1_baseline),
    (2, _migration_2_task_kind),
    (3, _migration_3_project_notes),
    (4, _migration_4_project_context),
    (5, _migration_5_applications),
    (6, _migration_6_project_files),
    (7, _migration_7_project_executions),
    (8, _migration_8_application_launch_targets),
    (9, _migration_9_activity_heartbeats),
    (10, _migration_10_project_order),
)
LATEST_SCHEMA_VERSION = MIGRATIONS[-1][0]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def init(self) -> None:
        with self.connect() as conn:
            current = int(conn.execute("PRAGMA user_version").fetchone()[0])
            if current > LATEST_SCHEMA_VERSION:
                raise RuntimeError(
                    f"数据库版本 {current} 高于当前程序支持的 {LATEST_SCHEMA_VERSION}，拒绝启动"
                )

            conn.execute("BEGIN IMMEDIATE")
            try:
                for version, migrate in MIGRATIONS:
                    if version <= current:
                        continue
                    migrate(conn)
                    conn.execute(f"PRAGMA user_version = {version}")
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self.connect() as conn:
            conn.execute(sql, params)

    def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def transaction(self, statements: list[tuple[str, tuple[Any, ...]]]) -> None:
        with self.connect() as conn:
            for sql, params in statements:
                conn.execute(sql, params)
