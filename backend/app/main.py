from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Callable, Literal
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config
from .application_scanner import ApplicationScanError, extract_windows_icon_png, scan_windows_applications
from .db import Database, utc_now
from .execution_service import ExecutionService
from .module_registry import ModuleRegistry
from .module_runner import ModuleRunner
from .repositories.project_repository import ProjectRepository
from .startup_manager import StartupRegistrationError, WindowsStartupManager
from .window_manager import ConsoleWindowError, ConsoleWindowManager
from .services.project_service import (
    BasicInfoValidationError,
    NoteNotFoundError,
    ProjectConflictError,
    ProjectNotFoundError,
    ProjectService,
    TaskNotFoundError,
)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: str | None = Field(default=None, max_length=32)
    priority: str = Field(default="中", pattern="^(高|中|低)$")
    kind: Literal["todo", "fix"] = "todo"


class TaskUpdate(TaskCreate):
    completed: bool


class NoteWrite(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    tag: str = Field(default="日常", pattern="^(日常|技术|复盘|灵感)$")
    body: str = Field(default="", max_length=20000)
    pinned: bool = False
    links: list[str] = Field(default_factory=list)


class BasicInfoTaskWrite(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    due_date: str | None = Field(default=None, max_length=32)
    priority: str = Field(default="中", pattern="^(高|中|低)$")
    kind: Literal["todo", "fix"] = "todo"


class BasicInfoNoteWrite(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    tag: str = Field(default="日常", pattern="^(日常|技术|复盘|灵感)$")


class ProjectBasicInfoWrite(BaseModel):
    module: str = Field(default="", max_length=200)
    module_id: str = Field(default="", max_length=200)
    module_path: str = Field(default="", max_length=2000)
    files: list[str] = Field(default_factory=list, max_length=200)
    dev_status: str = Field(default="开发中", max_length=80)
    next_step: str = Field(default="", max_length=1000)
    rules: list[str] = Field(default_factory=list, max_length=100)
    tasks: list[BasicInfoTaskWrite] = Field(default_factory=list, max_length=1000)
    notes: list[BasicInfoNoteWrite] = Field(default_factory=list, max_length=1000)
    drop_extras: bool = False


class ApplicationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="idea", max_length=80)
    favorite: bool = False
    size_label: str = Field(default="—", max_length=80)
    use_count: int = Field(default=0, ge=0)
    last_opened_at: str | None = Field(default=None, max_length=64)
    running: bool = False


class ScannedApplicationCreate(BaseModel):
    scan_id: str = Field(min_length=1, max_length=80, pattern="^scan-[a-f0-9]+$")
    name: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=80)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    status: str = Field(default="开发中", pattern="^(正常|开发中|已暂停)$")


class ProjectFileCreate(BaseModel):
    path: str = Field(min_length=1, max_length=4000)


class WebModuleWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(default="web", pattern="^web$")
    description: str = Field(default="", max_length=500)
    entry: str = Field(min_length=1, max_length=2048)


class ProjectExecutionRequest(BaseModel):
    action: Literal["run", "stop", "restart"] = "run"


class StartupSettingWrite(BaseModel):
    enabled: bool


class WindowTopmostWrite(BaseModel):
    enabled: bool


def normalized_web_url(value: str) -> str:
    url = value.strip()
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=422, detail="网站地址必须是完整的 http:// 或 https:// 地址")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="网站地址不能包含用户名或密码")
    return url


def open_windows_application(path: str) -> None:
    if os.name != "nt":
        raise OSError("本机应用启动仅支持 Windows")
    os.startfile(path)  # type: ignore[attr-defined]


def create_app(
    *,
    db_path: Path | None = None,
    modules_dir: Path | None = None,
    runs_dir: Path | None = None,
    static_root: Path | None = config.PROJECT_DIR,
    application_scanner: Callable[[], list[dict[str, str]]] | None = None,
    application_opener: Callable[[str], None] | None = None,
    application_icon_reader: Callable[[str], bytes | None] | None = None,
    startup_manager: WindowsStartupManager | None = None,
    window_manager: ConsoleWindowManager | None = None,
) -> FastAPI:
    db = Database(db_path or config.DB_PATH)
    db.init()
    registry = ModuleRegistry(modules_dir or config.MODULES_DIR)
    registry.load()
    scan_local_applications = application_scanner or scan_windows_applications
    open_local_application = application_opener or open_windows_application
    read_application_icon = application_icon_reader or extract_windows_icon_png
    local_startup_manager = startup_manager or WindowsStartupManager()
    local_window_manager = window_manager or ConsoleWindowManager()

    def local_application_rows() -> list[dict[str, str]]:
        rows = scan_local_applications()
        return [dict(row) for row in rows if row.get("id") and row.get("launch_path")]

    def resolve_saved_application(app_id: str) -> tuple[dict, dict[str, str]]:
        stored = db.fetch_one("SELECT * FROM applications WHERE id=?", (app_id,))
        if stored is None:
            raise LookupError("应用不存在")
        if not stored.get("source_key") or not stored.get("launch_path"):
            raise ValueError("这个旧应用没有真实启动入口，请从本机扫描结果重新添加")
        candidate = next(
            (row for row in local_application_rows() if row["id"] == stored["source_key"]),
            None,
        )
        if candidate is None or candidate["launch_path"] != stored["launch_path"]:
            raise RuntimeError("应用启动入口已失效，请移除后重新扫描")
        return stored, candidate

    def launch_saved_application(app_id: str) -> dict:
        _, candidate = resolve_saved_application(app_id)
        open_local_application(candidate["launch_path"])
        now = utc_now()
        db.execute(
            "UPDATE applications SET use_count=use_count+1,last_opened_at=?,updated_at=? WHERE id=?",
            (now, now, app_id),
        )
        return db.fetch_one("SELECT * FROM applications WHERE id=?", (app_id,)) or {}

    runner = ModuleRunner(
        db,
        registry,
        runs_dir or config.RUNS_DIR,
        application_resolver=lambda app_id: resolve_saved_application(app_id)[1],
        application_launcher=launch_saved_application,
    )
    runner.sync_registry()
    execution_service = ExecutionService(db, runner)
    execution_service.recover_interrupted()
    project_service = ProjectService(ProjectRepository(db))

    app = FastAPI(title="Apex Console API", version="0.1.0")
    app.state.db = db
    app.state.registry = registry
    app.state.runner = runner
    app.state.execution_service = execution_service
    app.state.project_service = project_service

    def note_payload(row: dict) -> dict:
        value = dict(row)
        raw_links = value.pop("links_json", "[]")
        try:
            links = json.loads(raw_links)
        except (TypeError, json.JSONDecodeError):
            links = []
        value["links"] = [str(item) for item in links if isinstance(item, str)] if isinstance(links, list) else []
        return value

    def context_payload(row: dict) -> dict:
        value = dict(row)
        for source, target in (("files_json", "files"), ("rules_json", "rules")):
            raw = value.pop(source, "[]")
            try:
                parsed = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                parsed = []
            value[target] = [str(item) for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []
        return value

    def application_payload(row: dict) -> dict:
        value = dict(row)
        launch_path = str(value.pop("launch_path", "") or "")
        source_key = str(value.pop("source_key", "") or "")
        if source_key:
            value["icon"] = f"native:{source_key}"
        value["favorite"] = bool(value.get("favorite"))
        value["running"] = bool(value.get("running"))
        value["launchable"] = bool(launch_path)
        return value

    def scanned_application_rows() -> list[dict[str, str]]:
        try:
            return local_application_rows()
        except ApplicationScanError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=503, detail=f"本机应用扫描失败：{exc}") from exc

    def application_module_id(app_id: str) -> str:
        return f"application:{app_id}"

    def project_file_payload(row: dict) -> dict:
        return dict(row)

    def project_service_response(operation):
        try:
            return operation()
        except (ProjectNotFoundError, TaskNotFoundError, NoteNotFoundError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except BasicInfoValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ProjectConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    def registered_local_file(path_value: str) -> Path:
        candidate = Path(path_value.strip()).expanduser()
        if not candidate.is_absolute():
            raise HTTPException(status_code=422, detail="文件路径必须是本机绝对路径")
        try:
            resolved = candidate.resolve(strict=True)
        except OSError as exc:
            raise HTTPException(status_code=422, detail="文件不存在或无法访问") from exc
        if not resolved.is_file():
            raise HTTPException(status_code=422, detail="只能添加本机文件，不能添加文件夹")
        return resolved

    @app.middleware("http")
    async def no_stale_frontend_cache(request: Request, call_next):
        entry_paths = {"/", "/index.html", "/app.js", "/styles.css"}
        if request.url.path in entry_paths:
            request.scope["headers"] = [
                (key, value)
                for key, value in request.scope.get("headers", [])
                if key.lower() not in {b"if-none-match", b"if-modified-since"}
            ]
        response = await call_next(request)
        if request.url.path in entry_paths:
            response.headers["Cache-Control"] = "no-store"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["null", "http://127.0.0.1:8765", "http://localhost:8765"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "service": "apex-console", "version": "0.1.0"}

    @app.get("/api/settings/startup")
    def startup_status() -> dict:
        try:
            return local_startup_manager.status()
        except StartupRegistrationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.put("/api/settings/startup")
    def update_startup_setting(payload: StartupSettingWrite) -> dict:
        try:
            return local_startup_manager.set_enabled(payload.enabled)
        except StartupRegistrationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/window")
    def console_window_status() -> dict:
        try:
            return local_window_manager.status()
        except ConsoleWindowError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.put("/api/window/topmost")
    def update_console_window_topmost(payload: WindowTopmostWrite) -> dict:
        try:
            return local_window_manager.set_topmost(payload.enabled)
        except ConsoleWindowError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.get("/api/bootstrap")
    def bootstrap() -> dict:
        projects = db.fetch_all("SELECT * FROM projects ORDER BY created_at, id")
        tasks = db.fetch_all("SELECT * FROM tasks ORDER BY created_at, id")
        notes = [note_payload(row) for row in db.fetch_all(
            "SELECT * FROM notes ORDER BY pinned DESC,updated_at DESC,id"
        )]
        contexts = [context_payload(row) for row in db.fetch_all("SELECT * FROM project_contexts")]
        project_files = [project_file_payload(row) for row in db.fetch_all(
            "SELECT * FROM project_files ORDER BY created_at,id"
        )]
        applications = [application_payload(row) for row in db.fetch_all(
            "SELECT * FROM applications ORDER BY use_count DESC,name,id"
        )]
        modules = db.fetch_all(
            "SELECT * FROM modules WHERE enabled=1 AND type<>'application' ORDER BY name,id"
        )
        bindings = db.fetch_all(
            "SELECT pm.* FROM project_modules pm JOIN modules m ON m.id=pm.module_id "
            "WHERE pm.enabled=1 AND m.enabled=1 AND m.type<>'application' "
            "ORDER BY pm.project_id,pm.sort_order"
        )
        application_bindings = db.fetch_all(
            "SELECT pm.project_id,a.id AS application_id,m.id AS module_id,pm.sort_order,pm.enabled "
            "FROM project_modules pm JOIN modules m ON m.id=pm.module_id "
            "JOIN applications a ON a.id=m.entry "
            "WHERE pm.enabled=1 AND m.enabled=1 AND m.type='application' "
            "ORDER BY pm.project_id,pm.sort_order"
        )
        executions = db.fetch_all(
            "SELECT id,project_id,action,status,started_at,finished_at,error FROM project_executions "
            "WHERE action<>'stop'"
        )
        legacy_runs = db.fetch_all(
            "SELECT r.id,r.project_id,r.action,r.status,r.started_at,r.finished_at,r.error FROM runs r "
            "WHERE r.action<>'stop' AND NOT EXISTS "
            "(SELECT 1 FROM execution_steps es WHERE es.run_id=r.id)"
        )
        runs = sorted(executions + legacy_runs, key=lambda item: (item["started_at"], item["id"]), reverse=True)
        project_runs = []
        execution_rows = db.fetch_all(
            "SELECT id,project_id,action,status,started_at,finished_at,error FROM project_executions "
            "ORDER BY started_at DESC,id DESC"
        )
        project_executions = []
        for project in projects:
            history = [run for run in runs if run["project_id"] == project["id"]]
            execution_history = [row for row in execution_rows if row["project_id"] == project["id"]]
            latest_execution = (
                execution_service.get_execution(execution_history[0]["id"])
                if execution_history else None
            )
            active_execution = next(
                (row for row in execution_history if row["status"] in {"queued", "running"}), None
            )
            project_runs.append(
                {
                    "project_id": project["id"],
                    "run_count": len(history),
                    "last_run_at": history[0]["started_at"] if history else None,
                    "recent": [
                        {key: run[key] for key in ("id", "action", "status", "started_at", "finished_at", "error")}
                        for run in history[:3]
                    ],
                }
            )
            project_executions.append(
                {
                    "project_id": project["id"],
                    "active": execution_service.get_execution(active_execution["id"]) if active_execution else None,
                    "latest": latest_execution,
                    "recent": execution_history[:3],
                }
            )
        return {
            "projects": projects,
            "tasks": tasks,
            "notes": notes,
            "projectContexts": contexts,
            "projectFiles": project_files,
            "applications": applications,
            "modules": modules,
            "projectModules": bindings,
            "projectApplications": application_bindings,
            "projectRuns": project_runs,
            "projectExecutions": project_executions,
        }

    @app.get("/api/projects")
    def list_projects() -> list[dict]:
        return project_service.list_projects()

    @app.post("/api/projects", status_code=201)
    def create_project(payload: ProjectCreate) -> dict:
        return project_service_response(
            lambda: project_service.create_project(
                payload.name, payload.description, payload.status
            )
        )

    @app.patch("/api/projects/{project_id}")
    def update_project(project_id: str, payload: ProjectCreate) -> dict:
        return project_service_response(
            lambda: project_service.update_project(
                project_id, payload.name, payload.description, payload.status
            )
        )

    def project_delete_preview(project_id: str) -> dict:
        return project_service_response(lambda: project_service.project_delete_preview(project_id))

    @app.get("/api/projects/{project_id}/delete-preview")
    def preview_project_delete(project_id: str) -> dict:
        return project_delete_preview(project_id)

    @app.delete("/api/projects/{project_id}")
    def delete_project(project_id: str) -> dict:
        # Foreign-key cascades delete the project's tasks, file registrations, module bindings, and every run record atomically.
        return project_service_response(lambda: project_service.delete_project(project_id))

    @app.get("/api/projects/{project_id}/files")
    def list_project_files(project_id: str) -> list[dict]:
        if db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        return [project_file_payload(row) for row in db.fetch_all(
            "SELECT * FROM project_files WHERE project_id=? ORDER BY created_at,id", (project_id,)
        )]

    @app.post("/api/projects/{project_id}/files", status_code=201)
    def register_project_file(project_id: str, payload: ProjectFileCreate) -> dict:
        if db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        file_path = registered_local_file(payload.path)
        stored_path = str(file_path)
        existing = db.fetch_one(
            "SELECT * FROM project_files WHERE project_id=? AND path=?", (project_id, stored_path)
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="这个文件已在当前项目中")
        file_id = "pf-" + uuid4().hex[:12]
        now = utc_now()
        db.execute(
            "INSERT INTO project_files(id,project_id,name,path,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (file_id, project_id, file_path.name, stored_path, now, now),
        )
        return project_file_payload(
            db.fetch_one("SELECT * FROM project_files WHERE id=?", (file_id,)) or {}
        )

    def project_file_delete_preview(file_id: str) -> dict:
        item = db.fetch_one("SELECT * FROM project_files WHERE id=?", (file_id,))
        if item is None:
            raise HTTPException(status_code=404, detail="项目文件不存在")
        return {"file": project_file_payload(item), "keepsLocalFile": True}

    @app.get("/api/project-files/{file_id}/delete-preview")
    def preview_project_file_delete(file_id: str) -> dict:
        return project_file_delete_preview(file_id)

    @app.delete("/api/project-files/{file_id}")
    def delete_project_file(file_id: str) -> dict:
        preview = project_file_delete_preview(file_id)
        db.execute("DELETE FROM project_files WHERE id=?", (file_id,))
        return {"deleted": True, "fileId": file_id, **preview}

    @app.post("/api/project-files/{file_id}/open")
    def open_project_file(file_id: str) -> dict:
        item = db.fetch_one("SELECT * FROM project_files WHERE id=?", (file_id,))
        if item is None:
            raise HTTPException(status_code=404, detail="项目文件不存在")
        file_path = Path(item["path"])
        if not file_path.is_file():
            raise HTTPException(status_code=409, detail="这个文件已不存在或无法访问")
        try:
            os.startfile(str(file_path))
        except OSError as exc:
            raise HTTPException(status_code=409, detail="系统无法打开这个文件") from exc
        return {"opened": True, "fileId": file_id, "name": item["name"]}

    @app.get("/api/projects/{project_id}/tasks")
    def list_tasks(project_id: str) -> list[dict]:
        return project_service.list_tasks(project_id)

    @app.post("/api/projects/{project_id}/tasks", status_code=201)
    def create_task(project_id: str, payload: TaskCreate) -> dict:
        return project_service_response(
            lambda: project_service.create_task(
                project_id, payload.title, payload.due_date, payload.priority, payload.kind
            )
        )

    @app.patch("/api/tasks/{task_id}")
    def update_task(task_id: str, payload: TaskUpdate) -> dict:
        return project_service_response(
            lambda: project_service.update_task(
                task_id,
                payload.title,
                payload.due_date,
                payload.priority,
                payload.kind,
                payload.completed,
            )
        )

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: str) -> dict:
        return project_service_response(lambda: project_service.delete_task(task_id))

    @app.get("/api/projects/{project_id}/notes")
    def list_notes(project_id: str) -> list[dict]:
        return project_service.list_notes(project_id)

    @app.post("/api/projects/{project_id}/notes", status_code=201)
    def create_note(project_id: str, payload: NoteWrite) -> dict:
        return project_service_response(
            lambda: project_service.create_note(
                project_id, payload.title, payload.tag, payload.body, payload.pinned, payload.links
            )
        )

    @app.patch("/api/notes/{note_id}")
    def update_note(note_id: str, payload: NoteWrite) -> dict:
        return project_service_response(
            lambda: project_service.update_note(
                note_id, payload.title, payload.tag, payload.body, payload.pinned, payload.links
            )
        )

    @app.delete("/api/notes/{note_id}")
    def delete_note(note_id: str) -> dict:
        return project_service_response(lambda: project_service.delete_note(note_id))

    @app.put("/api/projects/{project_id}/basic-info")
    def save_project_basic_info(project_id: str, payload: ProjectBasicInfoWrite) -> dict:
        task_items = [
            {
                "id": item.id,
                "title": item.title,
                "due_date": item.due_date,
                "priority": item.priority,
                "kind": item.kind,
            }
            for item in payload.tasks
        ]
        note_items = [{"id": item.id, "title": item.title, "tag": item.tag} for item in payload.notes]
        return project_service_response(
            lambda: project_service.save_basic_info(
                project_id,
                module=payload.module,
                module_id=payload.module_id,
                module_path=payload.module_path,
                files=payload.files,
                dev_status=payload.dev_status,
                next_step=payload.next_step,
                rules=payload.rules,
                tasks=task_items,
                notes=note_items,
                drop_extras=payload.drop_extras,
            )
        )

    def save_application_row(app_id: str, payload: ApplicationWrite) -> dict:
        name = payload.name.strip()
        duplicate = db.fetch_one(
            "SELECT id FROM applications WHERE name=? AND id<>?", (name, app_id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="应用列表里已有同名应用")
        now = utc_now()
        if db.fetch_one("SELECT id FROM applications WHERE id=?", (app_id,)) is None:
            raise HTTPException(status_code=404, detail="应用不存在")
        db.execute(
            "UPDATE applications SET name=?,category=?,icon=?,favorite=?,size_label=?,use_count=?,"
            "last_opened_at=?,running=?,updated_at=? WHERE id=?",
            (
                name, payload.category.strip(), payload.icon, int(payload.favorite), payload.size_label,
                payload.use_count, payload.last_opened_at, int(payload.running), now, app_id,
            ),
        )
        db.execute(
            "UPDATE modules SET name=?,updated_at=? WHERE type='application' AND entry=?",
            (name, now, app_id),
        )
        return application_payload(db.fetch_one("SELECT * FROM applications WHERE id=?", (app_id,)) or {})

    @app.get("/api/applications")
    def list_applications() -> list[dict]:
        return [application_payload(row) for row in db.fetch_all(
            "SELECT * FROM applications ORDER BY use_count DESC,name,id"
        )]

    @app.get("/api/applications/scan")
    def scan_applications() -> list[dict]:
        added = {
            row["source_key"]
            for row in db.fetch_all("SELECT source_key FROM applications WHERE source_key<>''")
        }
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "category": row["category"],
                "icon": row["icon"],
                "added": row["id"] in added,
            }
            for row in scanned_application_rows()
        ]

    @app.get("/api/applications/scan/{scan_id}/icon")
    def scanned_application_icon(scan_id: str) -> Response:
        candidate = next((row for row in scanned_application_rows() if row["id"] == scan_id), None)
        if candidate is None:
            raise HTTPException(status_code=404, detail="应用扫描结果已失效")
        image = read_application_icon(str(candidate.get("icon_source") or candidate["launch_path"]))
        if image:
            return Response(content=image, media_type="image/png", headers={"Cache-Control": "private, max-age=300"})
        return Response(
            content=(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E8402A"/>'
                '<path d="M10 10h12v12H10z" fill="none" stroke="white" stroke-width="2"/></svg>'
            ),
            media_type="image/svg+xml",
            headers={"Cache-Control": "private, max-age=60"},
        )

    @app.post("/api/applications/from-scan", status_code=201)
    def create_scanned_application(payload: ScannedApplicationCreate) -> dict:
        candidate = next(
            (row for row in scanned_application_rows() if row["id"] == payload.scan_id),
            None,
        )
        if candidate is None:
            raise HTTPException(status_code=404, detail="扫描结果已失效，请重新扫描")
        if db.fetch_one("SELECT id FROM applications WHERE source_key=?", (payload.scan_id,)) is not None:
            raise HTTPException(status_code=409, detail="这个应用已在列表中")
        name = (payload.name or candidate["name"]).strip()
        category = (payload.category or candidate["category"]).strip()
        if not name or not category:
            raise HTTPException(status_code=422, detail="应用名称和标签不能为空")
        duplicate = db.fetch_one("SELECT * FROM applications WHERE name=?", (name,))
        now = utc_now()
        if duplicate is not None and duplicate.get("launch_path"):
            raise HTTPException(status_code=409, detail="应用列表里已有同名应用")
        if duplicate is not None:
            app_id = duplicate["id"]
            db.execute(
                "UPDATE applications SET category=?,icon=?,size_label='本机',launch_path=?,source_key=?,updated_at=? WHERE id=?",
                (category, candidate["icon"], candidate["launch_path"], candidate["id"], now, app_id),
            )
        else:
            app_id = candidate["id"]
            db.execute(
                "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,last_opened_at,running,created_at,updated_at,launch_path,source_key) "
                "VALUES(?,?,?,?,0,'本机',0,NULL,0,?,?,?,?)",
                (
                    app_id,
                    name,
                    category,
                    candidate["icon"],
                    now,
                    now,
                    candidate["launch_path"],
                    candidate["id"],
                ),
            )
        return application_payload(db.fetch_one("SELECT * FROM applications WHERE id=?", (app_id,)) or {})

    @app.patch("/api/applications/{app_id}")
    def update_application(app_id: str, payload: ApplicationWrite) -> dict:
        return save_application_row(app_id, payload)

    @app.post("/api/applications/{app_id}/launch")
    def record_application_launch(app_id: str) -> dict:
        try:
            stored = launch_saved_application(app_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ApplicationScanError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"无法启动应用：{exc}") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return application_payload(stored)

    @app.delete("/api/applications/{app_id}")
    def delete_application(app_id: str) -> dict:
        app = db.fetch_one("SELECT * FROM applications WHERE id=?", (app_id,))
        if app is None:
            raise HTTPException(status_code=404, detail="应用不存在")
        module_id = application_module_id(app_id)
        db.transaction([
            ("DELETE FROM project_modules WHERE module_id=?", (module_id,)),
            ("UPDATE modules SET enabled=0,updated_at=? WHERE id=?", (utc_now(), module_id)),
            ("DELETE FROM applications WHERE id=?", (app_id,)),
        ])
        return {"deleted": True, "appId": app_id}

    @app.get("/api/modules")
    def list_modules() -> list[dict]:
        return db.fetch_all(
            "SELECT * FROM modules WHERE enabled=1 AND type<>'application' ORDER BY name,id"
        )

    @app.post("/api/modules", status_code=201)
    def create_web_module(payload: WebModuleWrite) -> dict:
        entry = normalized_web_url(payload.entry)
        if db.fetch_one(
            "SELECT id FROM modules WHERE type='web' AND entry=? AND enabled=1", (entry,)
        ) is not None:
            raise HTTPException(status_code=409, detail="这个网站地址已经创建过模块")
        module_id = "web-" + uuid4().hex
        now = utc_now()
        db.execute(
            "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) "
            "VALUES(?,?,?,?,?,'','1.0.0','',1,?)",
            (module_id, payload.name.strip(), "web", payload.description.strip(), entry, now),
        )
        return db.fetch_one("SELECT * FROM modules WHERE id=?", (module_id,)) or {}

    @app.patch("/api/modules/{module_id}")
    def update_web_module(module_id: str, payload: WebModuleWrite) -> dict:
        current = db.fetch_one("SELECT * FROM modules WHERE id=? AND enabled=1", (module_id,))
        if current is None:
            raise HTTPException(status_code=404, detail="模块不存在")
        if current.get("type") != "web" or current.get("manifest_path"):
            raise HTTPException(status_code=409, detail="内置执行模块不能在这里修改")
        entry = normalized_web_url(payload.entry)
        duplicate = db.fetch_one(
            "SELECT id FROM modules WHERE type='web' AND entry=? AND enabled=1 AND id<>?",
            (entry, module_id),
        )
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="这个网站地址已经创建过模块")
        db.execute(
            "UPDATE modules SET name=?,description=?,entry=?,updated_at=? WHERE id=?",
            (payload.name.strip(), payload.description.strip(), entry, utc_now(), module_id),
        )
        return db.fetch_one("SELECT * FROM modules WHERE id=?", (module_id,)) or {}

    @app.get("/api/modules/{module_id}/delete-preview")
    def preview_module_delete(module_id: str) -> dict:
        module = db.fetch_one("SELECT * FROM modules WHERE id=? AND enabled=1", (module_id,))
        if module is None:
            raise HTTPException(status_code=404, detail="模块不存在")
        projects = db.fetch_all(
            "SELECT p.id,p.name FROM project_modules pm JOIN projects p ON p.id=pm.project_id "
            "WHERE pm.module_id=? AND pm.enabled=1 ORDER BY p.name,p.id",
            (module_id,),
        )
        return {
            "module": module,
            "projects": projects,
            "deletable": module.get("type") == "web" and not module.get("manifest_path"),
        }

    @app.delete("/api/modules/{module_id}")
    def delete_web_module(module_id: str) -> dict:
        module = db.fetch_one("SELECT * FROM modules WHERE id=? AND enabled=1", (module_id,))
        if module is None:
            raise HTTPException(status_code=404, detail="模块不存在")
        if module.get("type") != "web" or module.get("manifest_path"):
            raise HTTPException(status_code=409, detail="内置执行模块不能删除")
        bindings = db.fetch_all(
            "SELECT project_id FROM project_modules WHERE module_id=? AND enabled=1", (module_id,)
        )
        db.transaction([
            ("DELETE FROM project_modules WHERE module_id=?", (module_id,)),
            ("UPDATE modules SET enabled=0,updated_at=? WHERE id=?", (utc_now(), module_id)),
        ])
        return {"deleted": True, "moduleId": module_id, "affectedProjects": len(bindings)}

    @app.put("/api/projects/{project_id}/modules/{module_id}", status_code=201)
    def bind_project_module(project_id: str, module_id: str) -> dict:
        if db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        if db.fetch_one("SELECT id FROM modules WHERE id=? AND enabled=1", (module_id,)) is None:
            raise HTTPException(status_code=404, detail="模块不存在")
        next_order = db.fetch_one(
            "SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM project_modules WHERE project_id=?",
            (project_id,),
        ) or {"next_order": 0}
        db.execute(
            "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(?,?,?,1) "
            "ON CONFLICT(project_id,module_id) DO UPDATE SET enabled=1",
            (project_id, module_id, next_order["next_order"]),
        )
        return db.fetch_one(
            "SELECT * FROM project_modules WHERE project_id=? AND module_id=?", (project_id, module_id)
        ) or {}

    @app.delete("/api/projects/{project_id}/modules/{module_id}")
    def unbind_project_module(project_id: str, module_id: str) -> dict:
        binding = db.fetch_one(
            "SELECT * FROM project_modules WHERE project_id=? AND module_id=? AND enabled=1",
            (project_id, module_id),
        )
        if binding is None:
            raise HTTPException(status_code=404, detail="项目没有使用这个模块")
        db.execute(
            "DELETE FROM project_modules WHERE project_id=? AND module_id=?", (project_id, module_id)
        )
        return {"removed": True, "projectId": project_id, "moduleId": module_id}

    @app.put("/api/projects/{project_id}/applications/{application_id}", status_code=201)
    def bind_project_application(project_id: str, application_id: str) -> dict:
        if db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        try:
            application, _ = resolve_saved_application(application_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (ApplicationScanError, OSError) as exc:
            raise HTTPException(status_code=503, detail=f"本机应用扫描失败：{exc}") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        module_id = application_module_id(application_id)
        now = utc_now()
        db.execute(
            "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) "
            "VALUES(?,?,'application','启动本机应用',?,'','1.0.0','',1,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name,type='application',"
            "description=excluded.description,entry=excluded.entry,enabled=1,updated_at=excluded.updated_at",
            (module_id, application["name"], application_id, now),
        )
        next_order = db.fetch_one(
            "SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM project_modules WHERE project_id=?",
            (project_id,),
        ) or {"next_order": 0}
        db.execute(
            "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(?,?,?,1) "
            "ON CONFLICT(project_id,module_id) DO UPDATE SET enabled=1",
            (project_id, module_id, next_order["next_order"]),
        )
        binding = db.fetch_one(
            "SELECT * FROM project_modules WHERE project_id=? AND module_id=?",
            (project_id, module_id),
        ) or {}
        return {**binding, "application_id": application_id}

    @app.delete("/api/projects/{project_id}/applications/{application_id}")
    def unbind_project_application(project_id: str, application_id: str) -> dict:
        module_id = application_module_id(application_id)
        binding = db.fetch_one(
            "SELECT * FROM project_modules WHERE project_id=? AND module_id=? AND enabled=1",
            (project_id, module_id),
        )
        if binding is None:
            raise HTTPException(status_code=404, detail="项目没有使用这个应用")
        db.execute(
            "DELETE FROM project_modules WHERE project_id=? AND module_id=?",
            (project_id, module_id),
        )
        return {
            "removed": True,
            "projectId": project_id,
            "applicationId": application_id,
            "moduleId": module_id,
        }

    async def start_execution(project_id: str, action: str) -> dict:
        try:
            return await execution_service.start(project_id, action)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/executions", status_code=202)
    async def create_project_execution(project_id: str, payload: ProjectExecutionRequest) -> dict:
        return await start_execution(project_id, payload.action)

    @app.get("/api/executions/{execution_id}")
    def get_execution(execution_id: str) -> dict:
        execution = execution_service.get_execution(execution_id)
        if execution is None:
            raise HTTPException(status_code=404, detail="项目执行记录不存在")
        return execution

    @app.post("/api/projects/{project_id}/run", status_code=202)
    async def run_project(project_id: str) -> dict:
        return await start_execution(project_id, "run")

    @app.post("/api/projects/{project_id}/stop", status_code=202)
    async def stop_project(project_id: str) -> dict:
        return await start_execution(project_id, "stop")

    @app.post("/api/projects/{project_id}/restart", status_code=202)
    async def restart_project(project_id: str) -> dict:
        return await start_execution(project_id, "restart")

    @app.get("/api/projects/{project_id}/runtime")
    def project_runtime(project_id: str) -> dict:
        if db.fetch_one("SELECT id FROM projects WHERE id=?", (project_id,)) is None:
            raise HTTPException(status_code=404, detail="项目不存在")
        latest = db.fetch_one(
            "SELECT id FROM runs WHERE project_id=? AND status='succeeded' "
            "ORDER BY finished_at DESC, id DESC LIMIT 1",
            (project_id,),
        )
        if latest is None:
            return {"state": "unknown", "runId": None, "action": None}
        run = runner.get_run(latest["id"]) or {}
        result = run.get("result") if isinstance(run.get("result"), dict) else {}
        status = result.get("status") if isinstance(result.get("status"), dict) else {}
        state = status.get("state") if status.get("state") in {"running", "stopped"} else "unknown"
        return {"state": state, "runId": run.get("id"), "action": run.get("action")}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str) -> dict:
        run = runner.get_run(run_id)
        if run is None:
            run = execution_service.legacy_run_payload(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="运行记录不存在")
        return run

    if static_root is not None and Path(static_root).is_dir():
        app.mount("/", StaticFiles(directory=Path(static_root), html=True), name="frontend")
    return app


app = create_app()
