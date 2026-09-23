from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import create_app
from test_backend import make_fake_module

NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def build_activity_client(tmp_path: Path, code_dirs: list[Path] | None = None) -> TestClient:
    """tmp 库 + 显式 codeDirs 配置：不扫真实目录，测试之间经缓存键天然隔离。"""
    modules_dir = tmp_path / "modules"
    modules_dir.mkdir(parents=True, exist_ok=True)
    project_root = tmp_path / "external-project"
    project_root.mkdir(parents=True, exist_ok=True)
    make_fake_module(modules_dir, project_root)
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {"codeDirs": [str(path) for path in (code_dirs or [])]}
    (data_dir / "activity_config.json").write_text(json.dumps(payload), encoding="utf-8")
    app = create_app(
        db_path=data_dir / "test.db",
        modules_dir=modules_dir,
        runs_dir=data_dir / "runs",
        static_root=None,
    )
    return TestClient(app)


def make_git_commit(repo: Path, when: datetime, message: str) -> None:
    """在 repo 造一个指定时间的 commit：新增独立文件 5 行（adds=5, dels=0）。"""
    repo.mkdir(parents=True, exist_ok=True)
    stamp = when.astimezone().isoformat()
    env = {**os.environ, "GIT_AUTHOR_DATE": stamp, "GIT_COMMITTER_DATE": stamp}

    def run(*args: str) -> None:
        subprocess.run(
            ["git", "-C", str(repo), *args], env=env, check=True,
            capture_output=True, creationflags=NO_WINDOW,
        )

    if not (repo / ".git").exists():
        run("init", "-q")
    (repo / f"{message}.py").write_text("line\n" * 5, encoding="utf-8")
    run("add", "-A")
    run("-c", "user.name=t", "-c", "user.email=t@example", "commit", "-q", "-m", message)


def test_activity_daily_empty_backend_returns_zero_grid(tmp_path: Path) -> None:
    client = build_activity_client(tmp_path)
    days = client.get("/api/activity/daily").json()["days"]
    assert len(days) == 371
    assert all(item["online"] == 0 and item["adds"] == 0 and item["dels"] == 0 and item["count"] == 0 for item in days)
    assert days[-1]["date"] == datetime.now().astimezone().date().isoformat()


def test_activity_heartbeat_accumulates_daily_minutes(tmp_path: Path) -> None:
    client = build_activity_client(tmp_path)
    results = [client.post("/api/activity/heartbeat").json() for _ in range(3)]
    assert [item["minutes"] for item in results] == [1, 2, 3]
    assert all(item["day"] == datetime.now().astimezone().date().isoformat() for item in results)


def test_activity_daily_combines_online_and_code_changes(tmp_path: Path) -> None:
    code_base = tmp_path / "codebase"
    now = datetime.now().astimezone()
    make_git_commit(code_base / "repo-a", now, "feat-today")
    make_git_commit(code_base / "repo-b", now - timedelta(days=1), "feat-yesterday")
    (code_base / "not-a-repo").mkdir(parents=True, exist_ok=True)  # 非 git 目录忽略
    (code_base / "plain.txt").write_text("x", encoding="utf-8")  # 散文件忽略
    client = build_activity_client(tmp_path, code_dirs=[code_base])

    assert client.post("/api/activity/heartbeat").status_code == 200

    days = client.get("/api/activity/daily").json()["days"]
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    by_date = {item["date"]: item for item in days}
    # 今天 = 心跳 1 分钟 + repo-a 的 5 行新增
    assert by_date[today]["online"] == 1
    assert by_date[today]["adds"] == 5
    assert by_date[today]["dels"] == 0
    assert by_date[today]["count"] == 6
    # 昨天 = repo-b 的 5 行新增（git 历史回填），无在线分钟
    assert by_date[yesterday]["online"] == 0
    assert by_date[yesterday]["adds"] == 5

    short = client.get("/api/activity/daily?days=3").json()["days"]
    assert len(short) == 3
    assert short[-1]["date"] == today
