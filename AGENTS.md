# AGENTS.md · 控制台项目接手说明书

> 给任何要读 / 改这个项目的 agent：**先读这一份，再动代码**。术语、硬约束、架构、验证方式与全部已踩过的坑都在这里。
> 最后更新：2026-09-29 · 测试基线：**前端 `node smoke-test.js` ALL_PASS（790 项） + 后端 `pytest backend/tests -q`（91 通过） + 壳自测 `ApexShell.exe --selftest`（283 项）**
>
> **当前形态（先看这段）**：**WinUI 3 壳（`shell/`）+ Web 三件套 + Python 后端**的单仓库结构。**日常入口是 Release 版壳**（`shell\bin\Release\publish\ApexShell.exe`，路径深——用桌面快捷方式，或跑该 exe 的 `--shortcuts` 重建；Release 开了 `PublishReadyToRun`、关了符号，冷启动比 Debug 快）；Debug 版（`shell\bin\x64\Debug\...\win-x64\`）只用于调试与自测。**二期移植已完成**：51 条 API 路由都在壳内就地回答，壳可独立运行、不再探测或拉起 Python；Python 保留只为浏览器模式（`backend/start.ps1` → `127.0.0.1:8765`）与 pytest 对照基线。**两套栈共用同一个 SQLite 库**（`backend/data/apex-console.db`，`user_version` 协议）。

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
| `backend/` | Python FastAPI 浏览器兼容层、通用模块发现 / 执行服务、运行数据（`backend/data/`）、后端测试 |

- 根目录只放源码（细则见 §12）：不加文档 / 截图 / 备份 / 快捷方式 / 构建产物。`backend/.venv`、`backend/data`、`shell/bin`、`shell/obj` 是本机生成物，不属于源码。
- 开发过程记录在 `D:\Projects\.workbuddy-ai\memory\YYYY-MM-DD.md`（外层，不在本仓库）。
- `backend/docs/` 只留 `module-authoring.md`（模块最小约定）。Sep-20 那批移植计划与旧架构图已在 2026-09-28 删除 —— 它们描述的是壳接管**之前**的架构（「前端同源请求后端、后端读写 SQLite」），留着会误导。

---

## 3. 怎么跑、怎么验

```bash
# 日常入口：双击桌面「ControlPod」（指向壳 exe）；或直接跑
ApexShell.exe                       # 开窗口（托盘常驻、Ctrl+Alt+A 唤起、关窗缩托盘）
ApexShell.exe --selftest [日志]      # 壳无头自测（不建窗口不碰 WebView2，283 项）
ApexShell.exe --shortcuts           # 重建桌面快捷方式（指向当前 exe）
ApexShell.exe --inspect-shortcuts   # 列出桌面/开始菜单里所有 APEX 快捷方式及其真实目标
ApexShell.exe --stages=exec,routes  # 只跑指定自测阶段（排查用二分）

# 前端活规格（末行必须 ALL_PASS）
node smoke-test.js

# 后端对照测试（当前 91 通过；Windows 上用独立 basetemp 避免 ACL 干扰）
backend/.venv/Scripts/python.exe -m pytest backend/tests -q

# 浏览器模式（Python 后端；壳已不依赖它）
powershell -ExecutionPolicy Bypass -File backend/start.ps1   # → http://127.0.0.1:8765
```

- 壳用 `SetVirtualHostNameToFolderMapping` 把 `https://apex.local/` 映射到**仓库根**，所以**改完 Web 三件套 Ctrl+S、壳里 F5 立即生效**（不用重新构建）。
- 壳层日志：`%LOCALAPPDATA%\ApexShell\web-shell.log`（导航 / 托盘 / 本地路由 / 图标拦截全链路留痕）。**每行前缀 `+Nms` = 距本进程启动的毫秒数**——启动耗时直接读它：`tray: RegisterClassW`（窗口构造开始）→ `localapi: ready` → `webview: ready` → `nav-done` → `splash: dismiss`。
- 构建壳（Debug，调试 / 自测用）：`cd shell && C:\Users\23221\.dotnet\dotnet.exe build ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64`。**构建前必须先结束运行中的壳**（否则 exe 被锁，报 MSB3027）。
- 发布壳（Release，**日常入口用它**）：`cd shell && C:\Users\23221\.dotnet\dotnet.exe publish ApexShell.csproj -c Release -p:Platform=x64 -p:RuntimeIdentifier=win-x64 -o bin/Release/publish`。Release 预编译（`PublishReadyToRun`）+ 关符号；**产物落 `bin/Release/publish`，不碰 Debug 目录**，所以重发不必先结束正在跑的 Debug 壳（只有重发同一配置、或要覆盖 Debug 时才得让壳退出）。
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
- `S`：运行时状态。除 `S.obsidian` 与 **7 个外观偏好** `theme / accent / density / glass / notify / save / telemetry`（即 `PREF_KEYS`，**落 localStorage**）之外，其余刷新即重置。常用：`S.page` · `S.proj` / `S.wf`（项目 **id**）· `S.running` · `S.todos.plan` · `S.notes` · `S.wfEdit` · `S.zoneH` · `S.modTab` / `S.modQ` · `S.heatDays` / `S.heatDetail` / `S.heatMode` · `S.density` / `S.accent` / `S.theme` / `S.glass` / `S.notify` / `S.save` / `S.telemetry` · `S.windowState` / `S.windowUpdating`（窗口置顶控件）· `S.projectRuntime`。
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
| `MainWindow.xaml.cs` | 窗口（默认 1440×900 且**居中到工作区**，见 `ApplyDefaultPlacement`；工作区放不下时按工作区收窄，避免算出负坐标）、**启动遮罩**、托盘、WebView2 初始化、虚拟主机映射、**WebMessage 桥**、**应用图标网络栈拦截** |
| `LocalApi.cs` | 路由分发器 + 请求体校验（pydantic 等价物）+ `CoveredRoutes` 清单 |
| `ConsoleConfig.cs` | 路径配置（镜像 `backend/app/config.py`，硬编码仓库根） |
| `Db.cs` | SQLite 门面：迁移 1–10 复刻、`Execute/FetchOne/FetchAll/Transaction/WithTransaction` |
| `StartupManager.cs` | 开机自启动（`Run` + `StartupApproved\Run` 双位置） |
| `ApplicationScanner.cs` | 开始菜单 / UWP / App Paths 扫描 + 图标提取（`SHGetFileInfoW` + 手写 PNG 编码器） |
| `ApplicationCatalog.cs` | applications 路由组业务层（`ValidateLaunch` 是公共校验） |
| `ModuleRegistry.cs` | 内置清单与同级项目仓库 `.apex/module.json` 发现、解析与校验 |
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
| `WindowChrome.cs` | 无边框外壳：拖动 / `ToggleMaximize` / caption 色（配方与坑见 §13） |
| `WindowStateStore.cs` | 窗口位置 / 尺寸 / 最大化态按角色持久化（console / dashboard 分文件） |

**关键设计**：
- **可注入**：`LocalApi` 的每个依赖都可注入，`SelfTest` 因此能在无窗口进程里跑真业务逻辑（`initOnStart:false` 跳过启动期副作用）。
- **启动路径（2026-09-26 提速）**：冷启动约 4s，其中 **~3.5s 是 WebView2 的固有成本**（环境创建 ≈1.5s + 导航到渲染 ≈2.05s，实测稳定），应用侧能动的那 ~0.4s 才是我们的活。三条做法：①构造里把 **LocalApi 初始化甩进 `Task.Run`**（实测只 ~60ms，但仍不许它占关键路径）；②WebView2 环境创建并行起跑；③UI 线程只负责尽快画出 **启动遮罩**——`MainWindow.xaml` 的 `Splash` 是纯 XAML，先于 WebView2 绘制，窗口在 **+0.32s** 就带着 APEX 字标出现，盖到 `NavigationCompleted` 再淡出 260ms（正好盖住「bootstrap + render」那 ~160ms），消掉原来 2.4s 的纯白空窗。失败与超时如实报（`EnsureCoreWebView2Async` 异常直接写在遮罩上；20s 兜底提示超时），不假装在加载。**注意**：WinUI 里 WebView2 属于 external content，**只能被 XAML 盖在上面、不能被别的层透过去**——所以遮罩必须是「上层 + 整体淡出」，别给 WebView2 做透明背景。
- **还想更快只能省掉冷启动本身**：壳是单实例 + 托盘常驻，`开机自启` 已在设置页（`Run` + `StartupApproved\Run` 双写），托盘热键 **Ctrl+Alt+A** 秒唤起。点 X 是缩托盘不是退出——**从托盘右键「退出」再重点开，就是每次 4s 冷启动的那条路**。
- **无头自测**：`--selftest [日志]` 走 `App.OnLaunched` 分支，**不建窗口不碰 WebView2**——工具会话出身也能跑（绕开安全软件对 WebView2 的拦截），结果**逐条落盘**（进程被掐也能看到死点）+ 退出码。阶段：`base` / `startup` / `scan` / `realscan` / `icon` / `catalog` / `registry` / `exec` / `window` / `activity` / `projects` / `modules` / `bootstrap` / `dashchrome` / `routes`。
- **自测环境限制**：派生 `powershell.exe` 会被安全软件连根掐 → 扫描类测试用 `useShellLists:false`（只关 UWP 清单，其余全真）。应用绑定测试**必须用真扫描候选**（`source_key` 要能被重新验证，造假 key 一定 409）。
- 自测断言要**防自嗨**：注册表辅助直接操作 Registry 而非走被测类。

---

## 8. 页面与组件地图

导航 5 项（顺序固定）：**总控台 / 项目 / 模块 / 应用 / 设置**（第 6 个 `workflows` = 项目详情页，不进导航）。

- **总控台**：继续工作 hero + 最近打开 + 最近活动；单屏无纵向滚动。
- **项目（选择页）**：卡片栅格 + 尾部新建卡（切状态 / 复制 / 刷新 / 删除）。运行控件 `projectRunControlsHTML()` **必须由选择页卡片与详情页头共用**，不得各写一套；`S.projectRuntime` 由 `/api/projects/{id}/runtime` 恢复，刷新后不能退回假空闲。
- **项目详情页**（`S.wf`），四区块：① 概览（身份卡 + 能力卡 + 统计卡）；② **开发上下文**（左：当前任务区 + 高 / 中 / 低优先级区，可拖拽、可空、区高可调；右：Obsidian 资料中枢卡 + 项目记录 + 项目文件）；③ **运行流程**（单张卡：状态徽标 + 「添加模块」入口 → 状态摘要 / 日志终端 → 主流程蛇形视图 → 历史记录；主流程每行 5 节点、蛇形走向、行间 S 形曲线；节点三态：已完成绿 √ / 进行中品牌色 / 未开始空心）；④ 设置（开关 + 裸红色「删除项目」长条）。
- **模块**（页面 id `scripts`）：执行模块的唯一编辑 / 添加入口。新增用内置 `web` 模板（名称 / 网站地址 / 描述），项目归属只由 `project_modules` 多对多绑定维护。清单管理模块显示为「由项目清单管理」，需在所属仓库维护，**不得从总控台改写或删除**。删除用户创建的网页模块仍走预演 + 二次确认，解除绑定但**保留历史运行记录**。
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

> 只留**判据与禁忌**。踩坑过程、实测数字、复现步骤都在 git 历史与对应代码注释里，不在这里复述。

**通用 / 前端**

1. **改文件要覆盖足够上下文**：`old_string` 若切到下一个 `case` 开头会把相邻分支吞掉；长单行条目尤其危险（Edit 会吃掉相邻标题行）。插入内容用「新内容 + 换行 + 原 `old_string` 全文」的写法，改完回读。
2. 同一个 `try` 块里「先用后声明」的 `const` 会 TDZ 报错；跨块引用变量无效。
3. 运行引擎时序：`startRun` 首帧全部 `wait`；第一次 `advanceRun` 点亮首个步骤为 `now`；第二次才出现 `done`。写断言别猜。
4. 蛇形流程的行容器**必须带 `rev` 类**才右对齐，否则节点与 S 弯端点错位。
5. 贴边通栏元素的小圆角视觉上等于没有；要明显圆角就做成悬浮卡片。
6. **CSS 死代码判据**：选择器里**任一**类名在 `app.js` / `index.html` 里从不出现 → 该规则不可能命中（祖先类活着不代表规则活着）。先排除运行时拼接再删。
7. **本机安全策略**：PowerShell 的 `Add-Type`（含 `-AssemblyName`）与 `New-Object -ComObject WScript.Shell` 都被拦，`reg.exe` 在黑名单。取像素 / 调 .NET 用隔离 Python；读注册表用 `winreg`；建快捷方式 / 解析 lnk 走壳内 CLI（壳进程内的 COM 是通的）。
8. 打包中文名文件别用 `Compress-Archive`（乱码），用 node + zlib 自写 ZIP（UTF-8 标志位 `0x0800`）。
9. **「三态 / 多态」配色：类名列表和 CSS 规则必须一一对齐**，漏一条就是隐形的黑点（`.st-switch .dot{background:currentColor}` 会退化成继承色，看起来像「没颜色」）。测试已断言「每个 `st.cls` 都要有 `.{cls}{` 规则」。
10. **`stCls` 与 `st` 是两份数据，可能对不上**：卡片 badge 直接渲染 `w.stCls`，状态切换控件走 `projStDef(w.st).cls` —— 改状态样式别只看其中一处。
11. **源码是纯 LF**：批量改写别把整份文件变成 CRLF，否则按 `\n` 精确匹配的源码级断言**静默失效**（报出来的条目还看起来毫不相干）。用 `newline=''` 或二进制 `replace(b'\r\n', b'\n')`；改完复核 `b.count(b'\r\n')`。
12. **写否定断言时，注释里出现被否定的字面量也会命中**。写这类注释不要带具体调用字面量。
13. **批量全局替换前先分类**：同名可能指两种概念（`proj` 既指 id 又指名字）。先 `grep -n` 列全部出现位置并分类，再决定范围。
14. **「设置页开关」通病是「看着能点、其实没接线」**：`data-act="switch"` 只翻转 DOM class、初值写死在 markup → 任何重绘就弹回、刷新全丢。修法固定三步：①`S` 加字段并进 `PREF_KEYS`/`normalizePrefs`；②写一个只操作 `<html>` 的 applier 并注册到 `applyPrefs()`；③事件分支改成「改 `S` → applier → `persistPrefs()` → `render(true)`」。
15. **`classList` 也要进 DOM 桩**（否则 `applyGlass()` 抛异常导致整份 `app.js` `LOAD_FAIL`），且必须有**真实记忆**（`Set` 支撑 add/remove/toggle/contains）。`ctx.matchMedia` 同理要有桩。
16. **占位符不许当数据用**：`DATA.projectTemplate` 里每个字段都会变成真实项目字段，模板里只放真正的默认值；兜底文案写成渲染期函数（`flowNameOf()`）。
17. **「好几条一模一样」几乎总是「兜底值 + 标签缺主体」**：先问「这个字段缺省时是什么」，再看「这条标签里有没有能区分主体的信息」。
18. **排序键必须是数值**：展示文案（如「9月22日 13:30」）按字符串比毫无意义。适配层另存毫秒数（`backendEpoch()`，缺失 / 非法为 `0` 让「从未运行」沉底）；**不要用 `Date.now()` 凭空造时间**。
19. **测试里断言 `let` 变量的实时值，导出必须用 getter**（`Object.defineProperty(__T, 'x', {get(){return x}})`），否则只快照成注入那一刻的值。
19b. **「绝对定位铺满父容器」的层，可拖区只剩控件本身**。三个反直觉的坑，缺一个就从「拖不动」变成「点不动」或「看不见」：①`overflow:hidden` 的祖先会裁掉负 inset 的越界矩形（向左扩尤其明显）；②伪元素命中时 `elementFromPoint` 返回**宿主元素**，所以拖动带必须挂在带 `data-drag` 的元素**自己身上**；③承载行要 `isolation:isolate`，否则行内 `z-index` 会跑出去盖住整条导航。**完整配方见 §13**。排查手段：别只看矩形，用 `document.elementFromPoint(x,y).closest('[data-drag]')` 逐点问，并拿真实 `index.html` 骨架跑（`setContent` 会引入约 20px 的 body 偏移假象）。

**后端 / 执行栈**

20. **独立项目的业务实现与运行环境留在项目仓库**：ControlPod 只维护通用模块发现、权限提示、执行编排和运行记录；项目代码、项目专属依赖、工作进程及其端口生命周期由各自仓库维护。
21. **外部模块服务不由总控台接管**：未知服务或模块专属端口只能由所属项目验证身份并管理；ControlPod 不探测后擅自启动、终止或重启外部服务。
22. **自管滚动不要捕获按钮的指针**：惯性滚动容器若对按钮 `setPointerCapture`，鼠标点击会被吞（键盘 Enter 却可用）。交互控件先经 `appScrollDragBlocked()` 排除。
23. **无人值守的模块绝不能停在交互输入上**：Windows 上 `getpass` 会绕过 stdin 重定向直接读控制台，**永久挂住**（项目卡在「运行中」）。交互式脚本被模块调用前必须加 `--no-prompt` 类开关 + 超时。
24. **项目名来自 manifest**：新增模块必须在 `module.json` 显式声明 `projectName` / `projectDescription`，否则继承 `module_registry.DEFAULT_PROJECT_*` 的文案。
25. **占位符**：`{module_dir}` `{project_root}` `{console_root}` `{run_dir}` `{result_path}` `{log_path}`。**跨项目模块引用 console 自己的虚拟环境时必须写 `{console_root}`**，不要写绝对路径。**展开必须留在 `try` 里** —— 异常从 try 前逃出会让 run 永远停在 `running`（项目卡死「运行中」，按钮消失，看着像「点了没反应」）。
26. **模块要开窗口就用 `pythonw.exe` + `DETACHED_PROCESS`**，不要等窗口关闭（否则跟着来一个黑框，且调用方退出时被连带回收）；pid 记在 `%TEMP%` 下靠它精确结束；**不要**用 `taskkill /IM pythonw.exe`。
27. **模块项目是独立 git 仓库，放在 `D:\Projects` 下**：总控台直接扫描每个子目录的 `.apex/module.json`，不递归并跳过 ControlPod 自身。内置清单的相对 `projectRoot` 按 console 根解析；外部清单按所属仓库根解析（不按 cwd、不写死盘符）。
28. **C# 壳侧（二期移植踩过的）**：
    - `catch (A or B ex)` **不是合法 C#**——异常过滤要写 `catch (Exception ex) when (ex is A or B)`。
    - `x.Result;` 作为**丢弃结果的裸语句**编译不过（CS0201），必须 `_ = x.Result;`。
    - `await Task.Run(...)` 默认捕获调用方上下文，**UI 线程用 `.Result` 等待会死锁**——库代码一律 `.ConfigureAwait(false)`（表现为自测卡死、日志缺汇总行）。
    - `ContinueWith(_ => { … out _ … })` 里 lambda 参数 `_` 与 discard 撞名，编译报类型错——lambda 参数改名。
    - `JsonDocument.RootElement` 必须先 `.Clone()` 再让 document 释放，否则 element 悬挂。
    - `List<T>.Reverse()` 是 **void 实例方法**；要 LINQ 反转用 `AsEnumerable().Reverse()`。
    - Nullable 属性模式 `{ Value.X: … }` 的**第一级就作用在解包后的 T 上**，再写 `.Value` 会报「未包含 Value」。
    - **多线程竞态**：「任务收摊」与「finally 落库对其他连接可见」之间有窗口（Python 单线程事件循环没有），等待方见 `RunIsLive=false` 就收手会闪失——收手前重查一拍。
    - 构建输出被运行中的壳锁住（**MSB3027**）：先结束旧壳再构建。
    - **从工具会话启动的壳会被安全软件掐掉 WebView2**：壳一律由人双击 / 自启动拉起，agent 只做构建与无头自测。
    - PATH 上的 `dotnet`（`C:\Program Files\dotnet`）**只有运行时、没有 SDK**，构建壳一律用全路径 `C:\Users\23221\.dotnet\dotnet.exe`。
29. **测试基线必须真实**：曾把 4 项可修的失败写成「既存失败」并附「修掉之前别把后端全绿当验收前提」——**那是把可修的 bug 合法化成降低标准**。真相是那些测试测着重构删掉的旧接口（全仓库零调用），重写即过。**遇到失败先查是不是过时测试，别急着记进文档当常态。**
30. **壳里的模块子进程恒用 `CreateNoWindow = true`，不要复刻 Python 的 `requires_admin` 分支**：Python 版 `creationflags=0` 的语义是「沿用后端自己那个控制台」，壳是 WinUI GUI 进程、**没有控制台可继承**，系统于是给子进程**新分配**一个控制台窗口，而它的 stdout/stderr 全被重定向进日志 → 用户看到一块悬着的空白黑屏。两套栈在这一处是**有意分歧**，别「对齐」回去。
31. **`result.json` 必须先于 `runs.status` 可见**：`/runtime` **不看** `runs.status`，它重新读 `result.json` 取 `result.status.state`；而子进程落盘的可见性**不保证**早于父进程 `wait()` 返回 → 偶发 `state=unknown`（满负载时才复现）。`finally` 在 `status == "succeeded"` 时先 `_wait_for_result_file()`（上限 2s）再落库。**别把这类偶发失败当成「重跑一次就好」**——它和第 28 条的竞态是同一类病。
32. **模块子进程的权限必须遵守清单**：需要管理员权限的模块由通用执行器按 `requiresAdmin` 发起 UAC；不得绕开权限声明，也不得在拒绝授权后继续执行。
33. **读子进程 stdout 必须先并发读走再 `WaitForExit`，否则管道满 → 子进程永不退出**：`Get-StartApps` 会往 stdout 写 **17KB**，而匿名管道缓冲区只有 **4KB**，「先 `WaitForExit` 再 `ReadToEnd`」让子进程卡在自己那次写操作上**永不退出** → 必然超时 → 商店/UWP 清单被判失败。后果不是报错而是**静默丢数据**（搜不到商店应用；已绑定的 UWP 项目一运行就撞 409「入口已失效」）。正确写法：先 `ReadToEndAsync()` 两个流，再 `WaitForExit`。Python 的 `subprocess.run(capture_output=True)` 走 `communicate()` 本身并发，所以同一命令正常。排查入口：`ApexShell.exe --scan`（`--selftest` 覆盖不到这里）。
34. **`overflow:hidden` 会连「向上浮出的悬停气泡」一起裁掉**：活跃度热力图的气泡是 `position:absolute;bottom:calc(100% + 6px)`，向上溢出格子也溢出卡盒，最上两行整个被裁成「看不见任何东西」。修法是给那一张卡加 `.home-grid .dashboard-heat{overflow:visible clip}`：**只放行纵向**，横向仍保持 `clip`（`clip` 不产生滚动容器，不像 `visible` 会连带把另一轴的 `hidden` 升级成 `auto` 冒出滚动条）。**别改成给 `.home-grid .card` 整体去掉 `overflow:hidden`**。⚠️ 这条只解决纵向，横向是第 35 条。
35. **气泡的「末列右对齐」阈值是陈旧常量：`n+169` 在 13 周卡片窗下永不命中**（与第 34 条是同一现场的两个独立原因）：`n+169` 是 53 周全窗（371 格）时代写的；卡片可视窗后来缩到 `HEAT_CARD_COLS = 13` 周 = **91 格**，阈值永不命中 → 末列气泡仍居中 → 右半边被裁。正确阈值是 **`HEAT_CARD_CELLS - 14 + 1 = 78`**，**改 `HEAT_CARD_COLS` 就得同步改 CSS 阈值**（测试已把「CSS 阈值 = 13*7-14+1」钉死，并禁止过期阈值以选择器形式复活）。排查手法：别肉眼看截图，量「气泡右缘 − 卡片右缘」的正负号 —— 正数即出界，数值就是被裁掉的像素数。
36. **设置页开关必须门控它的真实出口，否则只是个「记录意愿」的摆设**：`shellToast()` 原先只判 `IN_SHELL`、**完全不读 `S.notify`** → 关掉「桌面通知」后运行终态（完成 / 失败 / 关闭）照弹系统 Toast（原注释还写着「当前无推送实现」，与实现早就脱节——**「注释说的和代码做的不一致」是配置类 bug 的高发区**）。修法：`if (!(S && S.notify)) return;` 放在 `shellToast()` 内部。**门控要点在「唯一的出口」上做，不是在每个调用点做**。两个易漏边界：①`S.notify` 可能是 `undefined`（老 localStorage 没这个键），要写 `!(S && S.notify)`；②必须是 **early-return**。**验证套路**：抽取真实函数源码到 vm 里真跑（别重写等价逻辑），再做反向验证 —— 把门控行删掉重跑，应精确复现用户报告的现象。
37. **壳支持 `--url` 打开外部看板**：链路 `runner.py → open_dashboard() → ApexShell.exe --url <地址>` → 壳内 `WebView2.Navigate(url)`。四个设计点：①**单实例锁按角色 + 按 URL 分**（同地址重复启动 = 唤起已有窗口，不堆第二个；不同地址 = 各自独立窗口），②**窗口状态按角色分文件**（`shell-window-console.json` / `shell-window-dashboard.json`），③**`--url` 与 `--url=` 两种写法都要认**（只认一种的表现是「参数传了没生效、开出来还是总控台」），④**外部 URL 分支要在虚拟主机映射之前 `return`**（`apex.local` 映射是总控台专用路径）。
38. **窗口位置尺寸持久化：`DisplayArea.FindAll()` 在窗口构造早期抛 `E_NOINTERFACE`**，会把「还原布局」整个吞进 catch → 表现是**位置怎么都记不住**（日志里能读到状态、但永远跟着一行 `1440x900 centered`）。改用**纯 Win32** 的 `MonitorFromRect(MONITOR_DEFAULTTONULL)` + `GetMonitorInfo().rcWork`。**判据口径**：`GetWindowRect` 含每边约 7–8px 的不可见调整边框，`DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` 才是肉眼可见矩形；**存档写的是 DWM 可见矩形**，所以「存档 1100×720 → 重开 GetWindowRect 1143×735」的差值**是正常的**，别当成没记住反复改代码。验证三段都要有：写自定义状态 → 启动壳 → 从日志读 `window: 还原上次布局` → 再量窗口矩形。
39. **新起的桥也要走「开看板」决策点，不然第一次运行和第二次的观感不一致**：`launch_bridge` 原先是**复用已有桥**才调 `open_dashboard()`，**新起桥**那条路只让 `serve.py --open-browser` 自己开系统浏览器 → 同一个按钮第一次开浏览器小窗、关闭后再点才开壳。修法是两个分支都收敛到 `open_dashboard()`，并让 `serve.py` 的 `open_browser()` 也优先起壳、留 `os.startfile` 兜底。**为什么两边都开不怕重复**：壳的单实例锁按 URL 分，「幂等的打开动作」比「小心翼翼地只开一次」更抗漏。适配器现由 `run-analytics/.apex/runner.py` 维护；ControlPod 用 `--console-root` 显式传入自身路径，runner 优先找 Release 壳、再找 Debug 壳，并通过 `APEX_SHELL_EXE` 传给桥进程。`serve.py` 被独立直启时仍优先读该环境变量，找不到则按其原有本机 Debug 路径查找，最后退回系统浏览器。
40. **卡片卡在「运行中 / 关闭中」是三个独立原因叠加，修一个不够**（链路：`runner.py 写 result.json → /runtime 读 result.status.state → 前端 S.projectRuntime → 卡片红点`）：
    - **① 前端只在页面初始化问过一次**：`syncProjectRuntime()` 原先没有任何定时器 → 用户关掉看板 / 从任务管理器杀桥之后前端永远不知道，字段恒为 `running` → 红点永久亮。修法：加 `startRuntimePoll()`（`RUNTIME_POLL_MS = 5000`），`document.hidden` 跳过、`visibilitychange` 回来自补、`!S.backendReady` 时不发。**必须「只在状态真变时 render(true)」** —— 全量重绘会让 hover 过渡与运行动画从头重播（观感是卡片反复弹跳）。
    - **② `result.json` 从不写 `status.state`**：`/runtime` 只认 `result.status.state ∈ {running, stopped}`，其它一律退化成 `unknown`。修法：两个分支都补 `"result": {"status": {"state": ...}}`（`run` 额外写 `pid`）。**必须是嵌套的 `result.status.state`，不是扁平键 `"status.state"`**（扁平键会静默读不到，有反向断言钉住）。
    - **③ `/runtime` 取「最近一条 run」的排序有竞态**：`ORDER BY finished_at DESC, id DESC` 里 `id` 是 **uuid 字符串**，字典序≠时间序；`run` 与 `stop` 常在同一微秒区间落库时顺序不定 → 可能选中更早的 `run`。修法：`ORDER BY finished_at DESC, rowid DESC`（`runs.id` 是 `TEXT PRIMARY KEY`，SQLite 仍保留单调递增的隐藏 `rowid` = 插入顺序）。**Python 与 C# 两处都要改**。
    - **强杀兜底（第二条腿）**：桥被 `taskkill /F` 时走不到 `finally`，`result.json` 会**永远**留着 `running` → `/runtime` 在 `state == "running"` 时拿 `result.status.pid` 验进程存活，死了就回落 `stopped`。⚠️ **`_pid_alive` 不能用 `os.kill(pid, 0)`**：①进程已退出但父进程还持着句柄时照样返回成功；②`pid=0` 也被当成合法目标。必须走 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess`，只有 `STILL_ACTIVE(259)` 才算活；C# 侧对应 `Process.GetProcessById` + `HasExited`。
    - **桥侧的存活标记**：`serve.py` 启动时在 `%TEMP%\run-analytics\` 落 `serve.pid` / `serve.port`，三条收摊路径（`atexit` / `SIGINT,SIGTERM` / `finally`）都撤标记。**正常退出能撤、强杀撤不掉 —— 所以才必须有 pid 交叉校验那第二条腿**，缺一条红点都灭不掉。
41. **XML 注释里不能出现连续两个短横线 —— 而 XamlCompiler 只回一个退出码、不给任何错误文本**：`dotnet build` 只报 `error MSB3073: 命令"…XamlCompiler.exe …"已退出，代码为 1`，没有行号 / 文件名 / 提示，`-v:diag` 也捞不到。排查手法：**把 XAML 里的注释当第一嫌疑**（语法层面唯一可能「看不见」的错误），或二分注释段落。⇒ 写 XAML 注释一律用「url 参数模式」「bg 色」这类不带短横线的说法；**改完 XAML 一定要真构建一次**。
42. **给「非为本壳编写」的外部页面套壳时，窗口控制条要壳自己让出一行，别盖在页面顶栏上**：跑步看板没有任何 `[data-drag]` 声明，总控台那套「页面声明拖动区」机制在看板里根本不存在 —— 窗口拖不动也关不掉；而看板顶栏两端被占满，盖上去必然压住信息。**做法**：RootGrid 改成两行，第 0 行是 32px 的 `DashChrome`（默认 `Collapsed`，**只有 url 参数模式才亮出来**），WebView2 放第 1 行 → 页面整体下移 32px。这个解法对**任意**外部页面都成立。三条必须守住的细节（都已在 `SelfTest.CheckDashboardChrome` 里钉住）：**拖动层的 `Background="Transparent"` 不能删**（WinUI 里 `null` 画刷的元素**不可命中**，清掉后窗口静默拖不动）；**关闭按钮是拖动层的兄弟且排在后面**（z 更高，否则点按钮只会拖动窗口）；**关闭必须先置 `_exitFromTray = true` 再 `Close()`**（`AppWindow.Closing` 里有一道「点 X 只隐藏到托盘」的拦截）。**底色**：看板窗口的壳底色写死看板的 `--bg`，且**不写 last-theme.txt**（跟着总控台主题走会露深色带，写入记忆文件则会反过来冲掉总控台的主题偏好）。
43. **WebView2 窗口截图：先直接截一次，是黑图再退回「两层分开取」**：GDI `BitBlt` 从屏幕 DC 采壳窗口，通常是「XAML 层正常 + WebView2 区域纯黑」（WebView2 走 GPU 合成，不落在 GDI 可读的位图里），`PrintWindow(PW_RENDERFULLCONTENT)` 也一样黑。**但别当铁律**：同一天另一轮实测里 `GetDC(0)` + `BitBlt` 抓到了真实网页像素 —— 差别多半在于 DWM 有没有把这块内容放进硬件 overlay 平面。可用的替代：只想验壳自己的 XAML → 屏幕 DC `BitBlt`；想看整窗观感 → XAML 层用屏幕 `BitBlt`（裁顶部那条）+ 网页层用无头 Edge 截同一 URL，按已知偏移叠起来（两部分都是真像素）。另一个坑：拿 `python -m http.server` 静态服务时 `NavigationCompleted` **可能永远不来**（页面有子资源挂着）→ 遮罩不揭幕，截到的永远是遮罩；要复现真实观感必须用真实桥。**移动鼠标要用 `mouse_event(MOUSEEVENTF_MOVE|MOUSEEVENTF_ABSOLUTE)`，别用 `SetCursorPos`**（后者不往窗口消息队列投真正的鼠标输入，WinUI 的指针输入收不到 → 悬停视觉不更新；定量对拍：`SetCursorPos` 时按钮平均亮度 −0.00，换 `mouse_event` 后 −22.4）。绝对坐标要归一化到 `x*65535/(SM_CXVIRTUALSCREEN-1)`。
44. **无边框窗口里「全屏」就是 `ToggleMaximize`，而全屏态下窗口条必须留着**：WinAppSDK 1.6 的 `OverlappedPresenter` 没有 `SetFullscreen`（1.7 才有），`WindowChrome.ToggleMaximize()` 干的是「`MoveAndResize` 到监视器整块矩形 + 临时 `IsAlwaysOnTop`」，并把窗口化矩形存进 `_restoreRect`。所以「窗口条全屏按钮 / 双击拖动区 / 总控台顶栏 fsBtn」三条路**必须都调到这一个方法**。两个要点：**按钮图标的状态源只能是 `_chrome.IsFullscreenOrMaximized`**，不能自己记 bool（窗口还能通过双击、拖到屏幕顶端贴边、启动时还原存档这三条**壳外路径**改状态）；**全屏时不要藏掉那条 32px 窗口条** —— 无边框窗口没有系统按钮，藏了之后退出全屏唯一指望是 Esc，而 Esc 落在 WebView2 里会被页面吃掉（`WM_KEYDOWN` 只发给持有焦点的子窗口），等于把用户锁死在全屏里。构造函数尾部要**补调一次** `SyncDashFullscreenIcon()`（`ApplyStoredOrDefaultPlacement()` 可能在 `_chrome` 建出来之前就把窗口置成最大化）。
45. **`Background="Transparent"` 才可命中，画刷给 `null` 完全不可命中；按钮组自己不能有背景**：同一条窗口条上拖动层、全屏按钮、关闭按钮都靠这条成立。按钮的外层 `StackPanel` **不能设 `Background`** —— 一设就等于在拖动层之上盖了块不可穿透的板，组内空隙与左侧空白全变成「点上去没反应、也拖不动」的死区。另外**同一行里关闭要排在全屏之后**（z 更高、最右一颗是关闭），符合 Windows 惯例。
46. **看板页面自带的浏览器滚动条：只有窗口小于约 1367×627 才出现，而且是深色的**：页面比视口高时才纵向溢出，所以「有没有它」取决于窗口大小，**复现必须先设小窗**，否则会得出「我这儿根本没有」的错误结论。深色是因为 `styles.css` 没声明 `color-scheme`，Chromium 按系统深色偏好画条（轨道 `rgb(44,44,44)`）压在浅色页上。修法：壳侧 `AddScriptToExecuteOnDocumentCreatedAsync(NoScrollbarScript)`，**必须在 `Navigate` 之前**注册（该 API 只对之后创建的文档生效）；CSS 要写 `html,body` **和** `body *` 两套（少写后者，页内 `overflow-y:auto` 的面板照旧露条），`::-webkit-scrollbar{display:none}` 与 `scrollbar-width:none` 双保险。**只藏视觉、不停用滚动**。证明不靠截图：nav-done 打一行 `viewport {...bar,hid}`，`bar = innerWidth - clientWidth` 就是滚动条宽度；再对窗口发真实滚轮 `mouse_event(MOUSEEVENTF_WHEEL)`，同区域像素差 >0 即证明滚动仍可用。

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
- **缺宿主的旧接口 + 零规则类钩子**（2026-09-25 第三轮清扫）：前端删 `S._modType` / `S._modProj` / `S.projectFileDeletePreview`（后者 2026-09-24 删过一次、又被当成键写回 `S` 字面量，当时的护栏只查 `S.xxx` 点号形式没拦住；现已改成**裸名字查**）与 5 个零规则类钩子（`dashboard-head` / `tile-menu` / `wf-steps-card` / `txt` / 概览编辑卡上的裸 `ov-edit`）。**有负向断言锁定**（前端 `smoke-test.js`），不要加回来。独立项目的业务接口与死代码测试由所属仓库维护，不放回总控台。
- **第四轮清扫（2026-09-26）——子串护栏拦不住的伪装孤儿 + 无生产宿主的函数**：①「云同步」抽屉全链（`openTool` / `case 'syncNow'` / 导航 `data-tool` 分支 / `IC.cloud` / `.track` / `.metrics` / `.metric b`）——无元素带 `data-tool`，整条不可达；② `applyBasicInfo`（本地落库兜底，生产一律走 `basicInfoApiPayload` + 后端 + `applyBackendBasicInfo`）；③ `S.windowState` 的只写字段 `width` / `height`；④ `C` 的零引用色键 `ink2` / `ink3` / `brand`；⑤ 孤儿 CSS：`.chat` / `.msg` / `.typing` / `@keyframes bob`、`.anim` / `.larder` / `.split` / `.app-tile.add` / `.cat-chip.ghost` / `.cnt.warn` / `.cnt.live`。**有负向断言锁定**（smoke-test 两条），不要加回来。**教训**：孤儿护栏是子串匹配，`chatgpt` / `const typing` / `.split(` 这类同形词会掩护真孤儿，得靠词边界扫描 + 人工排除运行时拼接；`h${heatLevel(...)}` 这类模板拼接不算孤儿。
- **开发上下文卡头整行删除**：卡片直接以 `<div class="dev-cols">` 开场，**没有卡头、没有标题**——不要「顺手」补回来。
- **任务行格式 `N. [待办][优先级] 正文（截止）`**：类型徽章**恒写「待办」**（「待修改」不出现在任何输出里），优先级三档全显式。**类型徽章刻意不参与解析**——否则模板恒写「待办」会在保存时把 `fix` 条目**静默改成 `todo`**。
- **`0 项目白屏`**：`render()` 里任何在返回 HTML **之前**就取属性的写法，抛错都会造成「页面冻结」而不是报错。现为两层防护（拦「删除最后一个项目」+ 两页空态兜底）。
- **零引用声明与重复注释**（2026-09-28 清理）：壳侧删 `WindowChrome.DragBarHeight`（`DragBar` 那版拖拽区拆掉后的残留常量）、`WindowChrome.FallbackDragWidth`、`WindowChrome.GetDpiForWindow`（三者全仓零调用）、`ModuleRegistry.Root`（没人读的转发属性）；跑步看板的 `GUI_SCRIPT`（`--gui` 降级入口去掉后的残留常量）与未使用的 `import sys` 已随适配器迁入 `run-analytics/.apex/runner.py`，由该 runner 自检保护；`LocalApi.IsProcessAlive` 上重复的一整段 `<summary>`。本仓库只保留通用外部模块发现测试，不再把独立项目的 runner 当作本仓源码。

---

## 12. 交接规则

- **改完必跑**：`node smoke-test.js`（末行 `ALL_PASS`，790 项）；改壳代码还要跑 `ApexShell.exe --selftest`（283 项，逐条落盘便于定位死点）；改后端还要跑 `pytest backend/tests -q`（当前 91 项通过）。**结构变了补断言，删功能补负向断言**。
  - **删根目录文件后务必跑前端冒烟测试**：里面有一条「根目录白名单」断言（`expectedFiles`），删了文件不同步改断言就会红——2026-09-25 删 `00-启动 APEX 总控台.lnk` 时就漏跑过一次。
- **本目录有 git**（`D:\Projects\ControlPod`）：动手前先看 `git status`，别破坏性覆盖；提交粒度按主题，别把多个主题混在一个提交里。
- **根目录只放源码**（Web 三件套 + `smoke-test.js` + `AGENTS.md` + `README.md`），其余一律进 `shell/` 或 `backend/`。源码**纯 LF**：批量改写后复核 `b.count(b'\r\n') === 0`（见 §10 第 11 条）。
- 一次只做一个主题的改动，不顺手重构无关代码；需求不明确先问。
- **交付习惯**：改完要给出「已验证可用」的结论（构建 / 测试 / 自测日志 / 无头验证都跑过），不要把「试一下」的循环丢给人；只有必须人眼确认的视觉细节才请人验收。

---

## 13. 无边框卡片外壳（2026-09-26 定稿）

**形态**：壳是「整窗一张卡片」——无边框、无系统标题栏三按钮、DWM 圆角 + 品牌红描边，内容顶到窗口最上沿。
实现集中在 `shell/WindowChrome.cs`（新文件）；`MainWindow` 构造里 `new WindowChrome(this, _appWindow).Apply()`。
**拖动 / 全屏 / 缩小到托盘由页面声明**：`data-drag` 区域按下 → `chrome-command: drag`；`#fsBtn` → `toggle-maximize`；`#trayBtn` → `hide`。

**配方（实测有效，别凭直觉改）**

| 目的 | 做法 |
|---|---|
| 去掉系统三按钮 | `SetBorderAndTitleBar(hasBorder:false, hasTitleBar:false)`，保留 `WS_THICKFRAME` 所以边缘缩放不受影响。**只剥 `WS_SYSMENU` 不够**——WinUI 的按钮是它自己画的，不走经典非客户区绘制，样式位剥了按钮照样在（真机 `WS_SYSMENU=无` 但三个按钮仍在）。若以后要 `ExtendsContentIntoTitleBar`，这条必须放在它之前 |
| 整条顶栏可拖 | 页面 `.topbar` 里放一层绝对定位的 `.tb-drag`（控件 `z-index:1` 压在上面，照常能点），`mousedown` → `chrome-command: drag` → 壳用**专用后台线程**拖动：`timeBeginPeriod(1)` 拿真 8ms 节拍 + 原生 `SetWindowPos(SWP_ASYNCWINDOWPOS)` 异步落位，左键松开即停、30 秒保险丝。**两个坑都踩过**：`ReleaseCapture + SendMessage(WM_NCLBUTTONDOWN)` 在 WinUI 3 壳里无效；UI 线程的 DispatcherQueueTimer 拖起来掉帧（分辨率粗 + 被 WebView2 渲染挤占）。侧栏品牌区同样 `data-drag` |
| 拖动区要铺满「顶栏 + 侧栏顶棚」 | 只写 `inset:0` 的话可拖区只剩控件本身（诊断与两个坑见 §10.19b）。正解是**按容器外扩 + 伪元素补方向**：①`.topbar` 定义 `--tb-drag-out:calc(var(--pad) + 8px)`，`.tb-drag{inset:calc(-1*var(--tb-drag-out)) calc(-1*var(--pad)) 0 0}`——向上吃掉主区内边距 + 8px 系统保留区、向右吃满右内边距；②**左侧那截不能用负 inset 吃**（`.main` 是 `overflow:hidden`，向左越界会被裁），改用 `.tb-drag::before` 假墙（`left:calc(-1*var(--pad));width:var(--pad)`）；③`.app` 加 `overflow:clip`，否则越界矩形还没轮到 `.main` 裁就先在网格根被裁；④侧栏顶棚的拖动带挂在 `.brand::before`（`left/right:calc(-1*var(--side-pad))`、`top:calc(-1*var(--brand-drag-up))`、`height:var(--brand-drag-h)`）；⑤`.sidebar{padding-top:8px}` + `.brand{padding-top:calc(var(--side-pad) + 8px)}`、`--brand-drag-up:26px`(=8+18) 让带子上沿顶到窗口最顶，brand 行正好落在内容起点 |
| **为什么不用区域机制** | 空壳 + 程序化拖拽实测：**拖拽区 = `SetTitleBar` 那个元素的矩形**（元素内能拖、不在元素里也不在穿透区里就不能拖），穿透区挖不出额外可拖区；而且那个元素会盖住侧栏折叠按钮。所以整套 `SetTitleBar / 穿透区 / DragBar` 已删 |
| 圆角 / 描边 | 33=`DWMWCP_ROUND`；描边线用 34=`DWMWA_COLOR_NONE`(0xFFFFFFFE) 关掉（2026-09-26 多弗朗：红边不要，层次感靠阴影）。DWM 圆角会把 WebView2 一起裁；阴影随 WS_THICKFRAME 自带，不用自己画 |
| 最大化不压任务栏 | `WM_GETMINMAXINFO` 钳到工作区；`SetWindowSubclass` 装，**回调必须由字段持有**否则被 GC。无边框（无系统边框）时这条尤其必要 |
| 全屏 / 缩小到托盘 | `#fsBtn` → `toggle-maximize`：**MoveAndResize 到监视器整块矩形（1K=1920×1080）** + 临时 `IsAlwaysOnTop=true` 盖住任务栏，退出还原窗口化矩形与置顶状态；全屏期间 `_fullscreenIntent=true` 让 WM_GETMINMAXINFO 别钳成工作区。**WinAppSDK 1.6 没有 OverlappedPresenter.SetFullscreen**（1.7 才有），别照官方新文档写。**MoveAndResize 设的是含不可见调整边框的外层矩形**（无边框后实测 左7 上0 右7 下7，非对称），不补偿的话全屏右边和下面各留一条缝 —— 用 `FullscreenOuterRect()` 在进全屏那一刻现量现补，别写死 7。`#trayBtn` → `hide`（`_appWindow.Hide()`） |

**顶栏窗口组（置顶 · 缩小到托盘 · 全屏）——悬停解释与交互动效（2026-09-26 定稿）**

三个按钮统一挂 **`.win-btn`**（外加各自的 `.win-btn-pin` / `.win-btn-tray` / `.win-btn-full`），共享一套交互语法：悬停抬 `--win-lift` + 微放大 `--win-pop` + 描边转品牌色，按下回落缩到 `--win-press` 立刻回弹。**动效全部只动 `transform` / `opacity`**——顶栏是 bento 的固定一行，动什么都不许把邻居挤走；时长 / 缓动 / 位移全部收在 `:root` 的 `--win-*` 令牌里，组件规则不硬写数值（§5 第 6 条）。

| 控件 | 悬停解释（title） | 图元动作 |
|---|---|---|
| 置顶 `#topmostBtn` | `窗口置顶` ↔ `取消窗口置顶`（开关翻转跟着翻转） | 悬停图钉拧半圈（`calc(var(--win-pin-turn)/2)`），`.on` 停在整圈 —— 一眼区分开关态；`.on` 时 `.win-ring` 呼吸脉冲（`winPulse`），按下闪一下（`winFlare`）。钉尖 `.win-pin-needle` 单独回收，旋转时不像一根杆子扫过去。**`--win-pin-turn` 只能取奇数个 90°**：用 180° 会把图钉转成倒立（钉尖朝上），读起来像「拔出来了」，语义正好反了 —— 90° 横扎位才对 |
| 缩小到托盘 `#trayBtn` | `缩小到托盘（后台常驻；托盘左键 / Ctrl+Alt+A 唤起）` | 图标 = **一根居中的横杠**（`.win-tray-bar`，就是托盘口那条缝）。**刻意只有这一根线条**——早前试过「竖箭头 + 横杠」的组合，两个图元一起动会互相撞（横杠上浮撞箭头、箭头下沉压横杠），放大看就是糊成一团；单线条反而干净。动作只能给它自己：悬停 `translateY(1.6px) scaleX(.86)`（下沉 + 收短），按下 `2.6px / .72` 更深更短 —— 往下收才是「缩进托盘」的语义方向 |
| 全屏 `#fsBtn` | `全屏` ↔ `退出全屏` | 四角标各自向外撑开 `±1.2px`（用 `translate` 不用 `scale`——圆角方按钮里 scale 会把描边一起放大糊掉）；`.on`（进全屏）停在撑开位并 `winBreathe` 呼吸 |

- **「铺满工作区」这个词被禁用**：用户不关心全屏怎么实现的，标题就叫「全屏」。有负向断言（`!/铺满工作区/`）同时锁 `index.html` 与 `app.js`，别再写回来。
- **`.on` 的驱动是两个不同来源**，别搞混：置顶的 `.on` 由 `syncConsoleWindowControl()`（`S.windowState.topmost`，走 `/api/window` 路由）切；全屏的 `.on` 由壳回推的 **`chrome-state`** 切（`body.is-fullscreen` 同源）。全屏 `.on` 必须在回推监听里同步，否则按钮和窗口状态会漂移。
- **缩小到托盘点了要有反馈**：窗口是「消失」不是「缩小」，`app.js` 在 `shellChromeCommand('hide')` 后紧跟一条 `toast()` 说明怎么唤回，不能静默无响应（§1「不得静默回退」的延伸）。
- **`prefers-reduced-motion`**：开了系统「减少动态」就停掉全部位移与图元动画，只留颜色 / 描边反馈。

**WebMessage 约定（都不走 API 路由**——`CheckRouteCoverage()` 会拿 `backend/app/main.py` 双向比对，多一条就得连 Python 后端一起改**）**

- 页面 → 壳：`chrome-command`（`drag` / `hide` / `toggle-maximize` / `theme`），`app.js` 的 `shellChromeCommand()`；`data-drag` 区域 `mousedown` 发 `drag`、`dblclick` 发 `toggle-maximize`
- 壳 → 页面：`chrome-state`（`{maximized}`），页面据此切 `body.is-fullscreen`（沿用 `.is-fullscreen .view` 限宽居中），按钮 / 双击 / 拖到屏幕顶端三条路状态一致

**顶栏 8px 系统保留区（壳底色跟主题）**——无边框壳（`SetBorderAndTitleBar(false,false)`）顶部有一条约 8px 的带**始终由系统绘制**，WebView2 盖不住，深色主题下会露白带。覆盖它要**两件事一起做**，缺一仍露白：

| 层 | 归属 | 收口 |
|---|---|---|
| 客户区内的 XAML 底 | `RootGrid.Background` / `Splash.Background` | `MainWindow.SetShellTheme()` |
| 客户区外、由 DWM 画的 caption 残留 | `DWMWA_CAPTION_COLOR`（attr 35） | `WindowChrome.SetCaptionColor()` |

- `app.js` 的 **`applyTheme`** 是唯一前端出口：写 `data-theme` 后调 `shellChromeCommand('theme', t)`，壳收到即改这两层底色并写 `%LOCALAPPDATA%\ApexShell\last-theme.txt`。
- 壳启动先用 `last-theme.txt` 猜基调（`ApplyStoredShellTheme`，避免深色用户首帧白闪），页面加载后以**页面偏好为准**覆盖它——app.js 的 `loadPrefs()` 早于 `/bootstrap` 落地，所以权威值总是最后到达。
- `index.html` 的 `<head>` 里有一段**同步内联脚本**（**必须在 `<link rel=stylesheet>` 之前**）读 localStorage 预置 `data-theme`：只靠 `app.js` 的话，深色用户每次启动都会先按 markup 的 `light` 渲染一帧再翻深色。它只读、不做白名单校验（那是 `normalizePrefs` 的活）。
- 主题色值别硬编码猜：浅 `rgb(249,243,240)` / 深 `rgb(32,30,37)`，均取自页面 `body` 渐变的顶边合成色（`styles.css` 的 `--bg`），改 `--bg` 时要连这两个常量一起复核。

**踩过的坑（都真踩过）**

1. **程序化拖拽前必须先把窗口变前台**（先点一下 / `SetForegroundWindow`），否则第一次 mouse-down 被「激活窗口」吃掉 → 拖拽**假阴性**。
2. **`taskkill /F` 强杀壳会留孤儿 `msedgewebview2.exe`**，之后可能导航不完成（卡在启动遮罩、日志 `splash: 导航超时`）。构建前尽量让壳从托盘正常退出。
3. **WinAppSDK 1.6 的 `AppWindowChangedEventArgs` 没有 `DidPresenterStateChange`**，最大化翻转要在 `WindowChrome` 里自己差分（`EmitMaximized`）。
4. **页面发壳消息一律走 `shellChromeCommand()` 且传对象，绝不自己 `postMessage(JSON.stringify(...))`**：壳侧用 `e.WebMessageAsJson` 解析，自己 stringify 会把整条消息降级成一个 JSON **字符串**，`root.TryGetProperty("type")` 取不到，命令被**静默丢弃**（日志一条不留）—— `applyTheme` 曾栽在这：代码看着完全正确、测试也过（旧断言只正则匹配源码字面量），但壳里主题切换永远不生效、`last-theme.txt` 从不生成。**排查「前端发了壳没收到」先看壳日志有没有对应行**（写了 `未知的 chrome-command` 是分发问题，一条都没有则是根本没解析出来）。
5. **WebView2 启动时的后台网络活动会把「首次导航」顶成 ~2.0s**：Chromium 起浏览器进程时并行做组件更新（`update.googleapis.com`）、variations seed、域名可靠性上报；本机这些域名不可达，请求拖到超时就落在**首次导航**上（**同进程内第二次导航只要 20~90ms** —— 这一对比就是「慢在启动网络活动、不在页面本身」的铁证）。已在 `MainWindow.CreateWebViewEnvironmentAsync()` 的 `AdditionalBrowserArguments` 里关掉 `--disable-background-networking` / `--disable-component-update` / `--disable-domain-reliability`。**别删**。这条**工具会话验不了**，效果只能由人双击后读 `web-shell.log`。

> 属于「判据」而不是「配方」的那几条（`GetWindowRect` 口径、`_` 与 discard 撞名、WebView2 截图取法）已并入 §10 第 28 / 38 / 43 条 —— **§10 是唯一的坑清单，这里不复述**。

**已知未验证（工具会话验不了）**：从工具会话启动的壳，WebView2 能 ready 但**导航不完成**（`splash: 导航超时`）—— 实测连 `msedgewebview2.exe` 子进程都不会起来（按命令行过滤 `ApexShell` 得 0 个），所以这是**环境限制、不是代码问题**。因此「空白区拖动手感、托盘 / 全屏按钮、顶栏观感」以及**启动耗时里的「首次导航」一段（`nav-start` → `nav-done`）**都要由人双击拉起后验收，agent 只读它留下的 `web-shell.log`。
