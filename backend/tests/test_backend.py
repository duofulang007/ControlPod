from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import create_app
from app.db import Database
from app.module_runner import ModuleRunner


def make_fake_module(root: Path, project_root: Path) -> None:
    module_dir = root / "fake-module"
    module_dir.mkdir(parents=True, exist_ok=True)
    worker = module_dir / "worker.py"
    worker.write_text(
        """
import json
import pathlib
import sys

result = pathlib.Path(sys.argv[1])
log = pathlib.Path(sys.argv[2])
action = sys.argv[3]
log.write_text(f'[STEP] fake {action}\\n[OK] fake {action} done\\n', encoding='utf-8')
state = 'running' if action in {'run', 'restart'} else 'stopped'
result.write_text(json.dumps({'ok': True, 'status': {'state': state}}), encoding='utf-8')
""".strip(),
        encoding="utf-8",
    )
    manifest = {
        "schemaVersion": 1,
        "id": "fake-module",
        "projectId": "apex",
        "name": "Fake Module",
        "version": "1.0.0",
        "projectRoot": str(project_root),
        "singleInstance": True,
        "timeoutSeconds": 10,
        "actions": {
            "run": {
                "program": sys.executable,
                "cwd": "{module_dir}",
                "args": [str(worker), "{result_path}", "{log_path}", "run"],
            },
            "stop": {
                "program": sys.executable,
                "cwd": "{module_dir}",
                "args": [str(worker), "{result_path}", "{log_path}", "stop"],
            },
            "restart": {
                "program": sys.executable,
                "cwd": "{module_dir}",
                "args": [str(worker), "{result_path}", "{log_path}", "restart"],
            },
        },
    }
    (module_dir / "module.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )


def make_failing_module(root: Path, project_root: Path) -> None:
    module_dir = root / "failing-module"
    module_dir.mkdir(parents=True, exist_ok=True)
    worker = module_dir / "worker.py"
    worker.write_text(
        "import sys\nprint('synthetic stderr', file=sys.stderr)\nraise SystemExit(7)\n",
        encoding="utf-8",
    )
    manifest = {
        "schemaVersion": 1,
        "id": "failing-module",
        "projectId": "apex",
        "name": "Failing Module",
        "version": "1.0.0",
        "projectRoot": str(project_root),
        "actions": {
            "run": {
                "program": sys.executable,
                "cwd": "{module_dir}",
                "args": [str(worker)],
            }
        },
    }
    (module_dir / "module.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )


def make_timeout_module(root: Path, project_root: Path) -> None:
    module_dir = root / "timeout-module"
    module_dir.mkdir(parents=True, exist_ok=True)
    worker = module_dir / "worker.py"
    worker.write_text("import time\ntime.sleep(10)\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 1, "id": "timeout-module", "projectId": "apex",
        "name": "Timeout Module", "version": "1.0.0", "projectRoot": str(project_root),
        "timeoutSeconds": 1,
        "actions": {"run": {"program": sys.executable, "cwd": "{module_dir}", "args": [str(worker)]}},
    }
    (module_dir / "module.json").write_text(json.dumps(manifest), encoding="utf-8")


def make_malformed_result_module(root: Path, project_root: Path) -> None:
    module_dir = root / "malformed-module"
    module_dir.mkdir(parents=True, exist_ok=True)
    worker = module_dir / "worker.py"
    worker.write_text(
        "import pathlib, sys\npathlib.Path(sys.argv[1]).write_text('[]', encoding='utf-8')\n",
        encoding="utf-8",
    )
    manifest = {
        "schemaVersion": 1, "id": "malformed-module", "projectId": "apex",
        "name": "Malformed Module", "version": "1.0.0", "projectRoot": str(project_root),
        "actions": {"run": {"program": sys.executable, "cwd": "{module_dir}", "args": [str(worker), "{result_path}"]}},
    }
    (module_dir / "module.json").write_text(json.dumps(manifest), encoding="utf-8")


def make_missing_cwd_module(root: Path, project_root: Path) -> None:
    module_dir = root / "missing-cwd-module"
    module_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 1, "id": "missing-cwd-module", "projectId": "apex",
        "name": "Missing Cwd Module", "version": "1.0.0", "projectRoot": str(project_root),
        "actions": {"run": {"program": sys.executable, "cwd": "{project_root}/not-here", "args": []}},
    }
    (module_dir / "module.json").write_text(json.dumps(manifest), encoding="utf-8")


def build_client(
    tmp_path: Path,
    *,
    application_scanner=None,
    application_opener=None,
    application_icon_reader=None,
) -> TestClient:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir(exist_ok=True)
    make_fake_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "data" / "test.db",
        modules_dir=modules_dir,
        runs_dir=tmp_path / "data" / "runs",
        static_root=None,
        application_scanner=application_scanner,
        application_opener=application_opener,
        application_icon_reader=application_icon_reader,
    )
    return TestClient(app)


def wait_execution(client: TestClient, execution_id: str) -> dict:
    deadline = time.monotonic() + 5
    payload: dict = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/executions/{execution_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] not in {"queued", "running"}:
            return payload
        time.sleep(0.05)
    raise AssertionError("项目执行在测试超时内未完成")


def test_bootstrap_registers_real_module_project(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.get("/api/bootstrap")
        assert response.status_code == 200
        payload = response.json()
        assert [item["id"] for item in payload["projects"]] == ["apex"]
        assert [item["id"] for item in payload["modules"]] == ["fake-module"]
        assert payload["projectModules"][0]["module_id"] == "fake-module"


def test_bootstrap_contract_restores_all_persisted_project_context(tmp_path: Path) -> None:
    project_file = tmp_path / "api-contract.txt"
    project_file.write_text("只用于接口契约测试", encoding="utf-8")
    app_candidate = {
        "id": "scan-c0ffee",
        "name": "契约应用",
        "category": "开发",
        "icon": "idea",
        "launch_path": str(tmp_path / "Contract.lnk"),
    }
    client = build_client(tmp_path, application_scanner=lambda: [app_candidate])
    with client:
        project = client.post(
            "/api/projects",
            json={"name": "接口契约项目", "description": "验证启动数据", "status": "开发中"},
        ).json()
        project_id = project["id"]
        task = client.post(
            f"/api/projects/{project_id}/tasks",
            json={"title": "恢复任务", "priority": "高", "kind": "fix"},
        ).json()
        note = client.post(
            f"/api/projects/{project_id}/notes",
            json={"title": "恢复记录", "tag": "技术", "body": "后端契约"},
        ).json()
        registered_file = client.post(
            f"/api/projects/{project_id}/files", json={"path": str(project_file)}
        ).json()
        app = client.post("/api/applications/from-scan", json={"scan_id": "scan-c0ffee"}).json()
        context = client.put(
            f"/api/projects/{project_id}/basic-info",
            json={"module": "契约模块", "rules": ["以后端成功响应为准。"]},
        ).json()["context"]

        payload = client.get("/api/bootstrap").json()
        assert set(payload) == {
            "projects", "tasks", "notes", "projectContexts", "projectFiles", "applications",
            "modules", "projectModules", "projectApplications", "projectRuns", "projectExecutions",
        }
        assert next(item for item in payload["projects"] if item["id"] == project_id) == project
        assert next(item for item in payload["tasks"] if item["id"] == task["id"])["kind"] == "fix"
        assert next(item for item in payload["notes"] if item["id"] == note["id"])["body"] == "后端契约"
        assert next(item for item in payload["projectFiles"] if item["id"] == registered_file["id"])["path"] == str(project_file)
        assert next(item for item in payload["applications"] if item["id"] == app["id"])["name"] == "契约应用"
        assert next(item for item in payload["projectContexts"] if item["project_id"] == project_id) == context

        execution = client.post(f"/api/projects/{project_id}/executions", json={"action": "run"})
        assert execution.status_code == 422  # 新项目还没有绑定可执行模块

    with build_client(tmp_path, application_scanner=lambda: [app_candidate]) as restarted:
        restored = restarted.get("/api/bootstrap").json()
        assert any(item["id"] == project_id for item in restored["projects"])
        assert any(item["id"] == task["id"] and item["kind"] == "fix" for item in restored["tasks"])
        assert any(item["id"] == note["id"] and item["body"] == "后端契约" for item in restored["notes"])
        assert any(item["id"] == registered_file["id"] for item in restored["projectFiles"])
        assert any(item["id"] == app["id"] for item in restored["applications"])
        assert any(item["project_id"] == project_id for item in restored["projectContexts"])


def test_task_survives_app_restart(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        created = client.post(
            "/api/projects/apex/tasks",
            json={
                "title": "验证持久化",
                "priority": "高",
                "due_date": "2026-09-17",
                "kind": "fix",
            },
        )
        assert created.status_code == 201

    with build_client(tmp_path) as restarted:
        tasks = restarted.get("/api/projects/apex/tasks")
        assert tasks.status_code == 200
        assert [(item["title"], item["priority"], item["kind"]) for item in tasks.json()] == [
            ("验证持久化", "高", "fix")
        ]


def test_project_file_is_registered_opened_and_unlinked_without_deleting_local_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    local_file = tmp_path / "项目说明.md"
    local_file.write_text("保留在电脑上的文件", encoding="utf-8")
    opened: list[str] = []
    monkeypatch.setattr("app.main.os.startfile", lambda value: opened.append(value))

    with build_client(tmp_path) as client:
        created = client.post("/api/projects/apex/files", json={"path": str(local_file)})
        assert created.status_code == 201
        item = created.json()
        assert item["name"] == "项目说明.md"
        assert client.get("/api/projects/apex/files").json()[0]["id"] == item["id"]
        assert client.get("/api/bootstrap").json()["projectFiles"][0]["id"] == item["id"]

        opened_response = client.post(f"/api/project-files/{item['id']}/open")
        assert opened_response.status_code == 200
        assert opened == [str(local_file.resolve())]

        preview = client.get(f"/api/project-files/{item['id']}/delete-preview")
        assert preview.status_code == 200
        assert preview.json()["keepsLocalFile"] is True
        assert client.delete(f"/api/project-files/{item['id']}").json()["deleted"] is True
        assert local_file.is_file()
        assert client.get("/api/projects/apex/files").json() == []


def test_task_kind_rejects_unknown_value(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.post(
            "/api/projects/apex/tasks",
            json={"title": "错误类型", "kind": "other"},
        )

    assert response.status_code == 422


def test_task_lifecycle_persists_updates_and_deletion(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        created = client.post(
            "/api/projects/apex/tasks",
            json={"title": "先创建", "due_date": "今天", "priority": "中", "kind": "todo"},
        )
        assert created.status_code == 201
        task_id = created.json()["id"]

        updated = client.patch(
            f"/api/tasks/{task_id}",
            json={
                "title": "已完成的待修改",
                "due_date": "本周",
                "priority": "高",
                "kind": "fix",
                "completed": True,
            },
        )
        assert updated.status_code == 200
        assert {
            key: updated.json()[key]
            for key in ("title", "due_date", "priority", "kind", "completed")
        } == {
            "title": "已完成的待修改",
            "due_date": "本周",
            "priority": "高",
            "kind": "fix",
            "completed": 1,
        }

    with build_client(tmp_path) as restarted:
        tasks = restarted.get("/api/projects/apex/tasks")
        assert tasks.status_code == 200
        assert [
            (item["id"], item["title"], item["due_date"], item["priority"], item["kind"], item["completed"])
            for item in tasks.json()
        ] == [(task_id, "已完成的待修改", "本周", "高", "fix", 1)]

        deleted = restarted.delete(f"/api/tasks/{task_id}")
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] is True
        assert restarted.get("/api/projects/apex/tasks").json() == []

        assert restarted.patch(f"/api/tasks/{task_id}", json={
            "title": "不存在", "due_date": "今天", "priority": "中", "kind": "todo", "completed": False
        }).status_code == 404
        assert restarted.delete(f"/api/tasks/{task_id}").status_code == 404


def test_project_note_lifecycle_persists_and_keeps_links(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        created = client.post(
            "/api/projects/apex/notes",
            json={
                "title": "运行观察", "tag": "技术", "body": "先验证状态", "pinned": True,
                "links": ["task-1"],
            },
        )
        assert created.status_code == 201
        note_id = created.json()["id"]
        assert {
            key: created.json()[key] for key in ("title", "tag", "body", "pinned", "links")
        } == {
            "title": "运行观察", "tag": "技术", "body": "先验证状态", "pinned": 1,
            "links": ["task-1"],
        }

        updated = client.patch(
            f"/api/notes/{note_id}",
            json={"title": "运行复盘", "tag": "复盘", "body": "状态已确认", "pinned": False, "links": []},
        )
        assert updated.status_code == 200

    with build_client(tmp_path) as restarted:
        notes = restarted.get("/api/projects/apex/notes")
        assert notes.status_code == 200
        assert [
            (item["id"], item["title"], item["tag"], item["body"], item["pinned"], item["links"])
            for item in notes.json()
        ] == [(note_id, "运行复盘", "复盘", "状态已确认", 0, [])]
        assert restarted.get("/api/bootstrap").json()["notes"][0]["id"] == note_id
        assert restarted.delete(f"/api/notes/{note_id}").json()["deleted"] is True
        assert restarted.get("/api/projects/apex/notes").json() == []


def test_project_note_rejects_unknown_tag(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        assert client.post(
            "/api/projects/apex/notes", json={"title": "错误标签", "tag": "其他"}
        ).status_code == 422


def test_basic_info_persists_context_and_updates_related_rows_atomically(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        first_task = client.post(
            "/api/projects/apex/tasks", json={"title": "旧任务", "priority": "中"}
        ).json()["id"]
        client.post("/api/projects/apex/tasks", json={"title": "待删除任务"})
        first_note = client.post(
            "/api/projects/apex/notes", json={"title": "旧记录", "tag": "日常"}
        ).json()["id"]
        client.post("/api/projects/apex/notes", json={"title": "待删除记录"})
        saved = client.put(
            "/api/projects/apex/basic-info",
            json={
                "module": "启动模块", "module_id": "apex-launcher", "module_path": "backend/modules",
                "files": ["app.js", "main.py"], "dev_status": "开发中", "next_step": "验证保存",
                "rules": ["先分析，再修改。"], "drop_extras": True,
                "tasks": [{"id": first_task, "title": "已更新任务", "due_date": "本周", "priority": "高", "kind": "todo"}],
                "notes": [{"id": first_note, "title": "已更新记录", "tag": "技术"}],
            },
        )
        assert saved.status_code == 200
        assert saved.json()["context"]["files"] == ["app.js", "main.py"]
        assert [(row["id"], row["title"]) for row in saved.json()["tasks"]] == [(first_task, "已更新任务")]
        assert [(row["id"], row["title"], row["tag"]) for row in saved.json()["notes"]] == [
            (first_note, "已更新记录", "技术")
        ]

        rejected = client.put(
            "/api/projects/apex/basic-info",
            json={
                "module": "不应写入",
                "tasks": [
                    {"id": first_task, "title": "不应部分写入"},
                    {"id": "missing", "title": "无效任务"},
                ],
                "notes": [],
            },
        )
        assert rejected.status_code == 422

    with build_client(tmp_path) as restarted:
        payload = restarted.get("/api/bootstrap").json()
        assert payload["projectContexts"] == [
            {
                "project_id": "apex", "module": "启动模块", "module_id": "apex-launcher",
                "module_path": "backend/modules", "files": ["app.js", "main.py"],
                "dev_status": "开发中", "next_step": "验证保存", "rules": ["先分析，再修改。"],
                "updated_at": payload["projectContexts"][0]["updated_at"],
            }
        ]
        assert [(row["id"], row["title"]) for row in payload["tasks"]] == [(first_task, "已更新任务")]
        assert [(row["id"], row["title"]) for row in payload["notes"]] == [(first_note, "已更新记录")]


def test_real_application_catalog_lifecycle_persists(tmp_path: Path) -> None:
    candidates = [
        {"id": "scan-e0170", "name": "编辑器", "category": "开发", "icon": "idea", "launch_path": str(tmp_path / "Editor.lnk")},
        {"id": "scan-b0b5e", "name": "浏览器", "category": "浏览", "icon": "chrome", "launch_path": str(tmp_path / "Browser.lnk")},
    ]
    opened: list[str] = []
    client = build_client(tmp_path, application_scanner=lambda: candidates, application_opener=opened.append)
    with client:
        editor = client.post("/api/applications/from-scan", json={"scan_id": "scan-e0170"}).json()
        browser = client.post("/api/applications/from-scan", json={"scan_id": "scan-b0b5e"}).json()
        assert client.post("/api/applications", json={}).status_code == 405
        assert client.post("/api/applications/import", json={"apps": []}).status_code == 405
        launched = client.post(f"/api/applications/{editor['id']}/launch")
        assert launched.status_code == 200
        assert opened == [candidates[0]["launch_path"]]
        changed = client.patch(
            f"/api/applications/{editor['id']}",
            json={
                "name": "编辑器", "category": "效率", "icon": "notion", "favorite": False,
                "size_label": "本机", "use_count": 1, "last_opened_at": launched.json()["last_opened_at"],
            },
        )
        assert changed.status_code == 200
        assert changed.json()["category"] == "效率"

    with build_client(tmp_path, application_scanner=lambda: candidates, application_opener=opened.append) as restarted:
        payload = restarted.get("/api/bootstrap").json()
        assert {(row["id"], row["category"], row["use_count"]) for row in payload["applications"]} == {
            (editor["id"], "效率", 1), (browser["id"], "浏览", 0)
        }
        assert restarted.delete(f"/api/applications/{browser['id']}").json()["deleted"] is True
        assert [row["id"] for row in restarted.get("/api/applications").json()] == [editor["id"]]


def test_scanned_application_is_added_and_really_launched(tmp_path: Path) -> None:
    shortcut = str(tmp_path / "Start Menu" / "Editor.lnk")
    candidates = [
        {
            "id": "scan-0123456789abcdef",
            "name": "真实编辑器",
            "category": "开发",
            "icon": "vscode",
            "launch_path": shortcut,
        }
    ]
    opened: list[str] = []
    client = build_client(
        tmp_path,
        application_scanner=lambda: candidates,
        application_opener=opened.append,
    )
    with client:
        scanned = client.get("/api/applications/scan")
        assert scanned.status_code == 200
        assert scanned.json() == [
            {
                "id": "scan-0123456789abcdef",
                "name": "真实编辑器",
                "category": "开发",
                "icon": "vscode",
                "added": False,
            }
        ]
        added = client.post(
            "/api/applications/from-scan",
            json={"scan_id": "scan-0123456789abcdef", "name": "我的编辑器", "category": "开发"},
        )
        assert added.status_code == 201
        assert added.json()["name"] == "我的编辑器"
        assert added.json()["launchable"] is True
        assert "launch_path" not in added.json()
        assert client.get("/api/applications/scan").json()[0]["added"] is True

        launched = client.post(f"/api/applications/{added.json()['id']}/launch")
        assert launched.status_code == 200
        assert launched.json()["use_count"] == 1
        assert opened == [shortcut]


def test_scanned_application_icon_is_served_only_for_a_current_scan_result(tmp_path: Path) -> None:
    candidates = [{
        "id": "scan-icon-0123456789", "name": "真实图标应用", "category": "效率",
        "icon": "native:scan-icon-0123456789", "icon_source": "verified-source", "launch_path": "verified-launch",
    }]
    client = build_client(
        tmp_path,
        application_scanner=lambda: candidates,
        application_icon_reader=lambda source: b"icon-bytes" if source == "verified-source" else None,
    )
    with client:
        icon = client.get("/api/applications/scan/scan-icon-0123456789/icon")
        assert icon.status_code == 200
        assert icon.headers["content-type"].startswith("image/png")
        assert icon.content == b"icon-bytes"
        assert client.get("/api/applications/scan/not-a-scan-result/icon").status_code == 404


def test_scanned_application_can_bind_to_project_and_execute(tmp_path: Path) -> None:
    shortcut = str(tmp_path / "Start Menu" / "ProjectApp.lnk")
    candidate = {
        "id": "scan-a11ca71000000001",
        "name": "项目应用",
        "category": "效率",
        "icon": "idea",
        "launch_path": shortcut,
    }
    opened: list[str] = []
    client = build_client(
        tmp_path,
        application_scanner=lambda: [candidate],
        application_opener=opened.append,
    )
    with client:
        project = client.post(
            "/api/projects", json={"name": "应用项目", "description": "", "status": "开发中"}
        ).json()
        application = client.post(
            "/api/applications/from-scan", json={"scan_id": candidate["id"]}
        ).json()

        bound = client.put(
            f"/api/projects/{project['id']}/applications/{application['id']}"
        )
        assert bound.status_code == 201
        assert bound.json()["application_id"] == application["id"]

        bootstrap = client.get("/api/bootstrap").json()
        assert bootstrap["projectApplications"] == [
            {
                "project_id": project["id"],
                "application_id": application["id"],
                "module_id": bound.json()["module_id"],
                "sort_order": 0,
                "enabled": 1,
            }
        ]

        started = client.post(
            f"/api/projects/{project['id']}/executions", json={"action": "run"}
        )
        assert started.status_code == 202
        execution = wait_execution(client, started.json()["id"])
        assert execution["status"] == "succeeded"
        assert execution["steps"][0]["module_name"] == "项目应用"
        assert execution["steps"][0]["run"]["result"] == {
            "ok": True,
            "type": "application",
            "application_id": application["id"],
        }
        assert opened == [shortcut]
        saved = next(row for row in client.get("/api/applications").json() if row["id"] == application["id"])
        assert saved["use_count"] == 1

    with build_client(
        tmp_path,
        application_scanner=lambda: [candidate],
        application_opener=opened.append,
    ) as restarted:
        restored = restarted.get("/api/bootstrap").json()["projectApplications"]
        assert any(
            row["project_id"] == project["id"] and row["application_id"] == application["id"]
            for row in restored
        )
        removed = restarted.delete(
            f"/api/projects/{project['id']}/applications/{application['id']}"
        )
        assert removed.status_code == 200
        assert removed.json()["removed"] is True


def test_scanned_application_upgrades_same_named_legacy_entry(tmp_path: Path) -> None:
    candidate = {
        "id": "scan-fedcba9876543210",
        "name": "旧演示应用",
        "category": "效率",
        "icon": "idea",
        "launch_path": str(tmp_path / "Legacy.lnk"),
    }
    client = build_client(tmp_path, application_scanner=lambda: [candidate], application_opener=lambda _path: None)
    with client:
        client.app.state.db.execute(
            "INSERT INTO applications(id,name,category,icon,favorite,size_label,use_count,last_opened_at,running,created_at,updated_at,launch_path,source_key) "
            "VALUES('legacy','旧演示应用','效率','idea',0,'—',0,NULL,0,'2026-09-20','2026-09-20','','')"
        )
        upgraded = client.post(
            "/api/applications/from-scan",
            json={"scan_id": candidate["id"]},
        )
        assert upgraded.status_code == 201
        assert upgraded.json()["id"] == "legacy"
        assert upgraded.json()["launchable"] is True


def test_project_edit_survives_app_restart(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        project = client.post(
            "/api/projects",
            json={"name": "未命名项目", "description": "", "status": "正常"},
        ).json()
        updated = client.patch(
            f"/api/projects/{project['id']}",
            json={"name": "APEX 比赛直播", "description": "打开直播间", "status": "正常"},
        )
        assert updated.status_code == 200

    with build_client(tmp_path) as restarted:
        projects = restarted.get("/api/projects").json()
        saved = next(item for item in projects if item["id"] == project["id"])
        assert (saved["name"], saved["description"], saved["status"]) == (
            "APEX 比赛直播",
            "打开直播间",
            "正常",
        )


def test_project_delete_previews_and_cascades_runtime_data(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        project = client.post(
            "/api/projects", json={"name": "待删除项目", "description": "", "status": "正常"}
        ).json()
        project_id = project["id"]
        assert client.put(f"/api/projects/{project_id}/modules/fake-module").status_code == 201
        assert client.post(
            f"/api/projects/{project_id}/tasks", json={"title": "应删除的任务"}
        ).status_code == 201
        assert client.post(
            f"/api/projects/{project_id}/notes", json={"title": "应删除的记录"}
        ).status_code == 201

        started = client.post(f"/api/projects/{project_id}/run")
        assert started.status_code == 202
        run_id = started.json()["id"]
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            run = client.get(f"/api/runs/{run_id}").json()
            if run["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert run["status"] == "succeeded"

        preview = client.get(f"/api/projects/{project_id}/delete-preview")
        assert preview.status_code == 200
        assert {
            key: preview.json()[key]
            for key in ("taskCount", "noteCount", "moduleBindingCount", "runCount")
        } == {"taskCount": 1, "noteCount": 1, "moduleBindingCount": 1, "runCount": 1}

        deleted = client.delete(f"/api/projects/{project_id}")
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] is True
        assert client.get(f"/api/projects/{project_id}/tasks").json() == []
        assert client.get(f"/api/projects/{project_id}/notes").json() == []
        assert client.get(f"/api/runs/{run_id}").status_code == 404
        bootstrap = client.get("/api/bootstrap").json()
        assert all(item["id"] != project_id for item in bootstrap["projects"])
        assert all(item["project_id"] != project_id for item in bootstrap["projectModules"])


def test_last_project_cannot_be_deleted(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        assert client.get("/api/projects/apex/delete-preview").status_code == 409
        assert client.delete("/api/projects/apex").status_code == 409


def test_running_project_cannot_be_deleted(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        project_id = client.post(
            "/api/projects", json={"name": "运行中项目", "description": "", "status": "正常"}
        ).json()["id"]
        client.app.state.db.execute(
            "INSERT INTO runs(id,project_id,module_id,action,status,started_at,run_dir) "
            "VALUES(?,?,?,?,?,?,?)",
            ("running-delete-guard", project_id, "fake-module", "run", "running", "2026-09-19", "runs/guard"),
        )
        preview = client.get(f"/api/projects/{project_id}/delete-preview")
        assert preview.status_code == 409
        assert "先关闭项目" in preview.json()["detail"]
        assert client.delete(f"/api/projects/{project_id}").status_code == 409


def test_frontend_entry_files_ignore_stale_browser_validators(tmp_path: Path) -> None:
    static_root = tmp_path / "static"
    static_root.mkdir()
    (static_root / "index.html").write_text("<script src='app.js'></script>", encoding="utf-8")
    (static_root / "app.js").write_text("window.VERSION='latest';", encoding="utf-8")
    app = create_app(
        db_path=tmp_path / "data" / "test.db",
        modules_dir=tmp_path / "modules",
        runs_dir=tmp_path / "data" / "runs",
        static_root=static_root,
    )
    with TestClient(app) as client:
        first = client.get("/app.js")
        stale = client.get("/app.js", headers={"If-None-Match": first.headers.get("etag", "")})
    assert stale.status_code == 200
    assert stale.text == "window.VERSION='latest';"
    assert stale.headers.get("cache-control") == "no-store"


def test_web_module_template_persists_and_binds_to_project(tmp_path: Path) -> None:
    opened: list[str] = []
    client = build_client(tmp_path)
    client.app.state.runner.web_opener = lambda url: opened.append(url) or True
    with client:
        project = client.post(
            "/api/projects",
            json={"name": "快捷站点", "description": "打开常用网站", "status": "开发中"},
        )
        assert project.status_code == 201
        project_id = project.json()["id"]
        created = client.post(
            "/api/modules",
            json={
                "name": "OpenAI",
                "type": "web",
                "description": "官方网站",
                "entry": "https://openai.com/",
            },
        )
        assert created.status_code == 201
        module = created.json()
        assert module["type"] == "web"
        assert module["manifest_path"] == ""
        bound = client.put(f"/api/projects/{project_id}/modules/{module['id']}")
        assert bound.status_code == 201

        started = client.post(f"/api/projects/{project_id}/run")
        assert started.status_code == 202
        run_id = started.json()["id"]
        deadline = time.monotonic() + 5
        payload = {}
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{run_id}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert payload["status"] == "succeeded"
        assert payload["result"] == {"ok": True, "type": "web", "url": "https://openai.com/"}
        assert opened == ["https://openai.com/"]

    with build_client(tmp_path) as restarted:
        bootstrap = restarted.get("/api/bootstrap").json()
        assert any(item["id"] == project_id for item in bootstrap["projects"])
        assert any(item["id"] == module["id"] for item in bootstrap["modules"])
        assert any(
            item["project_id"] == project_id and item["module_id"] == module["id"]
            for item in bootstrap["projectModules"]
        )
        history = next(item for item in bootstrap["projectRuns"] if item["project_id"] == project_id)
        assert history["run_count"] == 1
        assert history["last_run_at"] == payload["started_at"]
        assert history["recent"] == [
            {
                "id": run_id,
                "action": "run",
                "status": "succeeded",
                "started_at": payload["started_at"],
                "finished_at": payload["finished_at"],
                "error": None,
            }
        ]


def test_web_module_rejects_non_http_address(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        response = client.post(
            "/api/modules",
            json={"name": "危险入口", "type": "web", "description": "", "entry": "file:///C:/Windows"},
        )
    assert response.status_code == 422
    assert "http://" in response.json()["detail"]


def test_web_module_delete_previews_bindings_and_keeps_run_history(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        project_id = client.post(
            "/api/projects", json={"name": "文档站", "description": "", "status": "正常"}
        ).json()["id"]
        module_id = client.post(
            "/api/modules",
            json={"name": "文档", "type": "web", "description": "", "entry": "https://example.com/docs"},
        ).json()["id"]
        assert client.put(f"/api/projects/{project_id}/modules/{module_id}").status_code == 201
        preview = client.get(f"/api/modules/{module_id}/delete-preview")
        assert preview.status_code == 200
        assert preview.json()["projects"] == [{"id": project_id, "name": "文档站"}]
        deleted = client.delete(f"/api/modules/{module_id}")
        assert deleted.status_code == 200
        assert deleted.json()["affectedProjects"] == 1
        assert all(item["id"] != module_id for item in client.get("/api/modules").json())


def test_project_execution_runs_multiple_modules_in_order_and_stops_at_failure(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_fake_module(modules_dir, project_root)
    make_failing_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "data" / "test.db",
        modules_dir=modules_dir,
        runs_dir=tmp_path / "data" / "runs",
        static_root=None,
    )
    with TestClient(app) as client:
        client.app.state.db.execute(
            "UPDATE project_modules SET sort_order=CASE module_id "
            "WHEN 'fake-module' THEN 0 WHEN 'failing-module' THEN 1 END WHERE project_id='apex'"
        )
        started = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert started.status_code == 202
        payload = wait_execution(client, started.json()["id"])

    assert payload["status"] == "failed"
    assert [(step["module_id"], step["action"], step["status"]) for step in payload["steps"]] == [
        ("fake-module", "run", "succeeded"),
        ("failing-module", "run", "failed"),
    ]
    assert payload["steps"][0]["run"]["result"]["ok"] is True
    assert "synthetic stderr" in payload["steps"][1]["error"]


def test_project_restart_is_a_complete_stop_then_run_execution(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        started = client.post("/api/projects/apex/executions", json={"action": "restart"})
        assert started.status_code == 202
        payload = wait_execution(client, started.json()["id"])

    assert payload["status"] == "succeeded"
    assert [(step["action"], step["status"]) for step in payload["steps"]] == [
        ("stop", "stopped"),
        ("run", "succeeded"),
    ]
    assert [step["run"]["action"] for step in payload["steps"]] == ["stop", "run"]


def test_server_restart_marks_unfinished_execution_as_interrupted(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "test.db"
    db = Database(db_path)
    db.init()
    db.execute(
        "INSERT INTO projects(id,name,description,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        ("apex", "APEX", "", "正常", "2026-09-20", "2026-09-20"),
    )
    db.execute(
        "INSERT INTO project_executions(id,project_id,action,status,started_at) VALUES(?,?,?,?,?)",
        ("unfinished", "apex", "run", "running", "2026-09-20"),
    )
    db.execute(
        "INSERT INTO execution_steps(id,execution_id,sort_order,module_id,module_name,action,status) "
        "VALUES(?,?,?,?,?,?,?)",
        ("unfinished-step", "unfinished", 0, "fake-module", "Fake", "run", "running"),
    )

    app = create_app(
        db_path=db_path,
        modules_dir=tmp_path / "modules",
        runs_dir=tmp_path / "data" / "runs",
        static_root=None,
    )
    with TestClient(app) as client:
        payload = client.get("/api/executions/unfinished")
        assert payload.status_code == 200
        execution = payload.json()

    assert execution["status"] == "interrupted"
    assert execution["steps"][0]["status"] == "interrupted"
    assert "服务重启" in execution["error"]


def test_run_project_executes_registered_module_and_keeps_real_logs(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        started = client.post("/api/projects/apex/run")
        assert started.status_code == 202
        run_id = started.json()["id"]
        deadline = time.monotonic() + 5
        payload = {}
        while time.monotonic() < deadline:
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            payload = response.json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert payload["status"] == "succeeded"
        assert payload["action"] == "run"
        assert payload["result"]["ok"] is True
        assert payload["logs"] == ["[STEP] fake run", "[OK] fake run done"]
        snapshot = client.get("/api/bootstrap").json()
        execution = next(item for item in snapshot["projectExecutions"] if item["project_id"] == "apex")
        assert execution["active"] is None
        assert execution["latest"]["id"] == run_id
        assert execution["latest"]["steps"][0]["status"] == "succeeded"
        assert execution["recent"][0]["id"] == run_id


def test_stop_project_executes_registered_stop_action(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        stopped = client.post("/api/projects/apex/stop")
        assert stopped.status_code == 202
        run_id = stopped.json()["id"]
        deadline = time.monotonic() + 5
        payload = {}
        while time.monotonic() < deadline:
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            payload = response.json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert payload["status"] == "succeeded"
        assert payload["action"] == "stop"
        assert payload["result"]["status"]["state"] == "stopped"
        assert payload["logs"] == ["[STEP] fake stop", "[OK] fake stop done"]


def test_restart_project_returns_to_running_state(tmp_path: Path) -> None:
    with build_client(tmp_path) as client:
        restarted = client.post("/api/projects/apex/restart")
        assert restarted.status_code == 202
        run_id = restarted.json()["id"]
        deadline = time.monotonic() + 5
        payload = {}
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{run_id}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert payload["status"] == "succeeded"
        assert payload["action"] == "restart"
        assert payload["result"]["status"]["state"] == "running"


def test_runtime_state_survives_console_restart(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        started = client.post("/api/projects/apex/run").json()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{started['id']}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
        assert payload["status"] == "succeeded"

    with build_client(tmp_path) as restarted:
        runtime = restarted.get("/api/projects/apex/runtime")
        assert runtime.status_code == 200
        assert runtime.json()["state"] == "running"
        assert runtime.json()["action"] == "run"


def test_duplicate_project_execution_is_rejected_while_timeout_is_active(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_timeout_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "test.db", modules_dir=modules_dir,
        runs_dir=tmp_path / "runs", static_root=None,
    )
    with TestClient(app) as client:
        first = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert first.status_code == 202
        duplicate = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert duplicate.status_code == 409
        assert "执行中" in duplicate.json()["detail"]
        execution = wait_execution(client, first.json()["id"])

    assert execution["status"] == "failed"
    assert "超时" in execution["error"]
    assert execution["steps"][0]["run"]["status"] == "failed"


def test_execution_rejects_missing_module_definition_before_creating_history(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    with client:
        now = "2026-09-20T00:00:00+00:00"
        client.app.state.db.execute(
            "INSERT INTO modules(id,name,type,description,entry,args,version,manifest_path,enabled,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            ("orphan-module", "孤立模块", "script", "", "", "", "1.0.0", "missing.json", 1, now),
        )
        client.app.state.db.execute(
            "INSERT INTO project_modules(project_id,module_id,sort_order,enabled) VALUES(?,?,?,1)",
            ("apex", "orphan-module", 1),
        )
        response = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert response.status_code == 404
        assert "模块定义不存在" in response.json()["detail"]
        assert client.app.state.db.fetch_all("SELECT id FROM project_executions") == []


def test_execution_rejects_missing_working_directory_before_creating_history(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_missing_cwd_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "test.db", modules_dir=modules_dir,
        runs_dir=tmp_path / "runs", static_root=None,
    )
    with TestClient(app) as client:
        response = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert response.status_code == 422
        assert "模块工作目录不存在" in response.json()["detail"]
        assert client.app.state.db.fetch_all("SELECT id FROM project_executions") == []


def test_execution_records_malformed_result_as_a_real_failure(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_malformed_result_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "test.db", modules_dir=modules_dir,
        runs_dir=tmp_path / "runs", static_root=None,
    )
    with TestClient(app) as client:
        started = client.post("/api/projects/apex/executions", json={"action": "run"})
        assert started.status_code == 202
        execution = wait_execution(client, started.json()["id"])

    assert execution["status"] == "failed"
    step = execution["steps"][0]
    assert step["status"] == "failed"
    assert step["run"]["exit_code"] == 0
    assert "退出码 0" in step["error"]


def test_project_with_active_execution_cannot_be_deleted(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_timeout_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "test.db", modules_dir=modules_dir,
        runs_dir=tmp_path / "runs", static_root=None,
    )
    with TestClient(app) as client:
        project = client.post(
            "/api/projects", json={"name": "删除保护", "description": "", "status": "正常"}
        ).json()
        project_id = project["id"]
        assert client.put(f"/api/projects/{project_id}/modules/timeout-module").status_code == 201
        started = client.post(f"/api/projects/{project_id}/executions", json={"action": "run"})
        assert started.status_code == 202
        preview = client.get(f"/api/projects/{project_id}/delete-preview")
        assert preview.status_code == 409
        assert "先关闭项目" in preview.json()["detail"]
        execution = wait_execution(client, started.json()["id"])

    assert execution["status"] == "failed"


def test_missing_project_path_fails_closed(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    make_fake_module(modules_dir, tmp_path / "missing")
    app = create_app(
        db_path=tmp_path / "test.db",
        modules_dir=modules_dir,
        runs_dir=tmp_path / "runs",
        static_root=None,
    )
    with TestClient(app) as client:
        response = client.post("/api/projects/apex/run")
    assert response.status_code == 422
    assert "项目目录不存在" in response.json()["detail"]


def test_failed_process_surfaces_stderr_in_run_record(tmp_path: Path) -> None:
    modules_dir = tmp_path / "modules"
    project_root = tmp_path / "external-project"
    project_root.mkdir()
    make_failing_module(modules_dir, project_root)
    app = create_app(
        db_path=tmp_path / "test.db",
        modules_dir=modules_dir,
        runs_dir=tmp_path / "runs",
        static_root=None,
    )
    with TestClient(app) as client:
        started = client.post("/api/projects/apex/run")
        run_id = started.json()["id"]
        deadline = time.monotonic() + 5
        payload = {}
        while time.monotonic() < deadline:
            payload = client.get(f"/api/runs/{run_id}").json()
            if payload["status"] not in {"queued", "running"}:
                break
            time.sleep(0.05)
    assert payload["status"] == "failed"
    assert payload["exit_code"] == 7
    assert "synthetic stderr" in payload["error"]
    assert any("synthetic stderr" in line for line in payload["logs"])


def test_module_program_expands_project_placeholders() -> None:
    assert ModuleRunner._expand(
        "{project_root}\\backend\\.venv\\Scripts\\python.exe",
        {"project_root": "D:\\Py项目\\APEX"},
    ) == "D:\\Py项目\\APEX\\backend\\.venv\\Scripts\\python.exe"
