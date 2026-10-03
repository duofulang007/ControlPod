# ControlPod

ControlPod（简称 CPod）是面向 Windows 的本地个人总控台：把项目、可执行模块、常用应用、项目任务、记录和运行历史收在一个界面中。

自用的真实工具，不是原型演示、也不是可上线产品。日常入口是桌面外壳（WinUI 3），界面是原生 HTML / CSS / JavaScript，数据全部落在本机磁盘。

## 最近改动（2026-10-03）

- 设置页「通用」新增本地验证与更新：检查变化 → 跑测试 → 发布 → 退出并替换，支持后台每日检查；外部项目改由项目卡片上的维护按钮触发，任一失败即停止。
- 更新进度改用后端 `status.json` 的 `progress` 真值：侧栏更新小圈、卡片圆环、设置页进度环三处共用同一套描边语言，空闲恒为空环。
- 项目卡片精简为「名称 + 一行描述 + 状态胶囊 + 运行按钮 + 图标工具条」；删除侧栏底部用户块；修掉折叠态横向错位。
- 壳内新增 `RestartService` / `UpdateService`，仓库新增 `tools/` 维护脚本（本地更新、外部更新、退出后替换、产物裁剪、外部更新回归）。
- 交接状态文档不再放进仓库根：`PROJECT_STATE.md` 已归档到 `D:\Projects\.workbuddy\backups\ControlPod\`，根目录护栏不再为它开豁免。

## 当前能力

- 项目管理：创建、复制、编辑、删除项目，拖拽调整项目卡顺序，并查看项目运行状态与历史。
- 执行模块：发现内置模块和 `D:\Projects` 各项目仓库中的 `.apex/module.json`，并将模块组合到项目中运行；ControlPod 负责枢纽编排，不收纳独立项目的业务代码与运行环境。
- 开发者活跃度：首页热力图，底色表达控制台在线时长（页面每分钟静默上报一次），悬停显示当日在线分钟与代码新增 / 删减行数；代码行数由本机 git 仓库只读扫描得出，可在每日 / 每周 / 累计三个口径间切换。
- 跑步数据看板：解析小米运动健康官方导出包，展示单场复盘、训练负荷趋势、六维对比、周复盘和历史记录。看板是**独立仓库** `../run-analytics`，
  总控台只负责接入与启动；健康数据不出本机。
- APEX 一键启动：真实检查并编排 AK、Steam 与 APEX 的启动 / 关闭。实现和本地运行环境位于**独立仓库** `../apex-launcher`，ControlPod 只负责发现、权限提示、编排和运行记录。
- 真实应用：识别 Windows 开始菜单、已注册应用与 App Paths 中的可启动程序；添加后可从控制台启动，并显示 Windows 原生图标。
- 项目上下文：在项目内维护待办、项目记录、文件关联和 Obsidian 主页连接。
- 界面偏好：主题、强调色、信息密度、玻璃质感等外观选项保存在浏览器本机，刷新后保持。
- 桌面外壳：托盘常驻（左键唤起 / 右键菜单）、全局热键 `Ctrl+Alt+A`、关窗缩托盘、单实例互斥、开机自启动、窗口置顶、全屏、无边框卡片外观。
- 单一桌面入口：WinUI 3 外壳承载 Web 界面与 C# 本地 API，不再启动浏览器后端或本地端口服务。

## 运行环境

- Windows 10（版本 2004 及以上）/ 11，x64
- `D:\Projects` 下的独立模块使用各自仓库声明的运行环境；ControlPod 本身不依赖 Python
- .NET 10 SDK —— 仅构建外壳时需要（用 `dotnet --list-sdks` 确认有输出；只装运行时的话这里会是空的）。外壳的运行时自带，最终用户不必安装
- Node.js —— 仅用于前端冒烟测试

## 快速开始

### 桌面外壳（日常入口）

```powershell
git clone https://github.com/duofulang007/ControlPod.git ControlPod
cd ControlPod

# 1. 构建外壳（需 .NET 10 SDK：dotnet --list-sdks 必须有输出）
dotnet build shell\ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64

# 2. 运行；也可用 --shortcuts 在桌面建快捷方式
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe
```

仓库内的 Debug/Release 构建把 `https://apex.local/` 映射到源码根，所以改完 Web 文件后在壳里按 F5 即可生效；`D:\Apps\ControlPod` 的正式发布版使用随包携带的 `wwwroot`。设置页「通用」中的“检查更新”可以检查本地改动，确认后验证并同步安装版。

### 本地验证与更新

- 设置页「通用」只保留一个更新控件：检查更新 → 更新 → 重启以完成更新。发现更新后弹出“更新 / 稍后”，需要重启时弹出“重启 / 稍后”；检查与更新过程中禁用同一个控件。
- 后台每 24 小时检查 CPod 和外部项目，启动时补上错过的检查。后台只检查，不自动安装；旧版自动更新偏好不会绕过用户确认。
- 项目卡片仅在对应模块确有未应用变化时显示“有更新”，点击后确认更新；没有更新就不显示。后台检查对相同项目变化只提醒一次。
- 检查比较本地源码与上次验证或安装记录，不下载远程代码，也不代表线上版本查询。支持 CPod、apex-launcher、dou-link、run-analytics、Bili-Peek；首次没有记录时需验证建立记录。
- 用户确认后，更新仍运行所需检查。CPod 的界面改动通过前端检查后同步；外壳或更新工具变化时还会构建发布并跑完整壳自测。测试期间再次修改源码会停止更新。
- 界面同步后完整退出并重开；外壳更新由独立工具在退出后替换并重开。执行中的项目操作不会被强行中断。失败时显示真实原因；文件清单、逐项测试输出和日志路径保留在本机报告中，不常驻界面。

外部项目先全部验证，通过后才开始更新；任一失败即停止后续步骤。测试期间源码发生变化会拒绝更新。apex-launcher、run-analytics 和 Bili-Peek 助手直接使用各自仓库源码：更新记录代表源码已验证，运行中的实例单独提示待重启，不自动关闭游戏、导入或片段保存。dou-link 发布到本仓库 `publish`，运行时拒绝替换；先暂存发布、校验载荷再替换，失败恢复旧目录，上一版保留。Bili-Peek 的浏览器油猴脚本与 Obsidian 插件是独立安装副本，此操作不改它们或笔记库。

“待安装生效”和“待重启生效”属于未完成生效的结果，不显示成已同步；无变化也明确说明未替换文件。更新会运行真实项目检查，结果、耗时与输出写入本机报告，构建通过不代表桌面交互验收。CPod 启动 Windows PowerShell 时清除宿主继承的 `PSModulePath`，防止从 PowerShell 7 或其他桌面环境启动后找不到 `Get-FileHash` 等内置命令。

源码仍在 `D:\Projects\ControlPod`，成品只在 `D:\Apps\ControlPod`，个人数据在 `%LOCALAPPDATA%\ControlPod`。每次验证结束后去掉验证快照内可再生成的 bin/obj/publish，保留源码快照和报告；完成安装后仅保留最新一份回退副本。源码目录的开发构建 bin/obj 可在构建进程结束后清理。`tools/trim-update-artifacts.ps1` 默认只预览，传 `-Mode clean` 才执行，并拒绝链接目录、越界路径、运行占用和包含数据库的回退副本。

需要本机 Git、Node.js、CPod 的 .NET 10 SDK、dou-link 的 .NET 8 构建支持，以及外部项目各自已有的 `.venv` / ffmpeg；不自动安装或升级依赖。Bili-Peek 读取当前 `package.json` 中直接 Node 检查与测试命令，脚本改成其他形式时明确拒绝并提示维护配方。恢复构建依赖时需要可用网络。更新偏好、进度、外部源码收据与日志位于 `%LOCALAPPDATA%\ControlPod\updates`，不存入数据库或界面外观偏好。旧安装目录和旧界面保留为带唯一后缀的备份；不会自动清除备份或改写用户数据库。自动测试不能代替真实窗口体验。

若 `dotnet` 提示找不到 SDK，而用户目录已安装 SDK，可用 `& "$env:USERPROFILE\.dotnet\dotnet.exe"` 替代上述 `dotnet`。源码中的开发路径默认是 `D:\Projects\ControlPod`；放到其他目录开发时，需同步调整 `shell/ConsoleConfig.cs` 的 `ProjectDir`。

## 使用方式

### 添加真实应用

进入“应用”页面，点击“添加应用”。系统会扫描本机可验证的启动入口；选择应用、按需修改显示名称和标签、确认后才会写入清单。不会自动添加或启动任何程序。

### 配置项目流程

1. 在“项目”页面点击卡片的铅笔按钮，进入项目详情。
2. 在“运行流程”中进入编辑状态并添加模块。
3. 运行项目，实时查看步骤状态、日志和历史记录。

真实执行失败会保留原始错误，并在失败步骤停止；不会以模拟成功替代真实结果。

卡片主按钮直接运行项目；运行后提供关闭与重启。长按卡片空白处可拖拽排序。

## 项目结构

```text
ControlPod/
├─ index.html                 前端入口
├─ app.js                     前端逻辑与页面渲染
├─ styles.css                 全站样式与设计令牌
├─ smoke-test.js              前端冒烟测试（同时是活规格）
├─ web/
│  └─ shell-bridge.js         页面与壳的 WebView2 消息桥
├─ shell/                     WinUI 3 桌面外壳（C# 源码）
│  ├─ ApexShell.csproj
│  ├─ MainWindow.xaml.cs      窗口 / 托盘 / WebView2 / WebMessage 桥
│  ├─ LocalApi.cs             壳内路由分发器
│  ├─ UpdateService.cs        本地与外部项目的检查 / 测试 / 更新
│  ├─ RestartService.cs       退出后重启与替换交接
│  ├─ Db.cs                   SQLite 门面与迁移
│  └─ SelfTest.cs             无头自测（--selftest）
├─ tools/                     本地更新、外部更新、退出后替换与产物裁剪脚本
├─ docs/
│  └─ module-authoring.md     外部项目模块清单约定
└─ AGENTS.md                  项目约束与维护说明（改代码前先读）
```

`run-analytics/`、`dou-link/` 与 `apex-launcher/` 是 `D:\Projects` 下的独立 Git 仓库。项目代码、模块适配器、依赖和虚拟环境均归各自仓库维护；ControlPod 扫描直接子级 Git 仓库中的 `.apex/module.json`，负责发现、绑定、编排、权限提示和运行记录。各项目的个人数据与生成物按自己的 `.gitignore` 排除。

## 模块仓库约定

平台（本仓库）与模块项目（如 run-analytics）分仓库管理：

- 模块项目 clone 到 `D:\Projects\<名称>`（与本仓库同级），在项目仓库根创建 `.apex/module.json`，并用 `"projectRoot": "."` 指向本仓库。
- `run-analytics`、`dou-link` 与 `apex-launcher` 在各自仓库维护 `.apex/` 清单和适配器，并使用各自的运行环境。
- 本地项目按自己的 `README.md` 初始化环境；依赖与运行时不能放进 ControlPod 仓库。
- 跨仓库修改应在每个所属仓库分别提交。
- 自检跟着仓库走：模块项目跑它自己的检查，ControlPod 跑 `smoke-test.js` 与壳自检。

## 验证

```powershell
# 前端（末行必须出现 ALL_PASS）
node smoke-test.js

# 外壳（无头自测：不建窗口、不碰 WebView2）
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe --selftest
```

## 本地数据与隐私

- 运行数据保存在 `%LOCALAPPDATA%\ControlPod\`，包括 `controlpod.db`、运行记录与窗口状态；源码仓库不再混放运行数据。
- 可用 `CONTROLPOD_DATA_DIR`、`CONTROLPOD_DB_PATH`、`CONTROLPOD_MODULES_DIR` 和 `CONTROLPOD_PROJECTS_DIR` 覆盖默认路径。
- 跑步健康数据（`data.js`）在独立的 run-analytics 仓库里同样被它自己的 `.gitignore` 排除；
  换机器后 clone 两个仓库、双击 `run-analytics\导入数据.cmd` 导入一次即可重建。
- 应用扫描仅读取 Windows 已公开注册的启动入口；控制台不会上传扫描结果或项目数据。
- 活跃度统计完全在本机完成：在线分钟数记进本地 SQLite（`activity_heartbeats` 表），代码新增 / 删减
  通过只读 `git log --numstat` 扫描代码目录得出。要统计的目录写在 `%LOCALAPPDATA%\ControlPod\activity_config.json`
  的 `codeDirs`（缺省 `D:\Projects`，只扫一层子目录里的 git 仓库，非 git 目录忽略）。Obsidian 连接配置与界面偏好存在 WebView2 本机配置中；其余数据只落在本机磁盘。

## 现阶段范围

ControlPod（简称 CPod）目前服务于本机开发与自动化管理，不是多用户、云同步或公网部署产品。提交问题时请写明 Windows 版本、复现步骤、页面提示和对应的运行日志。
