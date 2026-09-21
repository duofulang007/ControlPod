from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import tempfile
from typing import Callable, Iterable, Sequence
import zlib


class ApplicationScanError(RuntimeError):
    pass


_EXCLUDED_NAMES = (
    "uninstall",
    "unins",
    "remove",
    "repair",
    "setup",
    "readme",
    "release notes",
    "documentation",
    "help",
    "website",
    "support",
    "license",
    "install manager",
    "recovery",
    "卸载",
    "修复",
    "帮助",
    "说明",
)

_EXCLUDED_PARTS = {"startup", "启动"}
_EXCLUDED_TARGETS = {"explorer.exe", "rundll32.exe", "control.exe", "mmc.exe"}


def start_menu_roots() -> list[Path]:
    roots: list[Path] = []
    for key in ("APPDATA", "PROGRAMDATA"):
        base = os.environ.get(key)
        if not base:
            continue
        root = Path(base) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        if root.is_dir():
            roots.append(root.resolve())
    return roots


def _shortcut_id(path: Path) -> str:
    normalized = str(path.resolve()).replace("\\", "/").casefold()
    return "scan-" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]


def _source_id(kind: str, value: str) -> str:
    normalized = f"{kind}:{value}".replace("\\", "/").casefold()
    return "scan-" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]


def _category(name: str) -> str:
    value = name.casefold()
    groups = (
        ("开发", ("code", "visual studio", "pycharm", "intellij", "git", "docker", "postman", "terminal", "powershell", "autohotkey", "python")),
        ("浏览", ("chrome", "edge", "firefox", "brave", "browser", "浏览器", "夸克")),
        ("设计", ("figma", "photoshop", "illustrator", "blender", "adobe", "canva", "pixso")),
        ("娱乐", ("steam", "epic", "game", "游戏", "音乐", "bilibili", "哔哩", "抖音", "spotify", "wegame")),
    )
    for category, words in groups:
        if any(word in value for word in words):
            return category
    return "效率"


def _native_icon(scan_id: str) -> str:
    return f"native:{scan_id}"


def list_start_apps() -> list[dict[str, str]]:
    """Read Windows' registered app list, including UWP apps without .lnk files."""
    if os.name != "nt":
        return []
    script = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-StartApps | Select-Object @{n='name';e={$_.Name}},@{n='app_id';e={$_.AppID}} | ConvertTo-Json -Compress
""".strip()
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            errors="replace",
            timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    if isinstance(payload, dict):
        payload = [payload]
    return [
        {"name": str(item.get("name", "")).strip(), "app_id": str(item.get("app_id", "")).strip()}
        for item in payload
        if isinstance(item, dict)
    ]


def list_app_paths() -> list[dict[str, str]]:
    """Read only Windows App Paths entries whose executable still exists."""
    if os.name != "nt":
        return []
    try:
        import winreg
    except ImportError:
        return []
    roots = (
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\App Paths", 0),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\App Paths", winreg.KEY_WOW64_64KEY),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\App Paths", winreg.KEY_WOW64_32KEY),
    )
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for hive, root, view in roots:
        try:
            key = winreg.OpenKey(hive, root, 0, winreg.KEY_READ | view)
        except OSError:
            continue
        with key:
            index = 0
            while True:
                try:
                    subkey_name = winreg.EnumKey(key, index)
                except OSError:
                    break
                index += 1
                try:
                    with winreg.OpenKey(key, subkey_name) as subkey:
                        raw_path, _ = winreg.QueryValueEx(subkey, None)
                except OSError:
                    continue
                path_text = str(raw_path or "").strip().strip('"')
                path = Path(path_text)
                normalized = str(path).casefold()
                if path.suffix.casefold() != ".exe" or not path.is_file() or normalized in seen:
                    continue
                seen.add(normalized)
                rows.append({"name": path.stem, "path": str(path)})
    return rows


def _is_launchable_start_app(app_id: str) -> bool:
    value = app_id.strip()
    if not value or value.casefold().startswith(("http:", "https:", "microsoft.autogenerated.")):
        return False
    if re.match(r"^[a-z]:\\", value, flags=re.IGNORECASE):
        return Path(value).suffix.casefold() == ".exe"
    return not value.startswith(("\\", "/"))


def extract_windows_icon_png(source: str, size: int = 32) -> bytes | None:
    """Return the Windows shell icon for a verified scanner source as a small PNG."""
    if os.name != "nt" or not source:
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class SHFILEINFOW(ctypes.Structure):
            _fields_ = [
                ("hIcon", wintypes.HICON), ("iIcon", ctypes.c_int), ("dwAttributes", wintypes.DWORD),
                ("szDisplayName", wintypes.WCHAR * 260), ("szTypeName", wintypes.WCHAR * 80),
            ]

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", wintypes.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
                ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", ctypes.c_long),
                ("biYPelsPerMeter", ctypes.c_long), ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD),
            ]

        class BITMAPINFO(ctypes.Structure):
            _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 1)]

        shell32 = ctypes.windll.shell32
        user32 = ctypes.windll.user32
        gdi32 = ctypes.windll.gdi32
        info = SHFILEINFOW()
        flags = 0x00000100 | 0x00000000  # SHGFI_ICON | SHGFI_LARGEICON
        shell32.SHGetFileInfoW.restype = ctypes.c_size_t
        if not shell32.SHGetFileInfoW(source, 0, ctypes.byref(info), ctypes.sizeof(info), flags) or not info.hIcon:
            return None
        screen_dc = user32.GetDC(None)
        mem_dc = gdi32.CreateCompatibleDC(screen_dc)
        bits = ctypes.c_void_p()
        bitmap_info = BITMAPINFO(BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), size, -size, 1, 32, 0, 0, 0, 0, 0, 0))
        bitmap = gdi32.CreateDIBSection(mem_dc, ctypes.byref(bitmap_info), 0, ctypes.byref(bits), None, 0)
        old_bitmap = None
        try:
            if not mem_dc or not bitmap or not bits.value:
                return None
            old_bitmap = gdi32.SelectObject(mem_dc, bitmap)
            if not user32.DrawIconEx(mem_dc, 0, 0, info.hIcon, size, size, 0, None, 0x0003):
                return None
            bgra = ctypes.string_at(bits, size * size * 4)
            rgba = bytearray(size * size * 4)
            for index in range(0, len(bgra), 4):
                rgba[index:index + 4] = bgra[index + 2:index + 3] + bgra[index + 1:index + 2] + bgra[index:index + 1] + bgra[index + 3:index + 4]
            raw = b"".join(b"\x00" + bytes(rgba[row * size * 4:(row + 1) * size * 4]) for row in range(size))

            def chunk(kind: bytes, data: bytes) -> bytes:
                return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

            return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
        finally:
            if old_bitmap:
                gdi32.SelectObject(mem_dc, old_bitmap)
            if bitmap:
                gdi32.DeleteObject(bitmap)
            if mem_dc:
                gdi32.DeleteDC(mem_dc)
            if screen_dc:
                user32.ReleaseDC(None, screen_dc)
            user32.DestroyIcon(info.hIcon)
    except (AttributeError, OSError):
        return None


def resolve_shortcut_targets(paths: list[Path]) -> dict[str, str]:
    if not paths:
        return {}
    if os.name != "nt":
        raise ApplicationScanError("本机应用扫描仅支持 Windows")
    script = r"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$paths = Get-Content -LiteralPath $env:APEX_CONSOLE_APP_SCAN_MANIFEST -Raw -Encoding UTF8 | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$items = @()
foreach ($path in $paths) {
  try {
    $shortcut = $shell.CreateShortcut([string]$path)
    $items += [pscustomobject]@{ shortcut = [string]$path; target = [string]$shortcut.TargetPath }
  } catch {}
}
ConvertTo-Json -InputObject @($items) -Compress
""".strip()
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    data_dir = Path(__file__).resolve().parents[1] / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8-sig",
            newline="\n",
            suffix=".json",
            prefix="app-scan-",
            dir=data_dir,
            delete=False,
        ) as handle:
            json.dump([str(path) for path in paths], handle, ensure_ascii=False)
            manifest_path = Path(handle.name)
        child_env = os.environ.copy()
        child_env["APEX_CONSOLE_APP_SCAN_MANIFEST"] = str(manifest_path)
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                capture_output=True,
                text=True,
                encoding="utf-8-sig",
                errors="replace",
                timeout=15,
                creationflags=creationflags,
                env=child_env,
                check=False,
            )
        finally:
            manifest_path.unlink(missing_ok=True)
    except (OSError, subprocess.TimeoutExpired) as exc:
        if manifest_path is not None:
            manifest_path.unlink(missing_ok=True)
        raise ApplicationScanError(f"无法读取 Windows 应用快捷方式：{exc}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or f"PowerShell 退出码 {result.returncode}"
        raise ApplicationScanError(f"无法读取 Windows 应用快捷方式：{detail}")
    try:
        payload = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise ApplicationScanError("Windows 应用扫描返回了无法识别的数据") from exc
    if not isinstance(payload, list):
        payload = [payload]
    return {
        str(item.get("shortcut", "")): str(item.get("target", ""))
        for item in payload
        if isinstance(item, dict) and item.get("shortcut")
    }


def scan_windows_applications(
    roots: Iterable[Path] | None = None,
    resolver: Callable[[list[Path]], dict[str, str]] = resolve_shortcut_targets,
    start_apps: Sequence[dict[str, str]] | None = None,
    app_paths: Sequence[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    source_roots = [Path(root).resolve() for root in (roots if roots is not None else start_menu_roots())]
    shortcuts: list[Path] = []
    for root in source_roots:
        if root.is_dir():
            shortcuts.extend(path.resolve() for path in root.rglob("*.lnk") if path.is_file())
    shortcuts = sorted(set(shortcuts), key=lambda path: str(path).casefold())
    targets = resolver(shortcuts)
    candidates: list[dict[str, str]] = []
    seen_names: set[str] = set()
    for shortcut in shortcuts:
        name = shortcut.stem.strip()
        folded = name.casefold()
        relative_parts = {
            part.casefold()
            for root in source_roots
            if shortcut.is_relative_to(root)
            for part in shortcut.relative_to(root).parts[:-1]
        }
        target = targets.get(str(shortcut), "").strip().strip('"')
        target_name = Path(target).name.casefold()
        if (
            not name
            or name.startswith(".")
            or any(word in folded for word in _EXCLUDED_NAMES)
            or relative_parts.intersection(_EXCLUDED_PARTS)
            or Path(target).suffix.casefold() != ".exe"
            or target_name.startswith(("unins", "uninstall"))
            or target_name in _EXCLUDED_TARGETS
            or folded in seen_names
        ):
            continue
        category = _category(name)
        scan_id = _shortcut_id(shortcut)
        candidates.append(
            {
                "id": scan_id,
                "name": name,
                "category": category,
                "icon": _native_icon(scan_id),
                "icon_source": str(shortcut),
                "launch_path": str(shortcut),
            }
        )
        seen_names.add(folded)

    system_start_apps = list_start_apps() if start_apps is None and roots is None else (start_apps or [])
    for item in system_start_apps:
        name = str(item.get("name", "")).strip()
        app_id = str(item.get("app_id", "")).strip()
        folded = name.casefold()
        if not name or folded in seen_names or any(word in folded for word in _EXCLUDED_NAMES) or not _is_launchable_start_app(app_id):
            continue
        category = _category(name)
        scan_id = _source_id("start-app", app_id)
        shell_path = f"shell:AppsFolder\\{app_id}"
        candidates.append(
            {"id": scan_id, "name": name, "category": category, "icon": _native_icon(scan_id),
             "icon_source": shell_path, "launch_path": shell_path}
        )
        seen_names.add(folded)

    system_app_paths = list_app_paths() if app_paths is None and roots is None else (app_paths or [])
    for item in system_app_paths:
        name = str(item.get("name", "")).strip()
        executable = Path(str(item.get("path", "")).strip())
        folded = name.casefold()
        if not name or folded in seen_names or executable.suffix.casefold() != ".exe" or not executable.is_file():
            continue
        category = _category(name)
        scan_id = _source_id("app-path", str(executable.resolve()))
        candidates.append(
            {"id": scan_id, "name": name, "category": category, "icon": _native_icon(scan_id),
             "icon_source": str(executable), "launch_path": str(executable)}
        )
        seen_names.add(folded)
    return sorted(candidates, key=lambda item: item["name"].casefold())
