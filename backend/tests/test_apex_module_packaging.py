import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.module_registry import ModuleRegistry


def test_apex_module_uses_the_console_root_and_bundled_core():
    manifest_path = ROOT / "backend" / "modules" / "apex-launcher" / "module.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["projectRoot"] == "{console_root}"
    assert "D:\\Py项目\\APEX" not in manifest_path.read_text(encoding="utf-8")
    module = ModuleRegistry(ROOT / "backend" / "modules").load()["apex-launcher"]
    assert module.project_root == ROOT
    assert (ROOT / "backend" / "app" / "apex_launcher" / "service.py").is_file()
    assert (ROOT / "backend" / "app" / "apex_launcher" / "resources" / "templates" / "accelerate.png").is_file()


def test_apex_module_runner_uses_the_bundled_worker_without_the_external_project():
    runner = (ROOT / "backend" / "modules" / "apex-launcher" / "runner.py").read_text(encoding="utf-8")
    worker = (ROOT / "backend" / "apex_worker.py").read_text(encoding="utf-8")

    assert "WORKER_PORT = 8766" in runner
    assert "def ensure_worker(" in runner
    assert "get_service" in worker
    assert 'host="127.0.0.1"' in worker
    assert "D:\\Py项目\\APEX" not in runner
    assert "http://127.0.0.1:8000" not in runner
