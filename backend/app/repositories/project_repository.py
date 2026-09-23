from __future__ import annotations

from contextlib import contextmanager
import sqlite3
from typing import Any

from ..db import Database


class ProjectRepository:
    """Keep project, task, and record SQL separate from HTTP and business rules."""

    def __init__(self, db: Database) -> None:
        self.db = db

    def list_projects(self) -> list[dict[str, Any]]:
        return self.db.fetch_all("SELECT * FROM projects ORDER BY sort_order, created_at, id")

    def find_project(self, project_id: str) -> dict[str, Any] | None:
        return self.db.fetch_one("SELECT * FROM projects WHERE id=?", (project_id,))

    def find_project_by_name(self, name: str, *, excluding_id: str | None = None) -> dict[str, Any] | None:
        if excluding_id is None:
            return self.db.fetch_one("SELECT id FROM projects WHERE name=?", (name,))
        return self.db.fetch_one(
            "SELECT id FROM projects WHERE name=? AND id<>?", (name, excluding_id)
        )

    def insert_project(
        self,
        project_id: str,
        name: str,
        description: str,
        status: str,
        now: str,
    ) -> None:
        # 新项目排在末尾：拖拽排序决定的是已有项目的先后，不抢别人已经排好的位置
        self.db.execute(
            "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) "
            "VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM projects))",
            (project_id, name, description, status, now, now),
        )

    @staticmethod
    def set_project_order_in_transaction(
        conn: sqlite3.Connection, ordered_ids: list[str]
    ) -> None:
        for index, project_id in enumerate(ordered_ids):
            conn.execute("UPDATE projects SET sort_order=? WHERE id=?", (index, project_id))

    def update_project(self, project_id: str, name: str, description: str, status: str, now: str) -> None:
        self.db.execute(
            "UPDATE projects SET name=?,description=?,status=?,updated_at=? WHERE id=?",
            (name, description, status, now, project_id),
        )

    def count_projects(self) -> int:
        row = self.db.fetch_one("SELECT COUNT(*) AS count FROM projects") or {"count": 0}
        return int(row["count"])

    def has_active_run(self, project_id: str) -> bool:
        return self.db.fetch_one(
            "SELECT id FROM runs WHERE project_id=? AND status IN ('queued','running') LIMIT 1",
            (project_id,),
        ) is not None

    def has_active_execution(self, project_id: str) -> bool:
        return self.db.fetch_one(
            "SELECT id FROM project_executions WHERE project_id=? AND status IN ('queued','running') LIMIT 1",
            (project_id,),
        ) is not None

    def project_delete_counts(self, project_id: str) -> dict[str, int]:
        tables = {
            "taskCount": "tasks",
            "noteCount": "notes",
            "moduleBindingCount": "project_modules",
            "runCount": "runs",
        }
        return {
            name: int((self.db.fetch_one(
                f"SELECT COUNT(*) AS count FROM {table} WHERE project_id=?", (project_id,)
            ) or {"count": 0})["count"])
            for name, table in tables.items()
        }

    def delete_project(self, project_id: str) -> None:
        self.db.execute("DELETE FROM projects WHERE id=?", (project_id,))

    def list_tasks(self, project_id: str) -> list[dict[str, Any]]:
        return self.db.fetch_all(
            "SELECT * FROM tasks WHERE project_id=? ORDER BY created_at, id", (project_id,)
        )

    def find_task(self, task_id: str) -> dict[str, Any] | None:
        return self.db.fetch_one("SELECT * FROM tasks WHERE id=?", (task_id,))

    def insert_task(
        self,
        task_id: str,
        project_id: str,
        title: str,
        due_date: str | None,
        priority: str,
        kind: str,
        now: str,
    ) -> None:
        self.db.execute(
            "INSERT INTO tasks(id,project_id,title,due_date,priority,kind,completed,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,0,?,?)",
            (task_id, project_id, title, due_date, priority, kind, now, now),
        )

    def update_task(
        self,
        task_id: str,
        title: str,
        due_date: str | None,
        priority: str,
        kind: str,
        completed: bool,
        now: str,
    ) -> None:
        self.db.execute(
            "UPDATE tasks SET title=?,due_date=?,priority=?,kind=?,completed=?,updated_at=? WHERE id=?",
            (title, due_date, priority, kind, int(completed), now, task_id),
        )

    def delete_task(self, task_id: str) -> None:
        self.db.execute("DELETE FROM tasks WHERE id=?", (task_id,))

    def list_notes(self, project_id: str) -> list[dict[str, Any]]:
        return self.db.fetch_all(
            "SELECT * FROM notes WHERE project_id=? ORDER BY pinned DESC,updated_at DESC,id",
            (project_id,),
        )

    def find_note(self, note_id: str) -> dict[str, Any] | None:
        return self.db.fetch_one("SELECT * FROM notes WHERE id=?", (note_id,))

    def insert_note(
        self,
        note_id: str,
        project_id: str,
        title: str,
        tag: str,
        body: str,
        pinned: bool,
        links_json: str,
        now: str,
    ) -> None:
        self.db.execute(
            "INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (note_id, project_id, title, tag, body, int(pinned), links_json, now, now),
        )

    def update_note(
        self,
        note_id: str,
        title: str,
        tag: str,
        body: str,
        pinned: bool,
        links_json: str,
        now: str,
    ) -> None:
        self.db.execute(
            "UPDATE notes SET title=?,tag=?,body=?,pinned=?,links_json=?,updated_at=? WHERE id=?",
            (title, tag, body, int(pinned), links_json, now, note_id),
        )

    def delete_note(self, note_id: str) -> None:
        self.db.execute("DELETE FROM notes WHERE id=?", (note_id,))

    @contextmanager
    def transaction(self):
        with self.db.connect() as conn:
            yield conn

    @staticmethod
    def active_tasks_in_transaction(
        conn: sqlite3.Connection, project_id: str
    ) -> dict[str, dict[str, Any]]:
        return {
            row["id"]: dict(row)
            for row in conn.execute(
                "SELECT * FROM tasks WHERE project_id=? AND completed=0", (project_id,)
            ).fetchall()
        }

    @staticmethod
    def update_task_in_transaction(
        conn: sqlite3.Connection,
        task_id: str,
        title: str,
        due_date: str | None,
        priority: str,
        kind: str,
        now: str,
    ) -> None:
        conn.execute(
            "UPDATE tasks SET title=?,due_date=?,priority=?,kind=?,updated_at=? WHERE id=?",
            (title, due_date, priority, kind, now, task_id),
        )

    @staticmethod
    def insert_task_in_transaction(
        conn: sqlite3.Connection,
        task_id: str,
        project_id: str,
        title: str,
        due_date: str | None,
        priority: str,
        kind: str,
        now: str,
    ) -> None:
        conn.execute(
            "INSERT INTO tasks(id,project_id,title,due_date,priority,kind,completed,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,0,?,?)",
            (task_id, project_id, title, due_date, priority, kind, now, now),
        )

    @staticmethod
    def delete_tasks_in_transaction(conn: sqlite3.Connection, task_ids: set[str]) -> None:
        for task_id in task_ids:
            conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))

    @staticmethod
    def notes_in_transaction(
        conn: sqlite3.Connection, project_id: str
    ) -> dict[str, dict[str, Any]]:
        return {
            row["id"]: dict(row)
            for row in conn.execute(
                "SELECT * FROM notes WHERE project_id=?", (project_id,)
            ).fetchall()
        }

    @staticmethod
    def update_note_metadata_in_transaction(
        conn: sqlite3.Connection, note_id: str, title: str, tag: str, now: str
    ) -> None:
        conn.execute(
            "UPDATE notes SET title=?,tag=?,updated_at=? WHERE id=?",
            (title, tag, now, note_id),
        )

    @staticmethod
    def insert_note_in_transaction(
        conn: sqlite3.Connection,
        note_id: str,
        project_id: str,
        title: str,
        tag: str,
        now: str,
    ) -> None:
        conn.execute(
            "INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) "
            "VALUES(?,?,?,?,? ,0,'[]',?,?)",
            (note_id, project_id, title, tag, "", now, now),
        )

    @staticmethod
    def delete_notes_in_transaction(conn: sqlite3.Connection, note_ids: set[str]) -> None:
        for note_id in note_ids:
            conn.execute("DELETE FROM notes WHERE id=?", (note_id,))

    @staticmethod
    def upsert_context_in_transaction(
        conn: sqlite3.Connection,
        project_id: str,
        module: str,
        module_id: str,
        module_path: str,
        files_json: str,
        dev_status: str,
        next_step: str,
        rules_json: str,
        now: str,
    ) -> None:
        conn.execute(
            "INSERT INTO project_contexts(project_id,module,module_id,module_path,files_json,dev_status,next_step,rules_json,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(project_id) DO UPDATE SET module=excluded.module,module_id=excluded.module_id,"
            "module_path=excluded.module_path,files_json=excluded.files_json,dev_status=excluded.dev_status,"
            "next_step=excluded.next_step,rules_json=excluded.rules_json,updated_at=excluded.updated_at",
            (
                project_id,
                module,
                module_id,
                module_path,
                files_json,
                dev_status,
                next_step,
                rules_json,
                now,
            ),
        )

    @staticmethod
    def list_tasks_in_transaction(conn: sqlite3.Connection, project_id: str) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM tasks WHERE project_id=? ORDER BY created_at,id", (project_id,)
            ).fetchall()
        ]

    @staticmethod
    def list_notes_in_transaction(conn: sqlite3.Connection, project_id: str) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM notes WHERE project_id=? ORDER BY pinned DESC,updated_at DESC,id",
                (project_id,),
            ).fetchall()
        ]

    @staticmethod
    def context_in_transaction(conn: sqlite3.Connection, project_id: str) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM project_contexts WHERE project_id=?", (project_id,)
        ).fetchone()
        return dict(row) if row else None
