# APEX Console

面向 Windows 的本地个人总控台：把项目、可执行模块、常用应用、项目任务、记录和运行历史收在一个界面中。

这是一个本地优先的个人开发原型。前端由原生 HTML、CSS、JavaScript 构成；后端使用 FastAPI，仅监听 `127.0.0.1`，不会对外暴露服务。

## 当前能力

- 项目管理：创建、复制、编辑、删除项目，并查看项目运行状态与历史。
- 执行模块：维护可复用的网站模块与内置 APEX 启动模块，将模块组合到项目中运行。
- 真实应用：识别 Windows 开始菜单、已注册应用与 App Paths 中的可启动程序；添加后可从控制台启动，并显示 Windows 原生图标。
- 项目上下文：在项目内维护待办、项目记录、文件关联和 Obsidian 主页连接。
- 本地运行：桌面入口可检查服务状态，打开独立窗口；源码变更后安全重启本地服务。

## 运行环境

- Windows 10 / 11
- Python 3.12
- Node.js（仅用于前端冒烟测试）

## 快速开始

```powershell
git clone https://github.com/duofulang007/-.git apex-console
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
│  ├─ modules/                内置可执行模块
│  ├─ tests/                  后端测试
│  ├─ bootstrap.ps1           环境初始化
│  ├─ start.ps1               本地服务启动
│  └─ console_launcher.py     桌面一键入口
└─ AGENTS.md                  项目约束与维护说明
```

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
- 应用扫描仅读取 Windows 已公开注册的启动入口；控制台不会上传扫描结果或项目数据。

## 现阶段范围

APEX Console 目前服务于本机开发与自动化管理，不是多用户、云同步或公网部署产品。提交问题时请写明 Windows 版本、复现步骤、页面提示和对应的运行日志。
