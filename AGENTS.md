# AGENTS.md · 控制台项目接手说明书

> 给任何要读 / 改这个项目的 agent：**先读这一份，再动代码**。术语、硬约束、架构、验证方式与全部已踩过的坑都在这里。
> 最后更新：2026-09-25 · 测试基线：**前端 `node smoke-test.js` ALL_PASS（728 项）+ 后端 `pytest backend/tests -q` 98 通过（另有 4 项 `test_apex_launcher` 既存失败，见 §10 末）+ 壳自测 `ApexShell.exe --selftest`（238 项）**
>
> **当前形态（先看这段）**：项目已从「静态前端 + Python 后端」演进为 **WinUI 3 壳（`shell/`）+ Web 三件套 + Python 后端（仅为浏览器模式保留）**的单仓库结构。**日常入口是壳**：`shell\bin\x64\Debug\net8.0-windows10.0.19041.0\win-x64\ApexShell.exe`（路径深，用快捷方式：桌面「APEX 总控台」，或跑 `ApexShell.exe --shortcuts` 重建）。**二期移植已全部完成**——51 条 API 路由都在壳内就地回答，壳可独立运行、不再探测或拉起 Python；Python 仍保留是因为浏览器模式（`backend/start.ps1` → `127.0.0.1:8765`）与 pytest 那 90 项对照基线还要用它。**两套栈共用同一个 SQLite 库**（`backend/data/apex-console.db`，`user_version` 协议），这是「边移植边不停机」的关键红利。

---

## 1. 这是什么

个人开发者用的**本地总控台**：继续开发、一键启动应用与网页、项目任务、项目记录与项目文件，全部收在一个界面里。

- **前端**：HTML + CSS + 原生 JS，零构建、零依赖。
- **后端**：两套实现共用一份数据——①壳内 C# 服务（主线，WinUI 3 + WebView2 + Microsoft.Data.Sqlite）；②Python FastAPI（仅 `127.0.0.1:8765`，供浏览器模式与 pytest 对照）。
- **定位**：自用的真实工具（不是原型演示，也不是可上线产品）。**不得静默回退成假成功 / 假执行**：后端断开、模块缺失、权限被拒或执行失败时，保留原始错误并停在第一个失败步骤。

---

## 2. 文件地图

| 文件 | 作用 |
|---|---|
| `index.html` | 入口骨架：侧栏 + 导航 + 顶栏 + `#view` + 三个全局宿主（详情抽屉 / 编辑弹窗 / 命令面板）+ 提示条 |
| `styles.css` | 全部样式，设计令牌集中在顶部 `:root`（暗色在 `[data-theme="dark"]`） |
| `app.js` | 全部前端逻辑：数据种子 `DATA` → 运行时状态 `S` → `render()` 渲染器 → 底部大 `switch` 事件分发 |
| `smoke-test.js` | 冒烟测试，**同时是本项目的活规格**：读它就知道每个功能的预期行为 |
| `AGENTS.md` | 本文件 |
| `shell/` | **WinUI 3 壳**（C# 源码 + 构建产物）。源码在 `shell/*.cs`，产物在 `shell/bin/...`（不进 git） |
| `backend/` | Python FastAPI 应用、可执行模块包（`backend/modules/`）、运行数据（`backend/data/`）、后端测试 |

- **根目录只放源码**：不加文档、截图、备份、快捷方式或构建产物（`shell/` 与 `backend/` 是仅有的两个子目录）。
- `backend/.venv`、`backend/data`、`shell/bin`、`shell/obj` 是本机生成物，不属于源码。
- 历史形态归档在 `../backups-2026-09-15.zip`；开发过程记录在 `D:\Projects\.workbuddy\memory\YYYY-MM-DD.md`（外层，不在本仓库）。

---

## 3. 怎么跑、怎么验

```bash
# 日常入口：双击桌面「APEX 总控台」（指向壳 exe）；或直接跑
ApexShell.exe                       # 开窗口（托盘常驻、Ctrl+Alt+A 唤起、关窗缩托盘）
ApexShell.exe --selftest [日志]      # 壳无头自测（不建窗口不碰 WebView2，238 项）
ApexShell.exe --shortcuts           # 重建桌面快捷方式（指向当前 exe）
ApexShell.exe --inspect-shortcuts   # 列出桌面/开始菜单里所有 APEX 快捷方式及其真实目标
ApexShell.exe --stages=exec,routes  # 只跑指定自测阶段（排查用二分）

# 前端活规格（末行必须 ALL_PASS）
node smoke-test.js

# 后端对照测试（90 通过 + 4 项既存失败）
backend/.venv/Scripts/python.exe -m pytest backend/tests -q

# 浏览器模式（Python 后端；壳已不依赖它）
powershell -ExecutionPolicy Bypass -File backend/start.ps1   # → http://127.0.0.1:8765
```

- 壳用 `SetVirtualHostNameToFolderMapping` 把 `https://apex.local/` 映射到**仓库根**，所以**改完 Web 三件套 Ctrl+S、壳里 F5 立即生效**（不用重新构建）。
- 壳层日志：`%LOCALAPPDATA%\ApexShell\web-shell.log`（导航 / 托盘 / 本地路由 / 图标拦截全链路留痕）。
- 构建壳：`cd shell && C:\Users\23221\.dotnet\dotnet.exe build ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64`。**构建前必须先结束运行中的壳**（否则 exe 被锁，报 MSB3027）。
- 测试原理（前端）：用 `vm` + 极简 DOM 桩加载 `app.js`，末尾注入 `globalThis.__T = { 要测的函数… }` 作为导出清单，再逐块断言（含**源码级接线断言**与 **CSS 规则断言**）。**新增可测函数必须同步加进导出清单**，否则测试取不到。视觉细节仍需人眼看预览。

---

## 4. 术语（界面为准）

| 概念 | 用词 | 备注 |
|---|---|---|
| 一个可运行单元 | **项目** | 数据层字段仍叫 `workflow` / `WF_SEED`（历史遗留，**不要改**） |
| 流程里的单个动作 | **步骤**，配置动作叫 **步骤编排** | 「添加模块」是进入编辑模式的入口按钮 |
| 模块库的编辑 / 添加页 | **模块** | 导航第 5 项；**页面 id 仍是 `scripts`**（历史遗留路由，勿改） |
| 可选模块的资源卡片 | **执行模块库** | 原名「资源库」，**勿回退**；指项目编辑态里那块选择面板，**不要**与导航项「模块」混为一谈 |
| 执行整个流程 | **运行项目** | 页头主按钮；旧称「运行工作流」 |
| 项目内容区 | **开发上下文** | 项目任务 / 项目记录 / Obsidian / 文件两栏布局 |
| 项目那趟运行的名字 | **流程名**（`flowName`） | 后端 `projects` 表**没有这个字段**，「没有名字」是常态。**取它一律走 `flowNameOf(w)`**（唯一出口）：有名字用名字，缺失返回「未命名流程」。禁止直接读 `w.flowName`，也禁止用占位流程名顶替。 |
| 命令面板首个分组 | **常用项目** | 由项目表派生，按**最近使用降序**（`lastTs`，从未运行 = `0` 沉底）；提示列 `lastUsedLabel(w)` 与排序键同一口径 |

- **禁用词**：「菜谱」。**禁用值**：任何看着像真名的占位流程名（会被深拷贝到每个无 seed 的项目上）。
- 界面文案一律中文；**不用 emoji**；**图标一律内联 SVG**（`IC.*` 或 `tIco()`）。

---

## 5. 硬约束（违反即返工）

1. **不引入** React / Vue / Tailwind / 前端打包器。后端只监听 `127.0.0.1`。
2. **真实执行不得静默回退**（见 §1）。
3. 界面用词遵守 §4 术语表。
4. 总控台是**单屏 bento 网格，无纵向滚动**；卡片背景保持**纯色 / 纯渐变**，**禁止挂图片**。
5. 所有**删数据**的操作必须「**预演 + 二次确认**」；空库时允许 0 个项目，必须渲染真实空态。
6. 视觉调整**只改 `styles.css` 顶部 `:root` 令牌**，不在组件里硬写 px。
7. **断点只做结构切换，连续变化交给 `clamp` 令牌**：全项目**仅 4 个断点**——`max-width:1199.98px`（侧栏收 76px 图标条）、`max-width:959.98px`（总控台 bento 单列堆叠）、`max-height:799px`（垂直令牌降档）、`max-height:659px`（解除单屏约束）。历史废弃断点（860/900/1080/1180/1280/820/760）在 smoke-test 里有**负向断言禁止回潮**。
8. 不留死代码：删功能要连数据、动作分支、样式、断言一起清（有全局护栏断言查「CSS 里的零引用类名」）。**这条护栏是 `includes()` 子串匹配、不是词边界**——只要别处出现过含相同子串的标识符（如 `playerOn` 之于 `.player`），孤儿类就会被误判成「有引用」；判定前先按子串实查一遍 `app.js` / `index.html`。

---

## 6. 架构速览

### 前端状态

- `DATA`：种子数据（`projects / obsidian / apps / todosPlan / activities / notices / notes / sceneModes / devContext / projMeta / projectTemplate / modules` 等）。后端接入后大部分由 `/api/bootstrap` 重建。
- `S`：运行时状态（**73 个字段**）。除 `S.obsidian` 与 **7 个外观偏好** `theme / accent / density / glass / notify / save / telemetry`（即 `PREF_KEYS`，**落 localStorage**）之外，其余刷新即重置。常用：`S.page` · `S.proj` / `S.wf`（项目 **id**）· `S.running` · `S.todos.plan` · `S.notes` · `S.wfEdit` · `S.zoneH` · `S.modTab` / `S.modQ` · `S.heatDays` / `S.heatDetail` / `S.heatMode` · `S.density` / `S.accent` / `S.theme` / `S.glass` / `S.notify` / `S.save` / `S.telemetry` · `S.windowState` / `S.windowUpdating`（窗口置顶控件）· `S.projectRuntime`。
- **`proj` 这个字段名装两种东西**：`S.proj` / `S.wf` 装项目 **id**；`todos.plan[].proj` / `modules[].proj` / `notes[].proj` / `activities[].proj` 与 `DATA.projMeta` / `DATA.devContext` 的**键**装项目 **名字**。按名字关联的靠 `renameProjRefs()` 迁移、`purgeProjRefs()` 清理。
- 浏览器本机持久化**只有两个键**：`apex-console.obsidian.v1`（只允许 `vault/projectFolder/bindings`）与 `apex-console.prefs.v1`（**恰好 7 个字段**，新增偏好只能改 `PREF_KEYS` + `normalizePrefs` 白名单）。**不要再加第三个键**：其余一切归 SQLite。
- 渲染：`render(keepScroll)` → `PAGES[S.page]()` 拿 HTML 字符串 → 写进 `#view`；全站**事件委托**（`data-act="动作名" data-id/data-v` → 底部 `switch`，新增交互 = 加 `case` + 挂 `data-act`）。
- 单一事实源：「普通任务」与「待修改」是同一份 `S.todos.plan`（`kind` 区分，内部字段，对外恒显示「待办」）；「项目记录」与「灵感」是同一份 `S.notes`（灵感 = `tag==='灵感'`）；项目内计数一律由 `devCounts()` 派生。**不要新增第二份数据，也不要加「同步」按钮**。
- 全局 DOM 宿主：`#drawer/#drawerMask`（**仅纯查看**）· `#noteModal`（**所有编辑 / 填写表单的唯一宿主**，`openModal(html,{form:true})`，窄版 `--modal-w-form` / 宽版 `--modal-w`）· `#paletteMask` 等命令面板 · `#toasts`。
- **转义纪律**：进 HTML 的**数据值**必须过 `esc()`（`toast()` 内部已 `esc`）。属性位置同理。

### 后端数据面（两套栈共用）

- **SQLite 结构版本用 `PRAGMA user_version`**，迁移集中在 `backend/app/db.py` 的 `MIGRATIONS`（C# 侧 `shell/Db.cs` 的 `Migrate` 逐条复刻）。**新迁移只能追加**，必须保留旧库数据并加升级测试；**库版本高于程序版本必须拒绝启动**，不得降级覆盖。`PRAGMA foreign_keys` 是连接级设置，每次开连接都要重设。
- 任务 `kind` 与前端共用 `todo` / `fix`；项目记录 `tag` 仅允许 日常 / 技术 / 复盘 / 灵感，`links_json` 保存只读历史关联。新建 / 修改 / 删除**一律以后端成功返回为准，失败不改本地列表**。
- 「编辑基本资料」`PUT /api/projects/{id}/basic-info` 一次提交开发字段 + 任务 + 记录 + 开发要求，**同一事务内校验、任一条无效整批回滚**；成功才重建本地 `S.todos.plan` / `S.notes` / `DATA.devContext` / `S.projRules`。
- **项目删除**：`GET .../delete-preview` 先返回任务 / 记录 / 模块绑定 / 运行记录四类计数；有排队或运行中的动作时**必须先关闭项目**；最后一个项目由前后端共同拦截。确认后靠外键级联一次删除（共享模块本体不删），前端再 `purgeProjRefs()` 清界面数据（与改名链路 `renameProjRefs()` 是一对，口径必须对齐）。
- **应用清单**：`applications` 表存名称 / 分类 / 图标 / 常用 / 使用次数 / 真实启动入口（`launch_path` + `source_key`）。启动前必须**按 `source_key` 重新验证入口仍在本次扫描结果内**，成功才增加使用次数；`from-scan` 只接受扫描 id，前端不能提交任意路径。「移除」只移出控制台清单，**绝不删本机安装目录**。应用加入项目走隐藏的 `application:{app_id}` 适配模块（不出现在「模块」页）。

### 活跃度热力图（数据全真）

- `GET /api/activity/daily`（默认 371 天 = 53 周）按**本机本地日**返回 `{online, adds, dels, count}`。online 来自 `POST /api/activity/heartbeat`（页面开着每 60s 静默上报，`activity_heartbeats` 表按日累加分钟，多标签页多算无妨）；adds/dels 来自扫 `codeDirs`（`backend/data/activity_config.json`，**缺省 `D:\Projects`、只扫一层、`[]` = 彻底关闭**）下各 git 仓库的 `git log --numstat`，5 分钟进程内缓存。
- **底色只表达在线时长**（`buildHeatPayload` 取 `online`，不读后端的 `count`），色阶对数五档走单一蓝色系 `--dash-heat-0..4`，**严禁掺红绿**；代码增删只在悬停气泡用色（+ 绿 / - 红）。
- 卡片只渲染**末尾 13 周**（`S.heatDays` 切片，首列必为周一；91 格，改 `HEAT_CARD_COLS` 一处即可切密度）。布局是**纯 CSS Grid 自适应卡宽**：方格用 `.heat-cell::before{padding-top:100%}` 撑正方形（**禁用 `aspect-ratio`**，踩过它在 `auto` 行轨道下被忽略、整片塌成一条线）。月份刻度与格子共用列模板；打标三条规则：①只在月份切换处打；②**不足 2 列的「残月」不打**；③**两标至少隔 3 列**。刻度串**必须 `join('')`**（直接拼数组会往格子间塞逗号）。明细只进悬停两行气泡（`日期 · 在线 N 分钟` / `+A / -D`），**今天之后的格子只作浅灰占位**。后端未就绪时如实显示「活跃度暂不可用」，不得渲染全零假象。

---

## 7. 壳（ApexShell）

**形态**：WinUI 3，非打包，SelfContained + WindowsAppSDKSelfContained（运行时全自带）。已接管：窗口本体、托盘常驻（左键唤起 / 右键菜单）、全局快捷键 `Ctrl+Alt+A`、关窗缩托盘、单实例互斥、系统 Toast（托盘气球）、**开机自启动**（写 `Run` + `StartupApproved\Run` 双位置）、**窗口置顶**（`OverlappedPresenter.IsAlwaysOnTop`）。

**路由分发**（`shell/LocalApi.cs`）：WebMessage 桥上先由 `DispatchProjectDomain` 接手——**执行域 → 模块域 → 项目域**三级兜底，未命中返回 null 交回 HttpClient 应急代理。**51 条路由全部已移植**，清单在 `LocalApi.CoveredRoutes`；自测 `routes` 阶段把它与 `backend/app/main.py` 里实际定义的路由做**双向比对**，任何一边多出来都失败——**新增路由必须同步补清单**。`/bootstrap` 与 applications / executions 组都甩到 `Task.Run`（重查询 / 真扫描 / 子进程，别冻 UI）。异常到 HTTP 状态的映射与 FastAPI 版一一对应（404 / 409 / 422 / 503 / 500）。

**源码一览**（都在 `shell/`）：

| 文件 | 职责 |
|---|---|
| `App.xaml.cs` | 启动分支：`--selftest` / `--shortcuts` / `--inspect-shortcuts` / 单实例互斥 |
| `MainWindow.xaml.cs` | 窗口、托盘、WebView2 初始化、虚拟主机映射、**WebMessage 桥**、**应用图标网络栈拦截** |
| `LocalApi.cs` | 路由分发器 + 请求体校验（pydantic 等价物）+ `CoveredRoutes` 清单 |
| `ConsoleConfig.cs` | 路径配置（镜像 `backend/app/config.py`，硬编码仓库根） |
| `Db.cs` | SQLite 门面：迁移 1–10 复刻、`Execute/FetchOne/FetchAll/Transaction/WithTransaction` |
| `StartupManager.cs` | 开机自启动（`Run` + `StartupApproved\Run` 双位置） |
| `ApplicationScanner.cs` | 开始菜单 / UWP / App Paths 扫描 + 图标提取（`SHGetFileInfoW` + 手写 PNG 编码器） |
| `ApplicationCatalog.cs` | applications 路由组业务层（`ValidateLaunch` 是公共校验） |
| `ModuleRegistry.cs` | `module.json` 解析与校验 |
| `ModuleRunner.cs` | 三类模块（web / application / script 落地子进程）+ `sync_registry` |
| `ExecutionService.cs` | 执行编排（项目锁、失败即停、中断恢复） |
| `ProjectService.cs` | 项目 / 任务 / 记录 / 文件 / 基本资料 |
| `ModuleService.cs` | 模块管理 + 项目↔模块 / 应用绑定 |
| `ActivityService.cs` | 心跳 + 日聚合（git numstat 扫描） |
| `WindowHost.cs` | `IConsoleWindowHost` + 壳实现（置顶）；无窗口时如实报不可用 |
| `BootstrapService.cs` | `/bootstrap` 12 键聚合（键名与 Python 版逐字对齐） |
| `SelfTest.cs` | 无头自测（`--selftest`，含全部阶段） |
| `ShortcutMaker.cs` | 桌面快捷方式生成 / 排查（走壳内 COM） |
| `TrayHost.cs` | 托盘 + Win32 导入 |

**关键设计**：
- **可注入**：`LocalApi` 的每个依赖都可注入，`SelfTest` 因此能在无窗口进程里跑真业务逻辑（`initOnStart:false` 跳过启动期副作用）。
- **无头自测**：`--selftest [日志]` 走 `App.OnLaunched` 分支，**不建窗口不碰 WebView2**——工具会话出身也能跑（绕开安全软件对 WebView2 的拦截），结果**逐条落盘**（进程被掐也能看到死点）+ 退出码。阶段：`base` / `startup` / `scan` / `realscan` / `icon` / `catalog` / `registry` / `exec` / `window` / `activity` / `projects` / `modules` / `bootstrap` / `routes`。
- **自测环境限制**：派生 `powershell.exe` 会被安全软件连根掐 → 扫描类测试用 `useShellLists:false`（只关 UWP 清单，其余全真）。应用绑定测试**必须用真扫描候选**（`source_key` 要能被重新验证，造假 key 一定 409）。
- 自测断言要**防自嗨**：注册表辅助直接操作 Registry 而非走被测类。

---

## 8. 页面与组件地图

导航 5 项（顺序固定）：**总控台 / 项目 / 模块 / 应用 / 设置**（第 6 个 `workflows` = 项目详情页，不进导航）。

- **总控台**：继续工作 hero + 最近打开 + 最近活动；单屏无纵向滚动。
- **项目（选择页）**：卡片栅格 + 尾部新建卡（切状态 / 复制 / 刷新 / 删除）。运行控件 `projectRunControlsHTML()` **必须由选择页卡片与详情页头共用**，不得各写一套；`S.projectRuntime` 由 `/api/projects/{id}/runtime` 恢复，刷新后不能退回假空闲。
- **项目详情页**（`S.wf`），四区块：① 概览（身份卡 + 能力卡 + 统计卡）；② **开发上下文**（左：当前任务区 + 高 / 中 / 低优先级区，可拖拽、可空、区高可调；右：Obsidian 资料中枢卡 + 项目记录 + 项目文件）；③ **运行流程**（单张卡：状态徽标 + 「添加模块」入口 → 状态摘要 / 日志终端 → 主流程蛇形视图 → 历史记录；主流程每行 5 节点、蛇形走向、行间 S 形曲线；节点三态：已完成绿 √ / 进行中品牌色 / 未开始空心）；④ 设置（开关 + 裸红色「删除项目」长条）。
- **模块**（页面 id `scripts`）：执行模块的唯一编辑 / 添加入口。新增用内置 `web` 模板（名称 / 网站地址 / 描述），项目归属只由 `project_modules` 多对多绑定维护。磁盘清单模块显示为「内置模块」，**不得从页面改写或删除**。删除走预演 + 二次确认，解除绑定但**保留历史运行记录**。
- **应用**：列表 + 惯性滚动 + 分类标签；「添加应用」两步（选择真实应用 → 可选改名改标签 → 确认）。扫描结果在弹窗内容区独立滚动、底部操作始终可见；**不得恢复静态池 / 空壳应用 / 后端断开时的假成功**。
- **设置**：外观（7 个偏好）、通用行为、快捷键、Obsidian 全局连接。
- **命令面板**：`Ctrl+K`，`buildPalette()`。「常用项目」分组必须由 `DATA.projects` 派生（**不要写死项目 id**）；`startRun(id)` 必须明确判存在，**不要 `find(...) || curWf()` 兜底**。
- **抽屉 / 弹窗边界**：**所有「编辑 / 填写」走居中弹窗**，**右侧抽屉只保留「纯查看」**（应用 / 项目详情）。禁止为编辑表单新开抽屉。
- **任务表单**：「新建」与「编辑」共用 `todoFormHTML()`（标题 → 截止 → 优先级三段逐字一致），**只有两处差异**：标题文案、编辑多一个「删除」按钮。所属项目只读展示。

---

## 9. 样式系统

- 令牌集中在 `styles.css` 顶部 `:root`（暗色在 `[data-theme="dark"]`）：**文字** `--ink/-2/-3/-4`；**描边** `--line/-2`；**品牌** `--brand:#E8402A` 系列；**语义色** `--green/blue/amber/purple/teal/slate`（各配 `-bg`）；**项目三态** `--st-ok/-dev/-pause`；**表面** `--card/--card-strong/--tile/--tile-2/--hover/--bg/--side`；**圆角** `--r-card:20px/--r-inner:14px/--r-sm:10px/--r-pill`；**间距** `--pg/--pg-sm/--gap/--pad`；**阴影** `--sh/--sh-lg`；**尺寸** `--side-w:240px/--main-max:1440px/--tile-min:290px/--app-row-h:46px`；**动效** `--ease-out/--motion-press/--motion-panel`；**专项** `--term-bg:#2E3440`、`--modal-w:760px`、`--modal-w-form:480px`、**`--win-min:720px`**。
- **密度令牌走 `clamp` 连续缩放**（如 `--dash-title:clamp(21px,1.35vw+8px,28px)`），断点之间字号 / 留白无跳变；断点只做结构切换（见 §5 第 7 条）。
- **全站最小压缩宽度地板**：`body{min-width:var(--win-min);overflow:auto}`（常态无滚动条，窄窗只出横向滚动条）。语义：**适配到 720px 为止，再窄是「不可读」，不是「响应式」该管的事**。
- **侧栏折叠双模**：宽窗口 `.mini` 常驻折叠；紧凑窗口（≤1199.98px）走 `side-flyout` 浮层展开（点侧栏以外任意处收起，`matchMedia change` 拉宽后自动作废浮层态）。W1 区间的隐藏规则全部加 `:not(.side-flyout)` 门控。
- 卡片三件套 `.card` / `.card-head` + `.card-title` / `.list` + `.row`。文字层级：标题 16px/600 → 小标 11px `--ink-3` → 正文 12.5–13px → 辅助 11px `--ink-4`。

---

## 10. 常踩的坑（都真踩过）

**通用 / 前端**

1. **文本替换要覆盖足够上下文**：`old_string` 若切到下一个 `case` 的开头，会把相邻分支吞掉——改完立刻回读文件确认。**长单行条目（如本文档置顶）尤其危险：Edit 会吃掉相邻条目的标题行**；插入内容后用「新内容 + 换行 + 原 old_string 全文」的写法才安全，并回读校验全部相邻标题。
2. 同一个 `try` 块里「先用后声明」的 `const` 会 **TDZ 报错**；跨块引用变量无效。
3. 运行引擎时序：`startRun` 首帧**全部 `wait`**；第一次 `advanceRun` 才点亮首个步骤为 `now`；第二次才出现 `done`。写断言别猜。
4. 蛇形流程的**行容器必须带 `rev` 类**才右对齐，否则节点与 S 弯端点错位。
5. 贴边通栏元素的小圆角**视觉上等于没有**；要明显圆角就做成悬浮卡片。
6. 清 CSS 死代码：选择器里**任一**类名在 `app.js` / `index.html` 里从不出现 → 该规则不可能命中（祖先类活着不代表规则活着，如 `.player .p-info`）。清理前先排除运行时拼接。
7. **本机安全策略拦截**：PowerShell 的 `Add-Type`（含 `-AssemblyName`）与 `New-Object -ComObject WScript.Shell`（"COM object instantiation can run arbitrary code"）都会被拦；`reg.exe` 也在黑名单。**取像素 / 调 .NET 用隔离 Python；读注册表用 Python `winreg`；建快捷方式 / 解析 lnk 走壳内 CLI**（壳进程内的 COM 是通的）。
8. 打包中文名文件别用 PowerShell `Compress-Archive`（乱码），用 node + zlib 自写 ZIP（UTF-8 标志位 `0x0800`）。
9. **「三态 / 多态」配色：类名列表和 CSS 规则必须一一对齐**，漏一条就是隐形的黑点（`.st-switch .dot{background:currentColor}` 会退化成继承色，看起来像「黑色」而不是「没颜色」）。测试已加断言（每个 `st.cls` 都要有 `.{cls}{` 规则）。
10. **`stCls` 与 `st` 是两份数据，可能对不上**：卡片 badge 直接渲染 `w.stCls`，状态切换控件走 `projStDef(w.st).cls`——改状态样式时别只看其中一处。
11. **源码是纯 LF，批量改写别把整份文件变成 CRLF**，否则按 `\n` 精确匹配的源码级断言静默失效（报出来的条目还看起来毫不相干）。批量改写用 `newline=''` 或二进制 `replace(b'\r\n', b'\n')`；改完复核 `b.count(b'\r\n')`。
12. **写否定断言时，注释里出现被否定的字面量也会命中正则**（`!startRun\('apex'\)/` 会被注释里的历史说明命中）。写这类注释不要带具体调用字面量。
13. **批量全局替换前先分类**：同名可能指两种概念（`proj` 既指 id 又指名字）。先 `grep -n` 列全部出现位置并分类，再决定范围。
14. **「设置页开关」通病是「看着能点、其实没接线」**：`data-act="switch"` 只翻转 DOM class，初值写死在 markup 里 → 任何重绘就弹回、刷新全丢。**修法固定三步**：①`S` 加字段 + 进 `PREF_KEYS`/`normalizePrefs`；②写一个只操作 `<html>` 的 applier 并注册到 `applyPrefs()`；③事件分支改成「改 `S` → applier → `persistPrefs()` → `render(true)`」。
15. **`classList` 也要进 DOM 桩**（否则 `applyGlass()` 抛异常导致整份 app.js `LOAD_FAIL`），且必须有**真实记忆**（`Set` 支撑 add/remove/toggle/contains）。同理 `ctx.matchMedia` 也要有桩（空 addEventListener）。
16. **占位符不许当数据用**：`DATA.projectTemplate` 是新建项目的深拷贝底板，模板里每个字段都会变成真实项目字段。**模板里只放真正的默认值**；要兜底文案写成渲染期函数（`flowNameOf()`）。
17. **「好几条一模一样」几乎总是「兜底值 + 标签缺主体」**：排查口诀——先问「这个字段缺省时是什么」，再看「这条标签里有没有能区分主体的信息」。
18. **排序键必须是数值**：展示文案（如「9月22日 13:30」）按字符串比毫无意义。适配层另存毫秒数（`backendEpoch()`，缺失 / 非法为 `0` 让「从未运行」沉底），文案只负责显示；本地更新数据时顺手刷新排序键，但**不要用 `Date.now()` 凭空造时间**。
19. **测试里断言 `let` 变量的实时值，导出必须用 getter**（`Object.defineProperty(__T, 'x', {get(){return x}})`），否则只快照成注入那一刻的值。

**后端 / 执行栈**

20. **真实 APEX 模块不要改回长 PowerShell 启动器**：旧入口曾被 Defender 识别为 `HackTool:PowerShell/ApexToolkit.A`，脚本在参数解析前就被 AMSI 拦截。当前 `backend/modules/apex-launcher/runner.py` 由 APEX 自己的 Python 虚拟环境执行，通过 `runas` 请求提权；`module.json` 不含 PowerShell。不要用关防护 / 白名单规避。
21. **一键入口只结束已验证的监听进程，不要改回 `taskkill /T`**：虚拟环境解释器有父子进程，`/T` 可能报「拒绝访问」。先用健康检查确认服务身份，再对监听 PID 使用最小权限。
22. **自管滚动不要捕获按钮的指针**：惯性滚动容器若对按钮 `setPointerCapture`，鼠标点击会被吞（键盘 Enter 却可用）。交互控件先经 `appScrollDragBlocked()` 排除。
23. **无人值守的模块绝不能停在交互输入上**：Windows 上 `getpass` 会绕过 stdin 重定向直接读控制台，**永久挂住**（表现为项目卡在「运行中」）。交互式脚本被模块调用前必须加 `--no-prompt` 类开关 + 超时。
24. **项目名来自 manifest**：新增模块必须在 `module.json` 显式声明 `projectName` / `projectDescription`，否则继承 `module_registry.DEFAULT_PROJECT_*` 的文案。
25. **占位符**：`{module_dir}` `{project_root}` `{console_root}` `{run_dir}` `{result_path}` `{log_path}`。**跨项目模块引用 console 自己的虚拟环境时必须写 `{console_root}`**，不要写绝对路径。**占位符展开必须留在 `try` 里**——异常从 try 前逃出会让 run 永远停在 `running`（项目卡死「运行中」，按钮消失，看起来像「点了没反应」）。
26. **模块要开窗口就用 `pythonw.exe` + `DETACHED_PROCESS`**，不要等窗口关闭（否则跟着来一个黑框，且调用方退出时被连带回收）；pid 记在 `%TEMP%` 下，靠它精确结束；**不要**用 `taskkill /IM pythonw.exe`。
27. **模块项目是独立 git 仓库，放在 console 同级目录**（如 `D:\Projects\run-analytics`）：`module.json` 的 `projectRoot` 写相对路径，`module_registry` **相对 console 根**解析（不按 cwd、不写死盘符）。
28. **C# 壳侧（二期移植踩过的）**：
    - `catch (A or B ex)` **不是合法 C#**——异常过滤要写 `catch (Exception ex) when (ex is A or B)`。
    - `x.Result;` 作为**丢弃结果的裸语句**编译不过（CS0201），必须 `_ = x.Result;`。
    - `await Task.Run(...)` 默认捕获调用方上下文，**UI 线程用 `.Result` 等待会死锁**——库代码一律 `.ConfigureAwait(false)`（表现为自测卡死、日志缺汇总行）。
    - `ContinueWith(_ => { … out _ … })` 里 lambda 参数 `_` 与 discard 撞名，`out _` 被当成 out lambda 参数（编译报类型错）——lambda 参数改名。
    - `JsonDocument.RootElement` 必须先 `.Clone()` 再让 document 释放，否则 element 悬挂。
    - `List<T>.Reverse()` 是 **void 实例方法**；要 LINQ 反转用 `AsEnumerable().Reverse()`。
    - Nullable 属性模式 `{ Value.X: … }` 的**第一级就作用在解包后的 T 上**，再写 `.Value` 会报「未包含 Value」。
    - **多线程竞态**：「任务收摊」与「finally 落库对其他连接可见」之间有窗口（Python 单线程事件循环没有），等待方见 `RunIsLive=false` 就收手会闪失——收手前重查一拍。
    - 构建输出被运行中的壳锁住（**MSB3027**）：先 `taskkill` 旧壳再构建，新壳需重新启动。
    - **从工具会话启动的进程会被安全软件掐掉 WebView2**：壳一律由人双击 / 自启动拉起，agent 只做构建与无头自测。
    - 本机无系统级 dotnet，用全路径 `C:\Users\23221\.dotnet\dotnet.exe`。
29. **后端测试基线的真相**：`pytest backend/tests` 是 **90 通过 + 4 项既存失败**（`test_apex_launcher.py` 调 `launcher.backend_compatible()`，而该函数从来不存在）。**修掉之前，别把「后端全绿」当成改动的验收前提**。
30. **壳里的模块子进程不能靠「不传 CREATE_NO_WINDOW」来给控制台**：`requires_admin` 分支在 Python 版写 `creationflags=0`，语义是「沿用后端自己那个控制台」；壳是 WinUI GUI 进程、**没有控制台可继承**，于是系统给子进程**新分配**一个控制台窗口，而它的 stdout/stderr 全被重定向进 `process.*.log` → 那个窗口永远空白，用户看到一块悬着的「黑屏」（2026-09-25 实测，项目「APEX 启动」的 `apex-launcher` 每次运行必现）。**壳侧恒为 `CreateNoWindow = true`，不要复刻 `requires_admin` 这条判断**（两套栈在这一处是**有意分歧**，别「对齐」回去）。判定手段：拿 `pythonw.exe` 当无控制台父进程，A/B 各跑一次，子进程自报 `GetConsoleWindow` / `IsWindowVisible` —— `flags=0` 得可见窗口，`CREATE_NO_WINDOW` 得 0。
31. **`apex_launcher` 的输入助手必须用被标记 `RUNASADMIN` 的解释器启动，别改成 `sys.executable`**：`processes.py` 的 `REFERENCE_INPUT_PYTHON` 两条口径差一行，后果却是整条流程停在第一步。**AK.exe 是提权运行的**（非提权进程对它 `SetWindowPos` 会得到 `(5, …, '拒绝访问。')`），**提权窗口在前台时非提权进程的 `SetCursorPos` 直接返回 0、指针纹丝不动**（2026-09-25 实测，AK 一退出就恢复正常）——所以「动鼠标的那个进程」必须同样提权。参考实现（旧启动脚本的 `.bat`、`D:\Py项目\APEX` 那份）正是靠写死 `C:\Users\23221\AppData\Local\Programs\Python\Python314\python.exe`（该 exe 在 `HKCU\…\AppCompatFlags\Layers` 里是 `~ RUNASADMIN`）来保证这一点；换成 venv 的 `sys.executable` 后助手不再被强制提权，`SetCursorPos` 被系统拒绝，而旧代码把真实原因吞掉、只留一个对不上的「实际坐标」，于是现象是「AK 打开后点不动、后面的 Steam/游戏全不执行」。**别把 `REFERENCE_INPUT_PYTHON` 改回 `sys.executable`**；环境变量 `APEX_INPUT_PYTHON` 是给别的机器留的出口。排查手段：`processes.move_mouse()` 的返回里现在带 `error` / `error_detail` / `returncode` / `elapsed_seconds`，非提权进程起 `Python314\python.exe` 会明确报 `[WinError 740] 请求的操作需要提升`。
32. **读子进程 stdout 必须先并发读走再 `WaitForExit`，否则管道满 → 子进程永不退出**：`ApplicationScanner.ListStartApps()` 跑 `powershell.exe Get-StartApps` 会往 stdout 写 **17KB**（本机 203 条清单，stderr 还有 CLIXML 进度流），而匿名管道缓冲区只有 **4KB**。旧写法「先 `WaitForExit(15000)` 再 `ReadToEnd()`」让子进程卡在自己那次写操作上**永不退出** → 必然超时 → 商店/UWP 清单被判失败。后果不是报错而是**静默丢数据**：添加应用里搜不到任何商店应用，而已绑定 UWP 应用（如 ChatGPT/Codex）的项目一运行就撞 `ValidateLaunch` 的 409「入口已失效」——**当年被误记成「派生 powershell.exe 会被安全软件掐」，其实是 .NET 管道死锁**。正确写法（见 `ApplicationScanner.ListStartApps`）：
    ```csharp
    proc.Start();
    var stdoutTask = proc.StandardOutput.ReadToEndAsync();   // 先并发读走
    var stderrTask = proc.StandardError.ReadToEndAsync();
    if (!proc.WaitForExit(15000)) { proc.Kill(true); … }
    stdout = stdoutTask.GetAwaiter().GetResult();
    _ = stderrTask.GetAwaiter().GetResult();
    ```
    Python 的 `subprocess.run(capture_output=True)` 走 `communicate()`，本身就是并发读，所以同一命令 0.74s 返回 203 条——两套栈在这一处**不是命令参数差异**（`-Command` / `-EncodedCommand` / 是否重定向 stdin 实测都不影响）。
    **排查入口**：`ApexShell.exe --scan` 逐层打印扫描结果（开始菜单根 → 快捷方式 → 目标解析 → 商店清单 → App Paths → 最终候选），并把库里每个带真实入口的应用逐个复验、直接点名谁会被判「入口已失效」。**注意自测覆盖不到这里**：`--selftest` 的扫描阶段一律 `useShellLists:false`（关掉商店清单），所以要另跑 `--scan`。


---

## 11. 已删除的模块（**不要加回来**，有负向断言）

- **版本 / 存储页面与假快照机制**、**预备检查卡**（异常改为在运行流程卡内点名）、**执行模块卡**（并入运行流程卡）、**独立待办 / 笔记页**、**收件箱 tab**、**侧栏「Apex 启动脚本」小卡**。
- **「脚本」页与运行终端**：整页取消改为「模块」（`viewScripts` / `runScript` / `.scripts` / `.terminal`… ；`.terminal` / `.t-line` **保留**，应用详情与运行流程卡还在用）。命令面板的「运行上次脚本」改为「打开模块」。**运行输出没有新宿主**，统一看项目「运行流程」卡的 `#termRun`。
- **四份分散的模块数据**：`DATA.scripts` / `webLib` / `folderLib` / `cmdLib` 已合并为 `DATA.modules`（旧键彻底删除）；应用类**不并入**，仍走 `S.apps`。
- **右侧抽屉版「完整开发上下文」与 `wfDev` 家族**：项目页底部改「编辑基本资料」（居中弹窗），有负向断言。
- **专注视图（首页收起态）**：`S.focus` / `S.expanded` / `#focusBtn` / `Ctrl+.` / `.hero` 大标题家族全删。**不要再引入收起 / 展开式的次级模块布局。**
- **任务编辑弹窗的「所属项目」选择器与「关联项目记录」**：任务创建后不能改归属；任务 ↔ 记录的关联两侧都无法编辑，`note.links` 退化成**只读历史数据**。**`detachTodoRefs()` 必须保留**（唯一活着的消费者）。
- **「找不到就顶上第一个」的静默兜底**：`startRun` 明确判存在；命令面板常用分组由数据派生。**这类兜底一律不要**——它把「失败」变成「做了另一件事」。
- **75 条孤儿 CSS 规则**已清（现零孤儿，有全局护栏断言）。**注意护栏的子串匹配会放过**含相同子串的类名。
- **无宿主的引用展示层 + 只写不读的状态字段**（2026-09-24 第二轮清扫）：前端删 `refBadgeOf` / `linkBadgeOf` / `notesLinkedTo` / `noteIsIdea` / `MOD_ENTRY_PH` / `IC` 的 6 个零引用键 / `S._modId` / `S.prepOpen` / `S.projectFileDeletePreview`；后端删 `_rename_tmp.py` / `ACTIVE_STATES`。**有负向断言锁定，不要加回来**。
- **缺宿主的启动/关闭旧接口 + 零规则类钩子**（2026-09-25 第三轮清扫）：前端删 `S._modType` / `S._modProj` / `S.projectFileDeletePreview`（后者 2026-09-24 删过一次、又被当成键写回 `S` 字面量，当时的护栏只查 `S.xxx` 点号形式没拦住；现已改成**裸名字查**）与 5 个零规则类钩子（`dashboard-head` / `tile-menu` / `wf-steps-card` / `txt` / 概览编辑卡上的裸 `ov-edit`）；后端 `apex_launcher` 删 23 个零调用定义（`*_for_ui` / `test_mouse_move` / `launch_game` / `close_game` / `close_steam` / `save_config` / `capture_template` / `AUTOMATION_REVISION` / `ensure_ak_running` 一族，含 7 个连带孤儿，如 `_wait_state` 的调用点全在被删子树里）+ 3 处未使用 import。**有负向断言锁定**（前端 `smoke-test.js` + 后端 `tests/test_automation_dead_code.py`），不要加回来。
- **开发上下文卡头整行删除**：卡片直接以 `<div class="dev-cols">` 开场，**没有卡头、没有标题**——不要「顺手」补回来。
- **任务行格式 `N. [待办][优先级] 正文（截止）`**：类型徽章**恒写「待办」**（「待修改」不出现在任何输出里），优先级三档全显式。**类型徽章刻意不参与解析**——否则模板恒写「待办」会在保存时把 `fix` 条目**静默改成 `todo`**。
- **`0 项目白屏`**：`render()` 里任何在返回 HTML **之前**就取属性的写法，抛错都会造成「页面冻结」而不是报错。现为两层防护（拦「删除最后一个项目」+ 两页空态兜底）。
- **历史副本与探针截图**、**三份旧文档**：归档在 `../backups-2026-09-15.zip`。

---

## 12. 交接规则

- **改完必跑**：`node smoke-test.js`（末行 `ALL_PASS`，728 项）；改壳代码还要跑 `ApexShell.exe --selftest`（238 项，逐条落盘便于定位死点）；改后端还要跑 `pytest backend/tests -q`（98 + 4 既存失败）。**结构变了补断言，删功能补负向断言**。
  - **删根目录文件后务必跑前端冒烟测试**：里面有一条「根目录白名单」断言（`expectedFiles`），删了文件不同步改断言就会红——2026-09-25 删 `00-启动 APEX 总控台.lnk` 时就漏跑过一次。
- **本目录有 git**（`D:\Projects\apex-console`）：动手前先看 `git status`，别破坏性覆盖；提交粒度按主题，别把多个主题混在一个提交里。
- **根目录只放源码**（Web 三件套 + `smoke-test.js` + `AGENTS.md`），其余一律进 `shell/` 或 `backend/`。源码**纯 LF**：批量改写后复核 `b.count(b'\r\n') === 0`（见 §10 第 11 条）。
- 一次只做一个主题的改动，不顺手重构无关代码；需求不明确先问。
- **交付习惯**：改完要给出「已验证可用」的结论（构建 / 测试 / 自测日志 / 无头验证都跑过），不要把「试一下」的循环丢给人；只有必须人眼确认的视觉细节才请人验收。
