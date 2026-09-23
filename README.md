# APEX Console

面向 Windows 的本地个人总控台：把项目、可执行模块、常用应用、项目任务、记录和运行历史收在一个界面中。

这是一个本地优先的个人开发原型。前端由原生 HTML、CSS、JavaScript 构成；后端使用 FastAPI，仅监听 `127.0.0.1`，不会对外暴露服务。

## 当前能力

- 项目管理：创建、复制、编辑、删除项目，拖拽调整项目卡顺序，并查看项目运行状态与历史。
- 执行模块：维护可复用的网站模块与内置 APEX 启动模块，将模块组合到项目中运行。
- 开发者活跃度：首页热力图，底色表达控制台在线时长（页面每分钟静默上报一次），悬停显示当日在线分钟与代码新增 / 删减行数；代码行数由本机 git 仓库只读扫描得出，可在每日 / 每周 / 累计三个口径间切换。
- 跑步数据看板：解析小米运动健康官方导出包，本地生成跑步数据分析看板
  （训练负荷模型、跑姿体检、每日建议）。看板是**独立仓库** `../run-analytics`，
  总控台只负责接入与启动；健康数据不出本机。
- 真实应用：识别 Windows 开始菜单、已注册应用与 App Paths 中的可启动程序；添加后可从控制台启动，并显示 Windows 原生图标。
- 项目上下文：在项目内维护待办、项目记录、文件关联和 Obsidian 主页连接。
- 界面偏好：主题、强调色、信息密度、玻璃质感等外观选项保存在浏览器本机，刷新后保持。
- 本地运行：桌面入口可检查服务状态，打开独立窗口；源码变更后安全重启本地服务。

## 运行环境

- Windows 10 / 11
- Python 3.12
- Node.js（仅用于前端冒烟测试）

## 快速开始

```powershell
git clone https://github.com/duofulang007/apex-console.git apex-console
cd apex-console

# 创建后端虚拟环境并安装依赖
powershell -ExecutionPolicy Bypass -File backend\bootstrap.ps1

# 启动本地服务
powershell -ExecutionPolicy Bypass -File backend\start.ps1
```

随后访问 [http://127.0.0.1:8765](http://127.0.0.1:8765)。

首次启动脚本默认使用现有 APEX Python 3.12 环境作为引导解释器；若你的环境不同，可以显式指定：

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
apex-console/
├─ index.html                 前端入口
├─ app.js                     前端逻辑与页面渲染
├─ styles.css                 全站样式与设计令牌
├─ smoke-test.js              前端冒烟测试
├─ backend/
│  ├─ app/                    FastAPI、数据访问与执行服务
│  ├─ modules/                内置可执行模块（含 runner-lab 导入模块）
│  ├─ tests/                  后端测试
│  ├─ bootstrap.ps1           环境初始化
│  ├─ start.ps1               本地服务启动
│  └─ console_launcher.py     桌面一键入口
└─ AGENTS.md                  项目约束与维护说明
```

`run-analytics/`（跑步数据看板）是**独立 git 仓库**，按「每个项目模块一个仓库」的约定
放在本仓库的同级目录（`D:\Projects\run-analytics`），`backend/modules/runner-lab/module.json`
的 `projectRoot` 用相对路径 `..\run-analytics` 指向它。总控台仓库不跟踪其任何文件。
（接入层目录沿用历史名 `runner-lab`，与运行历史、模块 id 绑定，**不要改名**。）

## 模块仓库约定

平台（本仓库）与模块项目（如 run-analytics）分仓库管理：

- 模块项目 clone 到 `D:\Projects\<名称>`（与本仓库同级），在 `backend/modules/<模块>/module.json`
  里用相对路径 `..\<名称>` 声明 `projectRoot`。
- 提交口诀：改了模块项目 → 在模块仓库里 commit/push；改了总控台（含 `backend/modules/`
  下的模块接入层）→ 在本仓库 commit/push。两边都改就两边各提交一次。
- 自检跟着仓库走：模块项目跑它自己的 `tools/check.js`，总控台跑 `smoke-test.js` 与 pytest。

## 验证

```powershell
# 前端
node smoke-test.js

# 后端
backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

前端测试末行出现 `ALL_PASS` 才表示通过。

## 本地数据与隐私

- 运行数据保存在 `backend/data/`，包括本地 SQLite 数据库、运行记录与日志。
- 这些本机数据、虚拟环境与测试缓存已被 `.gitignore` 排除，不会提交到仓库。
- 跑步健康数据（`data.js`）在独立的 run-analytics 仓库里同样被它自己的 `.gitignore` 排除；
  换机器后 clone 两个仓库、双击 `run-analytics\导入数据.cmd` 导入一次即可重建。
- 应用扫描仅读取 Windows 已公开注册的启动入口；控制台不会上传扫描结果或项目数据。
- 活跃度统计完全在本机完成：在线分钟数记进本地 SQLite（`activity_heartbeats` 表），代码新增 / 删减
  通过只读 `git log --numstat` 扫描代码目录得出。要统计的目录写在 `backend/data/activity_config.json`
  的 `codeDirs`（缺省 `D:\Projects`，只扫一层子目录里的 git 仓库，非 git 目录忽略）；该配置文件位于
  已忽略的 `backend/data/` 内，不会进仓库。Obsidian 连接配置与界面偏好存在浏览器本机；其余数据都只落在本机磁盘。

## 现阶段范围

APEX Console 目前服务于本机开发与自动化管理，不是多用户、云同步或公网部署产品。提交问题时请写明 Windows 版本、复现步骤、页面提示和对应的运行日志。
