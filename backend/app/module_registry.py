from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ID_RE = re.compile(r"^[a-z][a-z0-9-]{1,63}$")

# 兼容尚未声明项目元数据的旧清单；新模块应显式提供这两个字段。
DEFAULT_PROJECT_NAME = "未命名模块项目"
DEFAULT_PROJECT_DESCRIPTION = "模块清单尚未声明项目说明。"


@dataclass(frozen=True)
class ModuleAction:
    program: str
    args: tuple[str, ...]
    cwd: Path


@dataclass(frozen=True)
class ModuleDefinition:
    id: str
    project_id: str
    project_name: str
    project_description: str
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
    def __init__(self, root: Path, external_projects_root: Path | None = None) -> None:
        self.root = Path(root)
        self.external_projects_root = (
            Path(external_projects_root).resolve()
            if external_projects_root is not None else None
        )
        self._modules: dict[str, ModuleDefinition] = {}

    @property
    def console_root(self) -> Path:
        """模块目录默认是 <console>/backend/modules，往上两级即 console 根目录。

        manifest 里 `projectRoot` 与动作参数都可写 `{console_root}`，两处必须同一个口径，
        所以统一从这里派生。
        """
        return self.root.parent.parent.resolve()

    def load(self) -> dict[str, ModuleDefinition]:
        modules: dict[str, ModuleDefinition] = {}
        manifests: list[tuple[Path, Path]] = []
        if self.root.exists():
            manifests.extend((path, self.console_root) for path in self.root.glob("*/module.json"))
        if self.external_projects_root is not None and self.external_projects_root.is_dir():
            console_root = self.console_root
            for project_dir in self.external_projects_root.iterdir():
                if not project_dir.is_dir() or project_dir.is_symlink():
                    continue
                if not (project_dir / ".git").exists():
                    continue
                resolved_project = project_dir.resolve()
                if resolved_project == console_root:
                    continue
                apex_dir = project_dir / ".apex"
                manifest = apex_dir / "module.json"
                if apex_dir.is_symlink() or manifest.is_symlink() or not manifest.is_file():
                    continue
                manifests.append((manifest, resolved_project))
        manifests.sort(key=lambda item: str(item[0]).casefold())
        for path, project_root_base in manifests:
            item = self._load_one(path, project_root_base)
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

    def _load_one(self, path: Path, project_root_base: Path | None = None) -> ModuleDefinition:
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
        project_root_raw = self._required_text(data, "projectRoot", path)
        console_root = str(self.console_root)
        # 内置模块的相对路径锚定 console 根；外部仓库清单的相对路径锚定所属仓库。
        # 两种路径都不依赖服务进程 cwd，也不需要在清单里写死盘符。
        expanded = project_root_raw.replace("{console_root}", console_root)
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = (project_root_base or self.console_root) / candidate
        project_root = candidate.resolve()
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
        project_name = str(data.get("projectName") or "").strip() or DEFAULT_PROJECT_NAME
        project_description = (
            str(data.get("projectDescription") or "").strip() or DEFAULT_PROJECT_DESCRIPTION
        )
        return ModuleDefinition(
            id=module_id,
            project_id=self._required_text(data, "projectId", path),
            project_name=project_name,
            project_description=project_description,
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
