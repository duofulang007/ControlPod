# 执行模块最小约定

执行模块是项目运行流程中的一个真实步骤。它只负责自己的动作，不决定项目中其他模块的顺序。

## 必填字段

模块清单有两种位置：总控台内置模块放在 `backend/modules/<模块 id>/module.json`；独立 Git 项目仓库放在仓库根的 `.apex/module.json`。ControlPod 启动时扫描内置模块目录，以及 `APEX_CONSOLE_PROJECTS_DIR`（默认 `D:\Projects`）下每个直接子目录的 `.apex/module.json`。外部目录必须包含 Git 的 `.git` 文件或目录；不递归扫描，也会跳过 ControlPod 自身仓库。

每份清单至少提供：

- `schemaVersion: 1`
- 稳定且唯一的 `id`
- `projectId`、`name`、`version`、`projectRoot`
- `actions.run`，其中包含 `program`、`cwd` 与字符串数组 `args`

相对 `projectRoot` 的基准取决于清单位置：内置模块相对 ControlPod 仓库根，独立项目清单相对所属项目仓库根。外部清单通常写 `"projectRoot": "."`。此时 `{module_dir}` 指向 `.apex`，`{project_root}` 指向项目仓库根；建议把动作 `cwd` 设为 `{project_root}`，并从这里调用项目自己的入口和运行环境。

可用占位符为 `{module_dir}`、`{project_root}`、`{console_root}`、`{run_dir}`、`{result_path}`、`{log_path}`。未知占位符会被拒绝，不会交给 shell 解释。独立项目应优先使用自己的依赖与运行环境；只有确实调用 ControlPod 自己的工具时才写 `{console_root}`，不要写绝对路径。

建议同时声明 `projectName` 与 `projectDescription`：项目名与描述取自 manifest；未声明时只使用通用兜底文案，不与某个独立项目绑定。

## 动作含义

- `run`：启动或触发该模块。成功时退出码必须为 `0`，并在 `{result_path}` 写入 JSON 对象，至少包含 `{"ok": true}`。
- `stop`：仅当模块实际拥有可关闭的受控进程时提供。项目关闭会按模块绑定的反序调用它。
- `restart`：模块可以声明，但项目级重启不会依赖它；总控台会严格执行完整的 `stop` 阶段后，再执行 `run` 阶段。

网页模块属于一次性触发：只能 `run`，没有 `stop`，不能把系统浏览器进程误称为由总控台管理。

## 失败与超时

- `timeoutSeconds` 为 1 到 1800 秒；超时会结束子进程并把失败原因写入运行记录。
- 非零退出码、缺失结果、无效 JSON 或 `ok` 不是 `true` 都是失败。
- 错误应写入标准错误或 `{log_path}`；总控台会保留原始错误，不会继续启动后续模块。

## 版本与兼容性

模块 id 是历史步骤快照的一部分。修改模块配置不会改写已发生的项目执行记录；删除用户创建的网页模块也只解除绑定，历史仍保留。
