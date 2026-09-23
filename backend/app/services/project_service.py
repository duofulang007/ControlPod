from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from ..db import utc_now
from ..repositories.project_repository import ProjectRepository


class ProjectServiceError(RuntimeError):
    pass


class ProjectNotFoundError(ProjectServiceError):
    pass


class ProjectConflictError(ProjectServiceError):
    pass


class TaskNotFoundError(ProjectServiceError):
    pass


class NoteNotFoundError(ProjectServiceError):
    pass


class BasicInfoValidationError(ProjectServiceError):
    pass


class ProjectOrderError(ProjectServiceError):
    pass


class ProjectService:
    """Apply project-domain rules without knowing about FastAPI requests."""

    def __init__(self, repository: ProjectRepository) -> None:
        self.repository = repository

    def list_projects(self) -> list[dict[str, Any]]:
        return self.repository.list_projects()

    def create_project(self, name: str, description: str, status: str) -> dict[str, Any]:
        clean_name = name.strip()
        if self.repository.find_project_by_name(clean_name) is not None:
            raise ProjectConflictError("已有同名项目")
        project_id = "p-" + uuid4().hex[:12]
        now = utc_now()
        self.repository.insert_project(project_id, clean_name, description.strip(), status, now)
        return self.repository.find_project(project_id) or {}

    def reorder_projects(self, ordered_ids: list[str]) -> list[dict[str, Any]]:
        """整批重排项目顺序。请求必须是**全量且唯一**的 id 列表，否则整批拒绝、不写一半。"""
        current = [row["id"] for row in self.repository.list_projects()]
        if len(ordered_ids) != len(set(ordered_ids)):
            raise ProjectOrderError("排序请求包含重复的项目")
        unknown = [item for item in ordered_ids if item not in current]
        if unknown:
            raise ProjectOrderError("排序请求包含不存在的项目")
        if len(ordered_ids) != len(current):
            raise ProjectOrderError("排序请求缺少项目，已拒绝整批写入")
        with self.repository.transaction() as conn:
            self.repository.set_project_order_in_transaction(conn, ordered_ids)
        return self.repository.list_projects()

    def update_project(
        self, project_id: str, name: str, description: str, status: str
    ) -> dict[str, Any]:
        self._project_or_raise(project_id)
        clean_name = name.strip()
        if self.repository.find_project_by_name(clean_name, excluding_id=project_id) is not None:
            raise ProjectConflictError("已有同名项目")
        self.repository.update_project(project_id, clean_name, description.strip(), status, utc_now())
        return self.repository.find_project(project_id) or {}

    def project_delete_preview(self, project_id: str) -> dict[str, Any]:
        project = self._project_or_raise(project_id)
        if self.repository.count_projects() <= 1:
            raise ProjectConflictError("至少要保留一个项目")
        if self.repository.has_active_run(project_id) or self.repository.has_active_execution(project_id):
            raise ProjectConflictError("项目仍在运行，请先关闭项目后再删除")
        return {"project": project, **self.repository.project_delete_counts(project_id)}

    def delete_project(self, project_id: str) -> dict[str, Any]:
        preview = self.project_delete_preview(project_id)
        self.repository.delete_project(project_id)
        return {"deleted": True, "projectId": project_id, **preview}

    def list_tasks(self, project_id: str) -> list[dict[str, Any]]:
        return self.repository.list_tasks(project_id)

    def create_task(
        self, project_id: str, title: str, due_date: str | None, priority: str, kind: str
    ) -> dict[str, Any]:
        self._project_or_raise(project_id)
        task_id = str(uuid4())
        self.repository.insert_task(task_id, project_id, title.strip(), due_date, priority, kind, utc_now())
        return self.repository.find_task(task_id) or {}

    def update_task(
        self,
        task_id: str,
        title: str,
        due_date: str | None,
        priority: str,
        kind: str,
        completed: bool,
    ) -> dict[str, Any]:
        if self.repository.find_task(task_id) is None:
            raise TaskNotFoundError("任务不存在")
        self.repository.update_task(
            task_id, title.strip(), due_date, priority, kind, completed, utc_now()
        )
        return self.repository.find_task(task_id) or {}

    def delete_task(self, task_id: str) -> dict[str, Any]:
        task = self.repository.find_task(task_id)
        if task is None:
            raise TaskNotFoundError("任务不存在")
        self.repository.delete_task(task_id)
        return {"deleted": True, "taskId": task_id, "projectId": task["project_id"]}

    def list_notes(self, project_id: str) -> list[dict[str, Any]]:
        return [self.note_payload(row) for row in self.repository.list_notes(project_id)]

    def create_note(
        self,
        project_id: str,
        title: str,
        tag: str,
        body: str,
        pinned: bool,
        links: list[str],
    ) -> dict[str, Any]:
        self._project_or_raise(project_id)
        note_id = str(uuid4())
        self.repository.insert_note(
            note_id,
            project_id,
            title.strip(),
            tag,
            body.strip(),
            pinned,
            json.dumps(links, ensure_ascii=False),
            utc_now(),
        )
        return self.note_payload(self.repository.find_note(note_id) or {})

    def update_note(
        self, note_id: str, title: str, tag: str, body: str, pinned: bool, links: list[str]
    ) -> dict[str, Any]:
        if self.repository.find_note(note_id) is None:
            raise NoteNotFoundError("项目记录不存在")
        self.repository.update_note(
            note_id,
            title.strip(),
            tag,
            body.strip(),
            pinned,
            json.dumps(links, ensure_ascii=False),
            utc_now(),
        )
        return self.note_payload(self.repository.find_note(note_id) or {})

    def delete_note(self, note_id: str) -> dict[str, Any]:
        note = self.repository.find_note(note_id)
        if note is None:
            raise NoteNotFoundError("项目记录不存在")
        self.repository.delete_note(note_id)
        return {"deleted": True, "noteId": note_id, "projectId": note["project_id"]}

    def save_basic_info(
        self,
        project_id: str,
        *,
        module: str,
        module_id: str,
        module_path: str,
        files: list[str],
        dev_status: str,
        next_step: str,
        rules: list[str],
        tasks: list[dict[str, Any]],
        notes: list[dict[str, Any]],
        drop_extras: bool,
    ) -> dict[str, Any]:
        self._project_or_raise(project_id)
        now = utc_now()
        with self.repository.transaction() as conn:
            active_tasks = self.repository.active_tasks_in_transaction(conn, project_id)
            requested_tasks: set[str] = set()
            for item in tasks:
                task_id = item.get("id")
                if task_id:
                    if task_id in requested_tasks or task_id not in active_tasks:
                        raise BasicInfoValidationError("基本资料包含无效或重复的任务")
                    requested_tasks.add(task_id)
                    self.repository.update_task_in_transaction(
                        conn,
                        task_id,
                        str(item["title"]).strip(),
                        item.get("due_date"),
                        str(item["priority"]),
                        str(item["kind"]),
                        now,
                    )
                else:
                    self.repository.insert_task_in_transaction(
                        conn,
                        str(uuid4()),
                        project_id,
                        str(item["title"]).strip(),
                        item.get("due_date"),
                        str(item["priority"]),
                        str(item["kind"]),
                        now,
                    )
            if drop_extras:
                self.repository.delete_tasks_in_transaction(conn, set(active_tasks) - requested_tasks)

            active_notes = self.repository.notes_in_transaction(conn, project_id)
            requested_notes: set[str] = set()
            for item in notes:
                note_id = item.get("id")
                if note_id:
                    if note_id in requested_notes or note_id not in active_notes:
                        raise BasicInfoValidationError("基本资料包含无效或重复的项目记录")
                    requested_notes.add(note_id)
                    self.repository.update_note_metadata_in_transaction(
                        conn, note_id, str(item["title"]).strip(), str(item["tag"]), now
                    )
                else:
                    self.repository.insert_note_in_transaction(
                        conn, str(uuid4()), project_id, str(item["title"]).strip(), str(item["tag"]), now
                    )
            if drop_extras:
                self.repository.delete_notes_in_transaction(conn, set(active_notes) - requested_notes)

            self.repository.upsert_context_in_transaction(
                conn,
                project_id,
                module.strip(),
                module_id.strip(),
                module_path.strip(),
                json.dumps(files, ensure_ascii=False),
                dev_status.strip(),
                next_step.strip(),
                json.dumps(rules, ensure_ascii=False),
                now,
            )
            saved_tasks = self.repository.list_tasks_in_transaction(conn, project_id)
            saved_notes = [
                self.note_payload(row)
                for row in self.repository.list_notes_in_transaction(conn, project_id)
            ]
            context = self.context_payload(
                self.repository.context_in_transaction(conn, project_id) or {}
            )
        return {"context": context, "tasks": saved_tasks, "notes": saved_notes}

    @staticmethod
    def note_payload(row: dict[str, Any]) -> dict[str, Any]:
        value = dict(row)
        raw_links = value.pop("links_json", "[]")
        try:
            links = json.loads(raw_links)
        except (TypeError, json.JSONDecodeError):
            links = []
        value["links"] = [str(item) for item in links if isinstance(item, str)] if isinstance(links, list) else []
        return value

    @staticmethod
    def context_payload(row: dict[str, Any]) -> dict[str, Any]:
        value = dict(row)
        for source, target in (("files_json", "files"), ("rules_json", "rules")):
            raw = value.pop(source, "[]")
            try:
                parsed = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                parsed = []
            value[target] = [str(item) for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []
        return value

    def _project_or_raise(self, project_id: str) -> dict[str, Any]:
        project = self.repository.find_project(project_id)
        if project is None:
            raise ProjectNotFoundError("项目不存在")
        return project
