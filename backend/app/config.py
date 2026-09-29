from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
PROJECTS_DIR = Path(os.environ.get("APEX_CONSOLE_PROJECTS_DIR", PROJECT_DIR.parent))
DATA_DIR = Path(os.environ.get("APEX_CONSOLE_DATA_DIR", BACKEND_DIR / "data"))
DB_PATH = Path(os.environ.get("APEX_CONSOLE_DB_PATH", DATA_DIR / "apex-console.db"))
MODULES_DIR = Path(os.environ.get("APEX_CONSOLE_MODULES_DIR", BACKEND_DIR / "modules"))
RUNS_DIR = Path(os.environ.get("APEX_CONSOLE_RUNS_DIR", DATA_DIR / "runs"))
