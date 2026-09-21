from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,63}$")


@dataclass(frozen=True)
class ModuleAction:
    program: str
    args: tuple[str, ...]
    cwd: Path


@dataclass(frozen=True)
class ModuleDefinition:
    id: str
    project_id: str
    name: str
    version: str
    module_dir: Path
    project_root: Path
    actions: dict[str, ModuleAction]
    requires_admin: bool
    single_instance: bool
    timeout_seconds: int
    manifest_path: Path


class ModuleRegistry:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self._modules: dict[str, ModuleDefinition] = {}

    def load(self) -> dict[str, ModuleDefinition]:
        modules: dict[str, ModuleDefinition] = {}
        if not self.root.exists():
            self._modules = modules
            return modules
        for path in sorted(self.root.glob("*/module.json")):
            item = self._load_one(path)
            if item.id in modules:
                raise ValueError(f"模块 id 重复：{item.id}")
            modules[item.id] = item
        self._modules = modules
        return dict(modules)

    def get(self, module_id: str) -> ModuleDefinition | None:
        return self._modules.get(module_id)

    def all(self) -> list[ModuleDefinition]:
        return list(self._modules.values())

    @staticmethod
    def _required_text(data: dict[str, Any], key: str, source: Path) -> str:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{source}: {key} 必须是非空字符串")
        return value.strip()

    def _load_one(self, path: Path) -> ModuleDefinition:
        data = json.loads(path.read_text(encoding="utf-8"))
        module_id = self._required_text(data, "id", path)
        if not ID_RE.fullmatch(module_id):
            raise ValueError(f"{path}: 非法模块 id")
        if data.get("schemaVersion") != 1:
            raise ValueError(f"{path}: 不支持的 schemaVersion")
        actions_raw = data.get("actions", {})
        if not isinstance(actions_raw, dict) or not isinstance(actions_raw.get("run"), dict):
            raise ValueError(f"{path}: 缺少 actions.run")
        module_dir = path.parent.resolve()
        project_root = Path(self._required_text(data, "projectRoot", path)).resolve()
        actions: dict[str, ModuleAction] = {}
        for action_name, action_raw in actions_raw.items():
            if not isinstance(action_name, str) or not ID_RE.fullmatch(action_name):
                raise ValueError(f"{path}: 非法 action 名称")
            if not isinstance(action_raw, dict):
                raise ValueError(f"{path}: actions.{action_name} 必须是对象")
            args = action_raw.get("args", [])
            if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
                raise ValueError(f"{path}: actions.{action_name}.args 必须是字符串数组")
            cwd_raw = action_raw.get("cwd", "{module_dir}")
            if not isinstance(cwd_raw, str):
                raise ValueError(f"{path}: actions.{action_name}.cwd 必须是字符串")
            cwd = Path(cwd_raw.replace("{module_dir}", str(module_dir)).replace("{project_root}", str(project_root))).resolve()
            actions[action_name] = ModuleAction(
                program=self._required_text(action_raw, "program", path),
                args=tuple(args),
                cwd=cwd,
            )
        timeout = int(data.get("timeoutSeconds", 240))
        if timeout < 1 or timeout > 1800:
            raise ValueError(f"{path}: timeoutSeconds 必须在 1..1800")
        return ModuleDefinition(
            id=module_id,
            project_id=self._required_text(data, "projectId", path),
            name=self._required_text(data, "name", path),
            version=self._required_text(data, "version", path),
            module_dir=module_dir,
            project_root=project_root,
            actions=actions,
            requires_admin=bool(data.get("requiresAdmin", False)),
            single_instance=bool(data.get("singleInstance", True)),
            timeout_seconds=timeout,
            manifest_path=path.resolve(),
        )
