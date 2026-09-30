# ControlPod

ControlPod（简称 CPod）是面向 Windows 的本地个人总控台：把项目、可执行模块、常用应用、项目任务、记录和运行历史收在一个界面中。

自用的真实工具，不是原型演示、也不是可上线产品。日常入口是桌面外壳（WinUI 3），界面是原生 HTML / CSS / JavaScript，数据全部落在本机磁盘。

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

仓库内的 Debug/Release 构建把 `https://apex.local/` 映射到源码根，所以改完 Web 文件后在壳里按 F5 即可生效；`D:\Apps\ControlPod` 的正式发布版使用随包携带的 `wwwroot`，更新它需要重新发布。

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
├─ shell/                     WinUI 3 桌面外壳（C# 源码）
│  ├─ ApexShell.csproj
│  ├─ MainWindow.xaml.cs      窗口 / 托盘 / WebView2 / WebMessage 桥
│  ├─ LocalApi.cs             壳内路由分发器
│  ├─ Db.cs                   SQLite 门面与迁移
│  └─ SelfTest.cs             无头自测（--selftest）
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
