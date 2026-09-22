from __future__ import annotations

import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.application_scanner import scan_windows_applications


def test_scanner_keeps_launchable_shortcuts_and_filters_maintenance_entries(tmp_path: Path) -> None:
    root = tmp_path / "Programs"
    root.mkdir()
    editor = root / "真实编辑器.lnk"
    uninstall = root / "卸载真实编辑器.lnk"
    document = root / "资料目录.lnk"
    for path in (editor, uninstall, document):
        path.touch()
    targets = {
        str(editor.resolve()): r"C:\Apps\Editor.exe",
        str(uninstall.resolve()): r"C:\Apps\uninstall.exe",
        str(document.resolve()): r"C:\Windows\explorer.exe",
    }

    rows = scan_windows_applications([root], resolver=lambda _paths: targets)

    assert [(row["name"], row["category"]) for row in rows] == [("真实编辑器", "效率")]
    assert rows[0]["id"].startswith("scan-")
    assert rows[0]["launch_path"] == str(editor.resolve())


def test_scanner_deduplicates_same_named_shortcuts(tmp_path: Path) -> None:
    first = tmp_path / "User" / "Chrome.lnk"
    second = tmp_path / "Common" / "Chrome.lnk"
    first.parent.mkdir()
    second.parent.mkdir()
    first.touch()
    second.touch()
    targets = {
        str(first.resolve()): r"C:\Chrome\chrome.exe",
        str(second.resolve()): r"C:\Chrome\chrome.exe",
    }

    rows = scan_windows_applications(
        [first.parent, second.parent],
        resolver=lambda _paths: targets,
    )

    assert len(rows) == 1
    assert rows[0]["name"] == "Chrome"
    assert rows[0]["category"] == "浏览"
    assert rows[0]["icon"].startswith("native:")
    assert rows[0]["icon_source"] in {str(first.resolve()), str(second.resolve())}


def test_scanner_includes_start_apps_and_registry_app_paths_without_accepting_folders(tmp_path: Path) -> None:
    executable = tmp_path / "Tools" / "Example.exe"
    executable.parent.mkdir()
    executable.touch()

    rows = scan_windows_applications(
        [],
        resolver=lambda _paths: {},
        start_apps=[
            {"name": "便笺", "app_id": "Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App"},
            {"name": "桌面文件夹", "app_id": r"C:\Users\Demo\Desktop"},
            {"name": "网页入口", "app_id": "https://example.test"},
        ],
        app_paths=[{"name": "Example", "path": str(executable)}],
    )

    assert [(row["name"], row["launch_path"]) for row in rows] == [
        ("Example", str(executable)),
        ("便笺", "shell:AppsFolder\\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe!App"),
    ]
    assert all(row["icon"].startswith("native:") for row in rows)
    assert all(row["icon_source"] for row in rows)
