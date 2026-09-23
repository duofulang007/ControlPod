# -*- coding: utf-8 -*-
"""一次性更名：目录 runner-lab → run-analytics。

只替换「路径与门面」类字样；模块 id / 接入层目录（backend/modules/runner-lab）
保持不变——id 关联数据库运行历史，改名要迁移，无收益。
"""
from pathlib import Path

# (文件, [(旧, 新), ...])  — 路径与门面类替换
PATH_JOBS = [
    (Path(r"D:\Projects\apex-console\.gitignore"), [("runner-lab/", "run-analytics/")]),
    (Path(r"D:\Projects\apex-console\backend\modules\runner-lab\module.json"),
     [('"projectRoot": "..\\\\runner-lab"', '"projectRoot": "..\\\\run-analytics"')]),
    (Path(r"D:\Projects\apex-console\backend\modules\runner-lab\runner.py"),
     [("runner-lab\\\\inbox", "run-analytics\\\\inbox"),
      ("runner-lab", "run-analytics")]),
    (Path(r"D:\Projects\apex-console\backend\tests\test_module_project_metadata.py"),
     [('ROOT.parent / "runner-lab"', 'ROOT.parent / "run-analytics"')]),
    (Path(r"D:\Projects\apex-console\backend\app\module_registry.py"),
     [("..\\\\runner-lab", "..\\\\run-analytics")]),
    (Path(r"D:\Projects\apex-console\AGENTS.md"),
     [("D:\\Projects\\runner-lab", "D:\\Projects\\run-analytics"),
      ("..\\runner-lab", "..\\run-analytics"),
      ("runner-lab 仓库", "run-analytics 仓库")]),
    (Path(r"D:\Projects\apex-console\README.md"),
     [("D:\\Projects\\runner-lab", "D:\\Projects\\run-analytics"),
      ("..\\runner-lab", "..\\run-analytics"),
      ("runner-lab/", "run-analytics/")]),
]

# runner-lab 项目内部的字样（docstring / 注释 / 标题）
INNER_JOBS = [
    (Path(r"D:\Projects\runner-lab\README.md"), [("runner-lab", "Run Analytics")]),
    (Path(r"D:\Projects\runner-lab\tools\import_gui.py"), [("runner-lab", "run-analytics")]),
    (Path(r"D:\Projects\runner-lab\tools\import_zip.py"), [("runner-lab", "run-analytics")]),
    (Path(r"D:\Projects\runner-lab\tools\check.js"), [("runner-lab", "run-analytics")]),
    (Path(r"D:\Projects\runner-lab\import-running-data.cmd"), [("runner-lab", "run-analytics")]),
]

for path, pairs in PATH_JOBS + INNER_JOBS:
    s = path.read_text(encoding="utf-8")
    orig = s
    for old, new in pairs:
        s = s.replace(old, new)
    if s != orig:
        path.write_text(s, encoding="utf-8", newline="")
        print("updated", path.name)
    else:
        print("no-op   ", path.name)
