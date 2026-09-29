# ControlPod

ControlPod（简称 CPod）是面向 Windows 的本地个人总控台：把项目、可执行模块、常用应用、项目任务、记录和运行历史收在一个界面中。

自用的真实工具，不是原型演示、也不是可上线产品。日常入口是桌面外壳（WinUI 3），界面是原生 HTML / CSS / JavaScript，数据全部落在本机磁盘。

## 当前能力

- 项目管理：创建、复制、编辑、删除项目，拖拽调整项目卡顺序，并查看项目运行状态与历史。
- 执行模块：发现内置模块和 `D:\Projects` 各项目仓库中的 `.apex/module.json`，并将模块组合到项目中运行；ControlPod 负责枢纽编排，不收纳独立项目的业务代码与运行环境。
- 开发者活跃度：首页热力图，底色表达控制台在线时长（页面每分钟静默上报一次），悬停显示当日在线分钟与代码新增 / 删减行数；代码行数由本机 git 仓库只读扫描得出，可在每日 / 每周 / 累计三个口径间切换。
- 跑步数据看板：解析小米运动健康官方导出包，本地生成跑步数据分析看板
  （训练负荷模型、跑姿体检、每日建议）。看板是**独立仓库** `../run-analytics`，
  总控台只负责接入与启动；健康数据不出本机。
- APEX 一键启动：真实检查并编排 AK、Steam 与 APEX 的启动 / 关闭。实现和本地运行环境位于**独立仓库** `../apex-launcher`，ControlPod 只负责发现、权限提示、编排和运行记录。
- 真实应用：识别 Windows 开始菜单、已注册应用与 App Paths 中的可启动程序；添加后可从控制台启动，并显示 Windows 原生图标。
- 项目上下文：在项目内维护待办、项目记录、文件关联和 Obsidian 主页连接。
- 界面偏好：主题、强调色、信息密度、玻璃质感等外观选项保存在浏览器本机，刷新后保持。
- 桌面外壳：托盘常驻（左键唤起 / 右键菜单）、全局热键 `Ctrl+Alt+A`、关窗缩托盘、单实例互斥、开机自启动、窗口置顶、全屏、无边框卡片外观。
- 两种打开方式：**外壳**（日常入口，可独立运行）与**浏览器模式**（`127.0.0.1:8765`，保留用于对照测试）。两套栈共用同一个 SQLite 库。

## 运行环境

- Windows 10 / 11
- Python 3.12 —— 浏览器模式与后端测试需要；`D:\Projects` 下的独立模块使用各自仓库声明的运行环境；外壳本身不需要
- .NET 10 SDK —— 仅构建外壳时需要（用 `dotnet --list-sdks` 确认有输出；只装运行时的话这里会是空的）。外壳的运行时自带，最终用户不必安装
- Node.js —— 仅用于前端冒烟测试

## 快速开始

### 方式一：桌面外壳（日常入口）

```powershell
git clone https://github.com/duofulang007/ControlPod.git ControlPod
cd ControlPod

# 1. 后端虚拟环境：浏览器模式与后端测试使用（外壳自身不依赖 Python）
powershell -ExecutionPolicy Bypass -File backend\bootstrap.ps1

# 2. 构建外壳（需 .NET 10 SDK：dotnet --list-sdks 必须有输出）
dotnet build shell\ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64

# 3. 运行；也可用 --shortcuts 在桌面建快捷方式
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe
```

外壳把 `https://apex.local/` 映射到仓库根，所以改完 Web 三件套**不必重新构建**，在壳里按 F5 即可生效。

### 方式二：浏览器模式

```powershell
powershell -ExecutionPolicy Bypass -File backend\bootstrap.ps1
powershell -ExecutionPolicy Bypass -File backend\start.ps1
```

随后访问 [http://127.0.0.1:8765](http://127.0.0.1:8765)。

`bootstrap.ps1` 默认自动找本机 Python 3.12；找不到或想指定时显式传入：

```powershell
powershell -ExecutionPolicy Bypass -File backend\bootstrap.ps1 -Python "C:\Python312\python.exe"
```

## 使用方式

### 添加真实应用

进入“应用”页面，点击“添加应用”。系统会扫描本机可验证的启动入口；选择应用、按需修改显示名称和标签、确认后才会写入清单。不会自动添加或启动任何程序。

### 配置项目流程

1. 在“项目”中进入目标项目。
2. 在“运行流程”中进入编辑状态并添加模块。
3. 运行项目，实时查看步骤状态、日志和历史记录。

真实执行失败会保留原始错误，并在失败步骤停止；不会以模拟成功替代真实结果。

## 项目结构

```text
ControlPod/
├─ index.html                 前端入口
├─ app.js                     前端逻辑与页面渲染
├─ styles.css                 全站样式与设计令牌
├─ smoke-test.js              前端冒烟测试（同时是活规格）
├─ shell/                     WinUI 3 桌面外壳（C# 源码）
│  ├─ ApexShell.csproj
│  ├─ MainWindow.xaml.cs      窗口 / 托盘 / WebView2 / WebMessage 桥
│  ├─ LocalApi.cs             壳内路由分发器
│  ├─ Db.cs                   SQLite 门面（与 Python 版逐条对齐）
│  └─ SelfTest.cs             无头自测（--selftest）
├─ backend/
│  ├─ app/                    FastAPI、数据访问与执行服务
│  ├─ modules/                可选的内置模块清单；独立项目在各自仓库维护
│  ├─ tests/                  后端测试
│  ├─ bootstrap.ps1           环境初始化
│  ├─ start.ps1               浏览器模式服务启动
│  └─ console_launcher.py     旧桌面入口（仅外壳未构建时回退用）
└─ AGENTS.md                  项目约束与维护说明（改代码前先读）
```

`run-analytics/`、`dou-link/` 与 `apex-launcher/` 是 `D:\Projects` 下的独立 Git 仓库。项目代码、模块适配器、依赖和虚拟环境均归各自仓库维护；ControlPod 扫描直接子级 Git 仓库中的 `.apex/module.json`，负责发现、绑定、编排、权限提示和运行记录。运行时数据留在所属项目的本地 `data/`，不提交 Git。

## 模块仓库约定

平台（本仓库）与模块项目（如 run-analytics）分仓库管理：

- 模块项目 clone 到 `D:\Projects\<名称>`（与本仓库同级），在项目仓库根创建 `.apex/module.json`，并用 `"projectRoot": "."` 指向本仓库。
- 迁移状态：`run-analytics`、`dou-link` 与 `apex-launcher` 都在自己的 `.apex/` 内维护清单和 runner，并使用各自仓库的依赖与虚拟环境。
- 本地项目按自己的 `README.md` 初始化环境；ControlPod 的 `backend/.venv` 不再作为独立项目的运行环境。
- 提交口诀：改了模块项目 → 在对应仓库 commit/push；改了 ControlPod → 在本仓库 commit/push。若两边都改，分别提交。
- 自检跟着仓库走：模块项目跑它自己的 `tools/check.js`，总控台跑 `smoke-test.js` 与 pytest。

## 验证

```powershell
# 前端（末行必须出现 ALL_PASS）
node smoke-test.js

# 后端
backend\.venv\Scripts\python.exe -m pytest backend\tests -q

# 外壳（无头自测：不建窗口、不碰 WebView2）
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe --selftest
```

## 本地数据与隐私

- 运行数据保存在 `backend/data/`，包括本地 SQLite 数据库、运行记录与日志。外壳与浏览器模式共用这一个库。
- 这些本机数据、虚拟环境与测试缓存已被 `.gitignore` 排除，不会提交到仓库。
- 跑步健康数据（`data.js`）在独立的 run-analytics 仓库里同样被它自己的 `.gitignore` 排除；
  换机器后 clone 两个仓库、双击 `run-analytics\导入数据.cmd` 导入一次即可重建。
- 应用扫描仅读取 Windows 已公开注册的启动入口；控制台不会上传扫描结果或项目数据。
- 活跃度统计完全在本机完成：在线分钟数记进本地 SQLite（`activity_heartbeats` 表），代码新增 / 删减
  通过只读 `git log --numstat` 扫描代码目录得出。要统计的目录写在 `backend/data/activity_config.json`
  的 `codeDirs`（缺省 `D:\Projects`，只扫一层子目录里的 git 仓库，非 git 目录忽略）；该配置文件位于
  已忽略的 `backend/data/` 内，不会进仓库。Obsidian 连接配置与界面偏好存在浏览器本机；其余数据都只落在本机磁盘。

## 现阶段范围

ControlPod（简称 CPod）目前服务于本机开发与自动化管理，不是多用户、云同步或公网部署产品。提交问题时请写明 Windows 版本、复现步骤、页面提示和对应的运行日志。
