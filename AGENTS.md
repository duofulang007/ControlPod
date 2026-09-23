# AGENTS.md · 控制台项目接手说明书

> 给任何要读 / 改这个项目的 agent：**先读这一份，再动代码**。它包含了术语、硬约束、架构、验证方式与全部已踩过的坑。
> 最后更新：2026-09-21 · 测试基线：**前端 ALL_PASS + 后端 58 项通过**
>
> 2026-09-16 后端接入轮目标：Apex Console 成为唯一前端；「APEX 启动」模块通过 APEX 常驻后端共享同一份 `ApexOneClickService` 状态，支持真实启动与一键关闭，不启动原 Vue/Vite 前端。禁止改回每次动作新建一个短命 service 的适配器，否则关闭动作拿不到启动状态。

---

## 1. 这是什么

个人开发者用的**本地总控台原型**：继续开发、一键启动应用与网页、项目任务、项目记录与项目文件，全部收在一个界面里。

- **原生前端 + 本地后端**：前端仍是 HTML + CSS + 原生 JS，零构建；后端使用 FastAPI，只监听 `127.0.0.1`，同源提供静态页面和 `/api` 接口。
- **迁移中**：现有 `DATA` 仍是原型种子，但新增的项目、任务、模块和运行记录必须逐步迁到后端。不得在后端不可用时回退为假成功或假执行。
- **定位**：验证交互与信息结构，不是可上线产品。不要为它加工程化设施。

---

## 2. 文件地图（本目录）

**前端根目录仍保留原 5 个文件；后端只能放入 `backend/`。** 不要在根目录增加文档、截图、备份或构建产物。运行数据放 `backend/data/`，修改前备份仍放项目外。

| 文件 | 体量 | 作用 |
|---|---|---|
| `index.html` | 18 KB | 入口骨架：侧栏 + 导航 + 顶栏 + `#view` + 三个全局宿主（详情抽屉 / 编辑弹窗 / 命令面板）+ 提示条 |
| `styles.css` | 92 KB | 全部样式，设计令牌集中在顶部 `:root`（含 `[data-theme="dark"]`） |
| `app.js` | 283 KB | 全部逻辑：数据种子 `DATA` → 运行时状态 `S` → `render()` 渲染器 → 底部大 `switch` 事件分发（163 个 `case`） |
| `smoke-test.js` | 142 KB | 冒烟测试（629 项），**同时是本项目的活规格**：读它就知道每个功能的预期行为 |
| `AGENTS.md` | 本文件 | 接手说明书（术语 / 约束 / 架构 / 坑点 / 已删模块） |
| `backend/` | 后端目录 | FastAPI 应用、可执行模块包、运行日志与后端测试 |

没有 `node_modules`、没有历史副本目录（历史与已删除的旧文档都在 `../backups-2026-09-15.zip`）。`backend/.venv`、`backend/data` 与测试缓存是本机生成物，均不属于源码。

---

## 3. 怎么跑、怎么验

```bash
# 首次准备后端环境（使用 APEX 已有的 Python 3.12 作为引导解释器）
powershell -ExecutionPolicy Bypass -File backend/bootstrap.ps1

# 启动：只监听本机 127.0.0.1:8765，然后访问 http://127.0.0.1:8765
powershell -ExecutionPolicy Bypass -File backend/start.ps1

# 前端活规格
node smoke-test.js

# 后端集成测试
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

- 桌面唯一入口是「APEX 总控台」快捷方式，目标为 `backend/.venv/Scripts/pythonw.exe backend/console_launcher.py`。入口会对源码内容生成指纹：服务未启动时启动；服务已启动且源码未变化时只打开网站；源码变化时只结束通过 `/api/health` 确认的 `apex-console` 监听进程，重启成功后再打开网站。后端子进程必须带 `CREATE_NO_WINDOW`，前端优先用 Edge / Chrome 的 `--app=` 模式打开独立无地址栏窗口；找不到受支持浏览器时才回退默认浏览器。端口属于未知程序时必须失败关闭，不得结束未知进程。
- `--app` 固定窗口用的 `--user-data-dir` 是**浏览器的完整 profile**，浏览器会把自身组件与 AI 模型下载进去（单个 ONNX 就近 170 MB），实测能把 `backend/data/` 撑到 460 MB+。因此 `console_launcher.prune_profile()` 会在拉起窗口前清掉 `APP_WINDOW_PROFILE_JUNK` 列出的缓存与组件目录（ProvenanceData / component_crx_cache / GrShaderCache / Default/Cache 等），**只保留 Default 主体**，窗口尺寸与位置记忆不受影响；文件被占用时静默跳过。需要单独清理而不启动服务时跑 `python backend/console_launcher.py --clean-profile`（建议先关掉控制台窗口，否则 msedge 会锁住部分文件）。

- **末行必须是 `ALL_PASS`**，否则算改动失败。
- 输出格式：逐条 `OK   <一句话>` / `WARN <一句话>`，末尾 `FAIL_COUNT=n`；`n=0` 时打印 `ALL_PASS`。
- 测试原理：用 `vm` + 极简 DOM 桩加载 `app.js`，末尾注入 `globalThis.__T = { 要测的函数… }` 作为导出清单，然后逐块断言（含**源码级接线断言**与 **CSS 规则断言**）。**新增可测函数必须同步加进这份导出清单**，否则测试里取不到。
- 测试不依赖浏览器；但它是「渲染字符串级」的验证，**视觉细节仍需人眼看预览**。

---

## 4. 术语（界面为准）

| 概念 | 用词 | 备注 |
|---|---|---|
| 一个可运行单元 | **项目** | 数据层字段仍叫 `workflow` / `WF_SEED`（历史遗留，**不要改**） |
| 流程里的单个动作 | **步骤**，配置动作叫 **步骤编排** | 「添加模块」是进入编辑模式的入口按钮 |
| 模块库的编辑 / 添加页 | **模块** | 导航第 5 项；**页面 id 仍是 `scripts`**（历史遗留路由，勿改）。曾用名「模块库管理」，2026-09-16 已简化 |
| 可选模块的资源卡片 | **执行模块库** | 原名「资源库」，2026-09 已改名，**勿回退**；指项目编辑态里那块选择面板，**不要**与导航项「模块」混为一谈 |
| 执行整个流程 | **运行项目** | 页头主按钮；旧称「运行工作流」 |
| 项目内容区 | **开发上下文** | 项目任务 / 项目记录 / Obsidian / 文件两栏布局 |

- **禁用词**：「菜谱」（历史遗留说法，禁止出现在界面文案与注释里）。
- 界面文案一律中文；**不用 emoji**；**图标一律内联 SVG**（`IC.*` 或 `tIco()`）。

---

## 5. 硬约束（违反即返工）

1. **不引入** React / Vue / Tailwind / 前端打包器。允许 `backend/` 中的本地 FastAPI 和同源真实请求，但必须只监听 `127.0.0.1`。
2. **真实执行不得静默回退**：后端断开、模块缺失、权限被拒或执行失败时，保留原始错误并停在第一个失败步骤。
3. 界面用词遵守第 4 节术语表。
4. 总控台是**单屏 bento 网格，无纵向滚动**；`.hero` 背景保持纯渐变，**禁止挂图片**。
5. 所有**删数据**的操作必须「**预演 + 二次确认**」；后端空库时允许 0 个项目，必须渲染真实空态。
6. 视觉调整**只改 `styles.css` 顶部 `:root` 令牌**，不在组件里硬写 px（尺寸 / 圆角 / 间距 / 颜色一律走令牌）。
7. **不新增宽度断点**：适配只有「标准窗口 / 全屏」两态（历史约定，测试里有断言）。
8. 不留死代码：删功能要连数据、动作分支、样式、断言一起清（有一条全局护栏断言会检查 CSS 里的零引用类名）。

---

## 6. 架构速览

**状态**
- `DATA`：全部种子数据，**共 13 类**：`projects / obsidian / apps / todosPlan / activities / notices / notes / sceneModes / tracks / devContext / projMeta / projectTemplate / modules`。
- `S`：全部运行时状态（**54 个字段**）。除 `S.obsidian` 的仓库名 / 项目目录 / 项目绑定外，其余状态刷新即重置。常用的有：
  `S.page` 当前页 · `S.proj` 当前项目 **id** · `S.wf` 当前打开的项目 **id** · `S.running` 运行态 `{token,wfId,i,done,total,states,log,order}` · `S.todos.plan` · `S.notes` · `S.noteSel` 正在编辑的项目记录 · `S.wfEdit` 编辑模式 · `S.zoneH` 任务区高度 · `S.more` 各页「展开全部」开关 · `S.modTab` / `S.modQ` 模块页筛选 · `S.obsidian` Obsidian 本机配置。
- **`proj` 这个字段名装的是两种东西，改数据时务必分清**：`S.proj` / `S.wf` 装项目 **id**（`'apex'`）；而 `todos.plan[].proj` / `modules[].proj` / `notes[].proj` / `activities[].proj` 以及 `DATA.projMeta` / `DATA.devContext` 的**键**装的是项目 **名字**（`'APEX Automation'`）。按名字关联的这几处靠 `renameProjRefs()` 迁移、`purgeProjRefs()` 清理来维持一致。
- Obsidian 配置使用浏览器 `localStorage` 的 `apex-console.obsidian.v1` 键保存；只允许 `vault/projectFolder/bindings` 三个字段，读取失败或脏数据时安全回退，不阻断页面。这是唯一的**浏览器本机持久化**；项目、任务、项目记录、项目文件关联、用户创建的网站模块、项目模块绑定与运行记录均由后端 SQLite 保存。
- SQLite 结构版本使用 `PRAGMA user_version`，迁移集中在 `backend/app/db.py` 的 `MIGRATIONS` 中按版本顺序执行。新迁移只能追加，必须保留旧库数据并增加升级测试；数据库版本高于当前程序时必须拒绝启动，不得降级覆盖。
- 任务数据库的 `kind` 与前端共用 `todo` / `fix` 两种内部值，旧任务升级后默认为 `todo`。启动时为后端任务重建 `S.todos.plan`；新建以 `POST /api/projects/{id}/tasks`、其余操作以 `PATCH/DELETE /api/tasks/{id}` 成功后的返回为准，失败不改本地列表。“当前任务”区的 `S.devTask` 仍是本轮不持久化的界面状态。
- 项目记录使用 `notes` 表，以项目 id 关联并级联删除；`tag` 仅允许日常 / 技术 / 复盘 / 灵感，`links_json` 保存只读历史关联。启动时由 `/api/bootstrap` 重建 `S.notes`；新建、保存、标签、置顶和删除均以对应后端请求成功后的返回为准，失败不改本地列表。
- 「编辑基本资料」通过 `PUT /api/projects/{id}/basic-info` 一次提交开发字段、任务、项目记录与开发要求；后端在同一事务中校验、写入或删除，任一条目无效就整批回滚。成功响应才重建该项目的 `S.todos.plan`、`S.notes`、`DATA.devContext` 与 `S.projRules`，不得先改本地再假报保存成功。
- 应用清单使用 `applications` 表保存名称、分类、图标、常用、占用展示、使用次数、最近启动、真实启动快捷方式与扫描来源；源码不再附带演示应用，也不再把原型清单迁入数据库。`GET /api/applications/scan` 合并 Windows 开始菜单快捷方式、已注册开始应用和 App Paths，只保留能由 Windows 重新验证的启动入口，并过滤网页、目录、卸载 / 修复 / 帮助入口；扫描结果与已保存的真实应用均通过 Windows Shell 提取原生图标。`POST /api/applications/from-scan` 必须按扫描 id 重新确认真实入口，前端不能提交任意程序路径。启动时后端再次确认快捷方式仍在本次扫描结果内，再调用 Windows 打开它；打开成功后才增加使用次数。旧的无启动入口记录保留在数据库但不进入前端清单，重新添加同名真实应用时原地升级。新增、标签、常用、最近启动与移除均以后端成功返回为准；“移除 / 卸载”只移出控制台清单，绝不删除本机安装目录。应用加入项目时复用现有 `modules → project_modules → runs` 执行链：后端创建隐藏的 `application` 适配模块，`projectApplications` 只向前端恢复应用绑定，适配模块不得出现在「模块」页。应用从清单移除时先解除项目绑定并停用适配模块，历史运行记录保留。

**渲染**
- `render(keepScroll)` → 调 `PAGES[S.page]()` 拿 HTML 字符串 → 写进 `#view`；只有切页 / 换项目才播放入场动画。
- 全站**事件委托**：元素上写 `data-act="动作名" data-id/data-v`，统一在 app.js 底部的 `switch` 里分发。新增交互 = 加一个 `case` + 元素上挂 `data-act`。

**单一事实源（重要）**
- 「普通任务」与「待修改」是**同一份** `S.todos.plan`，用 `kind` 区分（`todo` / `fix`）；只在所属项目内呈现。**`kind` 是内部字段**（只服务 `projTodos` / `projFixes` / `devCounts`），任何对外文本都统一显示「待办」，见「术语表」与第五节 `KIND_SHOW`。
- 「项目记录」与「灵感」是**同一份** `S.notes`，灵感 = `tag === '灵感'`；每条记录必须归属项目。
- 项目内的所有计数（任务数 / 记录数）由 `devCounts()` **派生**，改一处即一致。
- **不要新增第二份数据**，也不要加「同步」按钮——一致性靠数据同源保证。

**全局 DOM 宿主（都在 index.html）**
`#drawer/#drawerMask` 详情抽屉（**仅「纯查看」类**：应用 / 项目详情、云同步）· `#noteModal/#noteModalMask` 居中编辑弹窗（**所有「编辑 / 填写」表单的唯一宿主**）· `#paletteMask` + `#paletteList` + `#paletteInput` + `#aiZone` 命令面板 · `#toasts` 提示条。

- **转义纪律**：所有进 HTML 的**数据值**必须过 `esc()`（`toast()` 内部已经 `esc(msg)`，不用重复）。当前 1178 处模板插值里，未走 `esc()` 的 92 处全是本地字面量或返回 HTML 的函数 —— 改动时不要打破这条。属性位置同理（`title` / `placeholder` / `aria-label`）。

---

## 7. 页面与组件地图

导航 5 项（顺序固定）：**总控台 / 项目 / 模块 / 应用 / 设置**
（第 6 个页面 `workflows` = 打开某个项目后的详情页，**不进导航**，从「项目」页进入。）

- **总控台**：继续工作 hero（含项目切换）+ 最近打开 + 最近活动；单屏无纵向滚动。这里不放任务与记录的重复入口。
- **项目（选择页）**：卡片栅格 + 尾部新建卡；卡上可切状态、复制、刷新、删除（删除走预演 + 二次确认）。删除前必须由 `GET /api/projects/{id}/delete-preview` 返回任务、项目记录、执行模块绑定与运行记录数量；项目仍有排队或运行中的动作时，必须先关闭项目。确认后 `DELETE /api/projects/{id}` 在后端借助外键级联一次删除项目、任务、项目记录、绑定和**全部运行历史**，共享模块本体不删。前端成功后再调用 `purgeProjRefs()` 清理按项目名 / 项目 id 引用的界面数据——`S.todos.plan` 待办、`S.notes` 记录、`DATA.projMeta` / `DATA.devContext`（按名索引）、`S.devTask` / `S.projRules`（按 id 索引）；`DATA.modules[].proj` **不删模块**，归回 `DEFAULT_PROJ`。**这与改名链路 `renameProjRefs()` 是一对**（改名=搬过去，删除=清掉），口径必须对齐，否则会出现「删了项目、旧待办还留着，新建同名项目时原地复活」。`S.acts` 活动流是历史记录，删除时**保留**。最后一个项目由前后端共同拦截；`viewHome` 与 `viewWorkflows` 仍各留一层空态兜底（`cur` / `curWf()` 为 `undefined` 时直接返回空态，不碰 `.st` / `.steps`），只用于防止异常数据造成白屏。
- **项目运行控件（2026-09-16 定稿）**：项目选择页卡片与项目详情页头必须共用 `projectRunControlsHTML()`，不得各写一套。未启动只显示「运行项目」；真实启动成功后两处同时切成「关闭项目 + 重启项目」；进行中按钮禁用并显示对应反馈。`S.projectRuntime` 由后端 `/api/projects/{id}/runtime` 从最近一次成功运行记录恢复，页面刷新后不能退回假空闲。运行流程卡只展示状态、日志和步骤，**不再放第三个关闭入口**。真实重启必须由模块按「完整关闭 → 完整启动」顺序执行，任一步失败都停止并保留原始错误。后端 `/api/bootstrap` 的 `projectRuns` 是运行次数、最近时间与最近三条历史的唯一来源；页面不得补固定日期或标注 Mock 的假历史，关闭动作不计入运行次数。
- **项目详情页**（`S.wf` 指向的项目），四个区块：
  1. **概览**：身份卡（可内联编辑）+ 能力卡 + 统计卡。
  2. **开发上下文**：项目内容唯一入口，两栏。左 = 当前任务区 + 高 / 中 / 低优先级区（任务可拖入区域切换状态，支持多个当前任务、可为空，区高可拖拽调整）；右 = Obsidian 项目资料中枢卡 + 项目记录 + 项目文件。项目文件只登记当前项目的已存在本机文件；“打开”只向后端传递已登记条目的 id，由 Windows 默认程序处理，不能提交任意路径；“移除”必须先预演和二次确认，且只删关联、不删磁盘原文件。中枢卡以「当前项目 — 路径状态 — Obsidian 主页」显示关系：保存路径后一次点击请求打开主页；更多菜单一级只保留「写入项目资料 / 连接设置」，路径、新建与解除连接收进连接设置。浏览器无法读取仓库，所以界面只能显示「路径已保存」，禁止显示已识别或已绑定。任务走居中弹窗编辑；记录走居中弹窗，归属由当前项目入口确定，弹窗不重复显示项目选择或整张关联任务清单。卡底「编辑基本资料」也走居中弹窗，编辑的是「复制 Agent 上下文」同一份纯文本。
  3. **运行流程**：**单张卡**——卡头是运行状态徽标 + 「添加模块」入口；卡内依次为 运行状态摘要 / 详情（日志终端）→ 主流程线性流程视图 → 历史记录。模块异常在卡内按「· 模块名：原因」点名。
     - 主流程：每行 5 个节点、**蛇形走向**（第二行反向） + 行间 S 形曲线 + 方向箭头；节点三态：已完成（绿 √）/ 进行中（品牌色高亮）/ 未开始（空心）。
  4. **设置**：项目开关 + 裸红色「删除项目」长条（点击 → 预演弹窗 → 二次确认）。
  - 页头 `.page-head.stick` 吸顶：毛玻璃 + 圆角 + `z-index:20`。
- **模块**（页面 id 沿用 `scripts`，历史遗留路由，勿改）：原「脚本」页已取消，改为**执行模块的唯一编辑 / 添加入口**。数据源是后端 `/api/bootstrap` 恢复后的 `DATA.modules`；源码不再附带演示网站模块。当前「新增模块」使用一个内置 `web` 模板，只填写**名称 / 网站地址 / 描述**，后端保存模块实例，项目归属只由 `project_modules` 多对多绑定维护，不写进模块表单；同一网站模块可被多个项目复用。APEX 等磁盘清单模块显示为「内置模块」，不得从页面改写或删除。新增 / 编辑共用 `moduleFormHTML()`；删除走「预演 + 二次确认」（`modDeleteAsk` → `modDeleteModalHTML` → `modDelete`），并解除使用它的项目绑定、保留历史运行记录。**「应用」仍由 `S.apps` 承载，不在本页出现**；运行输出统一看项目「运行流程」卡的 `#termRun`。
- **应用**：列表 + 惯性滚动 + 分类标签；“添加应用”实时识别 Windows 本机可启动应用，维持“选择真实应用 → 可选改名 / 改标签 → 确认添加”的两步流程。扫描结果必须在弹窗内容区独立滚动，底部选择状态与“下一步”操作始终可见；点选重绘、进入命名确认再返回时保留原列表位置。不得恢复静态 `ADD_POOL`、自定义空壳应用或后端断开时的假成功；只有带后端验证启动入口的应用才进入 `S.apps`。支持侧栏折叠态（`.app.mini`）。
- **设置**：外观、通用行为、快捷键；另含 Obsidian 全局连接（仓库名 / 项目目录 / 测试打开），配置与项目主页路径保存在当前浏览器本机。具体项目的主页连接放在项目「开发上下文」资料中枢卡里，通过 `obsidian://` 请求打开、新建或单向写入；生成的 Markdown 主页带返回当前项目的深链接。写入会用 `overwrite` 覆盖目标路径页面，解除连接只删除本机路径，两者执行前都必须预演 + 二次确认。当前不读取仓库、不做自动同步，浏览器不得把保存路径或发出 URI 请求表述为识别、绑定或写入成功。
- **命令面板**：`⌘K / Ctrl+K`，`buildPalette()`。**「常用」分组必须由 `DATA.projects` 派生**（取有 `flowName` 的项目），**不要写死项目 id**——写死的话项目被删掉后入口还挂在面板上，点下去只会静默跑到别的项目上；分组为空时会被 `clean` 自动过滤掉。同理 `startRun(id)` 必须**明确判存在**（`if (!wf) return`），不要用 `find(...) || curWf()` 兜底。
- **抽屉与弹窗的边界（2026-09-15 定稿）**：**所有「编辑 / 填写」表单走居中弹窗**——项目记录编辑、编辑基本资料、新建 / 编辑项目任务、新建项目、添加项目文件、添加应用（两步）、导出配置；**右侧抽屉只保留「纯查看」类详情**——应用 / 项目详情、云同步。统一入口是 `openModal(html, { form:true })` / `closeModal()`，配标题区 `mHead()`、按钮区 `mActs()`，全部复用 `#noteModal` 宿主；`form:true` 用窄版宽度（`--modal-w-form`），默认宽版（`--modal-w`，长文本 / 列表）。`closeNoteModal()` 只是 `closeModal()` 的兼容别名（遮罩与 Esc 指向它）。**禁止**再为编辑表单新开抽屉，或自带一套标题 / 按钮结构。
- **任务表单骨架统一（2026-09-15）**：「新建项目任务」与「项目任务编辑」两个弹窗共用 `todoFormHTML()`——`标题 → 截止 → 优先级` 三段逐字一致（同一顺序、同一样式、都不带灰字说明）。**两个弹窗现在只有两处差异：标题文案、以及编辑多一个「删除」按钮**（新建：`保存 / 取消`；编辑：`保存 / 删除 / 取消`）。**禁止**再给其中一个弹窗单独加字段、改顺序或塞 `<small>` 说明，否则又会退回「新建一个样、编辑另一个样」。所属项目两边都只在标题下**只读**展示（副标题），不再提供选择器；「关联项目记录」整块已删除。

---

## 8. 样式系统

- 令牌集中在 `styles.css` 顶部 `:root`（暗色在 `[data-theme="dark"]`）：
  - **文字** `--ink / --ink-2 / --ink-3 / --ink-4`；**描边** `--line / --line-2`
  - **品牌** `--brand:#E8402A / --brand-dark / --brand-soft / --brand-line / --on-brand`
  - **语义色** 每色配一枚 `-bg`：`--green / --blue / --amber / --purple / --teal / --slate`
  - **项目状态三态** `--st-ok / --st-dev / --st-pause`（各配 `-bg`）；**表单校验错误** `--err / --err-bg / --err-line`
  - **表面** `--card / --card-strong / --tile / --tile-2 / --hover / --bg / --side`
  - **圆角** `--r-card:20px / --r-inner:14px / --r-sm:10px / --r-pill:999px`
  - **间距** `--pg:20px / --pg-sm:12px / --gap:16px / --pad:18px`；**阴影** `--sh / --sh-lg`；**毛玻璃** `--blur`
  - **尺寸** `--side-w:240px / --main-max:1440px / --tile-min:290px / --board-gap / --tile-pad / --app-row-h:46px / --app-row-gap:6px / --home-tile-ico:42px`
  - **动效** `--ease-out / --motion-press / --motion-panel`
  - **专项** 终端底色 `--term-bg:#2E3440`；居中弹窗宽度 `--modal-w:760px`（宽版）/ `--modal-w-form:480px`（窄版表单，由 `.note-modal.form` 取用）
- 卡片三件套：`.card`（圆角 + 毛玻璃 + 描边 + 阴影）、`.card-head` + `.card-title`（配 `<small>` 副标）、`.list` + `.row`。
- 文字层级：标题 16px/600 → 小标 11px/`--ink-3` → 正文 12.5–13px → 辅助 11px/`--ink-4`。
- 自适应靠 `min()` / `clamp()` / flex / grid，**不用媒体查询断点**（现有媒体查询只用于「减少动态效果 / 触屏 / 悬停能力」这类能力门控，不是宽度断点）。

---

## 9. 测试约定

- 断言按主题分块：`/* n. 主题 */ try { … } catch (e) { console.log('FAIL …'); fail++; }`。
- 断言的描述要写「期望的行为」，不是实现细节；一条 `check` 一句话。
- **改了结构就补 / 改断言**；删功能要补**负向断言**（「已彻底移除」）。
- 避免脆弱匹配：用前缀或正则（如 `indexOf('class="page-head')`），别用整串精确匹配，否则加个类名就误报。
- 现有全局护栏：「styles.css 里不得出现零引用类名」（**458 个类**当前全部有引用）。删功能时必须同步删样式，否则这条会红。

---

## 10. 常踩的坑（都真踩过）

1. **文本替换要覆盖足够上下文**：`old_string` 若正好切到下一个 `case` 的开头，会把相邻分支吞掉——改完立刻回读文件确认。
2. 同一个 `try` 块里「先用后声明」的 `const` 会 **TDZ 报错**；跨块引用变量无效，要在本块自己读文件。
3. 运行引擎时序：`startRun` 首帧**全部 `wait`**；第一次 `advanceRun` 才把首个步骤点亮为 `now`；第二次才出现 `done`。写断言别猜。
4. 蛇形流程的**行容器必须带 `rev` 类**才右对齐，否则节点与 S 弯端点错位（错过一次）。
5. 贴边通栏元素的小圆角**视觉上等于没有**；要明显圆角就做成悬浮卡片。
6. 清 CSS 死代码的判定：选择器里**任一**类名在 `app.js` / `index.html` 中从不出现 → 该选择器不可能命中（祖先类活着不代表规则活着，如 `.player .p-info`）。清理前先排除运行时拼接（查模板字符串与字符串加号）。
7. 本机 PowerShell 的 `Add-Type`（含 `-AssemblyName`）被安全策略拦截：取像素 / 调 .NET 改用隔离 Python。
8. 打包中文名文件别用 PowerShell `Compress-Archive`（乱码），用 node + zlib 自写 ZIP（文件名 UTF-8 标志位 `0x0800`）。
9. **「三态 / 多态」配色：类名列表和 CSS 规则必须一一对齐，漏一条就是隐形的黑点**。项目状态三态 `pst-ok` / `pst-dev` / `pst-pause` 里，`.pst-ok` 的规则一度根本没写（只有 `--st-ok` / `--st-ok-bg` 令牌在，另外两态有规则）。后果不是「没颜色」而是**看起来像另一个颜色**——`.st-switch .dot{background:currentColor}` 会退化成继承色（近黑），界面报障就是「正常显示的不是绿色是黑色」；同时「正常」那颗开关连底色都是透明的，和另外两态不一致。**教训**：色板是按「态」写的，`PROJ_STS` 加一个态就必须在 `styles.css` 里补一条 `.pst-*`；测试已加断言（每个 `st.cls` 都要在 styles.css 里有 `.{cls}{` 规则 + `.pst-ok` 必须有 `color:var(--st-ok)`）。
10. **`stCls` 与 `st` 是两份数据，可能对不上**：`DATA.projects` 里 `ops`（`st:'已暂停'` / `stCls:'b-slate'`）与 `ai`（`st:'开发中'` / `stCls:'b-blue'`）用的是通用 badge 类，只有 `apex` 用 `pst-ok`。卡片 badge 直接渲染 `w.stCls`，状态切换控件却走 `projStDef(w.st).cls` —— 两处取值口径不同，改状态样式时别只看其中一处。
11. **本仓库源码是纯 LF，用脚本批量改写会把整份文件变成 CRLF，源码级断言会静默失效**。Windows 上 `io.open(p,'w')` 默认 `newline=None`，会把 `\n` 翻成 `\r\n`；而测试里有一批按 `\n` 精确匹配的断言（如 `'(function init(){\n  loadObsidianState();'`），CRLF 下 `{\r\n` 不含 `{\n`，断言就红了 —— 而且报出来的条目看起来与你的改动毫不相干（曾表现成「启动时恢复配置…」失败）。
    **规避**：批量改写用 `io.open(p,'w',encoding='utf-8',newline='')` 或二进制 `replace(b'\r\n', b'\n')`；改完对所有源码复核 `b.count(b'\r\n')`。项目没有 git、没有 `.gitattributes`，没有任何东西替你兜住。
12. **写否定断言时，注释里出现被否定的字面量也会命中正则**。例如断言 `!/startRun\('apex'\)/.test(appSrc)`，如果源码注释里写了「原来是 `startRun('apex')` / `startRun('ops')`」来交代历史，断言照样 FAIL。同一个坑还踩过一次：CSS 注释里写出被否定断言否定的**令牌名**（带 `--` 前缀）也会误命中。**写这类注释时不要带具体调用字面量**，改成「原来这两条是硬编码项目 id 的 startRun 调用」这种描述。
13. **批量做全局替换前，先确认每个出现位置都是你要改的那个**。同名的东西可能指两种概念（如 `proj` 既指项目 id 又指项目名、`模块` 既指导航项又指 `DATA.modules` 的条目），直接全文替换会把 `S.proj`（id）也一起改掉。**先 `grep -n` 列全部出现位置并分类，再决定替换范围**。
14. **真实 APEX 模块不要改回长 PowerShell 启动器**：旧入口曾被 Microsoft Defender 识别为 `HackTool:PowerShell/ApexToolkit.A`，脚本在参数解析前就被 AMSI 拦截，表现为 `ScriptContainedMaliciousContent`。当前 `backend/modules/apex-launcher/runner.py` 由 APEX 自己的 Python 3.12 虚拟环境执行，并通过 Windows `runas` 请求管理员权限；`module.json` 不含 PowerShell 或执行策略绕过。不要用关闭防护、加白名单或改回脚本来规避。`ModuleRunner` 的程序路径也必须像参数一样展开 `{project_root}` 等占位符。
15. **总控台一键入口只结束已验证的监听进程，不要改回 `taskkill /T`**：虚拟环境解释器会有父子进程，`taskkill /T` 为遍历整棵进程树可能在实际机器上报“拒绝访问”，即使目标监听进程本身可安全结束。当前 `console_launcher.py` 先用健康检查确认服务身份，再对 `8765` 的监听 PID 使用最小 `PROCESS_TERMINATE` 权限；普通权限无法取得结束句柄时才申请 UAC。源码未变化时不重启，避免打开网站就中断正在执行的项目。
16. **自管滚动不要捕获按钮的指针**：应用列表的惯性滚动容器若在 `pointerdown` 时对按钮调用 `setPointerCapture`，鼠标点击会被吞掉，表现为键盘 Enter 可用、鼠标无反应。交互控件必须先经 `appScrollDragBlocked()` 排除；只有列表空白和非操作区域进入拖动。
17. **无人值守的模块绝不能停在交互输入上**：Windows 上 `getpass` 会绕过 stdin 重定向直接读控制台，即使子进程用 `stdin=DEVNULL` 启动，`getpass.getpass()` 仍会**永久挂住**（`console_launcher` 与 `ModuleRunner` 都用 `CREATE_NO_WINDOW`，现场表现为项目卡在「运行中」）。副作用是 `subprocess.run` 不带 `timeout` 时父进程一起挂死。因此 `backend/modules/runner-lab/runner.py` 必须给导入器传 `--no-prompt` 并设置 `IMPORT_TIMEOUT_SECONDS`；任何新增的交互式脚本在被模块调用前都要先加同类开关。
18. **项目名来自 manifest，不要再写死**：`module_runner.sync_registry()` 原先对任何 manifest 都插入项目名「APEX 启动」。现在读 `projectName` / `projectDescription`（未声明时回落到原文案，见 `module_registry.DEFAULT_PROJECT_*`）。新增模块必须在 `module.json` 里显式声明这两个字段，否则会继承「APEX 一键启动」的文案。
19. **`{console_root}` 在动作参数里也能用了（曾经不能）**：占位符以前只在 `projectRoot` 被替换，`actions.*.program` / `args` 里写它会在运行时抛 `模块参数包含未知占位符`，现场表现是「点一下模块就失败，日志里一行 ValueError」（`data/console-service.err.log` 里留过多次）。现在可用占位符统一由 `ModuleRunner._run_values()` 产出：`{module_dir}` `{project_root}` `{console_root}` `{run_dir}` `{result_path}` `{log_path}`；`{console_root}` 与 `ModuleRegistry.console_root` 同源。**跨项目模块（如 `runner-lab`）引用 console 自己的虚拟环境时必须写 `{console_root}`，不要写绝对路径**。回归由 `tests/test_module_project_metadata.py::test_action_placeholders_expand_to_an_existing_interpreter` 兜住。
20. **模块要开窗口就用 `pythonw.exe` + `DETACHED_PROCESS`，不要等窗口关闭**：`runner-lab` 模块的 `run` 动作改为打开导入窗口（拖压缩包 + 输密码）。`ModuleRunner` 会尽量用 `CREATE_NO_WINDOW` 起子进程，所以窗口进程必须由 `runner.py` 自己用 `pythonw.exe` + `DETACHED_PROCESS` 拉起来，否则会跟着一起来一个黑框，且调用方退出时被连带回收。pid 记在 `%TEMP%\run-analytics\import-gui.pid`（`tempfile.gettempdir()`，仓库之外；2026-09-23 前记在 `D:\RunningData\import-gui.pid`，该目录已撤销、导入投放目录收敛进 run-analytics 项目内），`stop` / `restart` 靠它精确结束窗口；不要换成按镜像名 `taskkill /IM pythonw.exe`。无界面导入路径仍然保留（不带 `--gui` 即走它），供自动化调用。
21. **模块项目是独立 git 仓库，放在 console 同级目录**：按「平台一个仓库、每个项目模块一个仓库」的约定，run-analytics 仓库在 `D:\Projects\run-analytics`（`..\run-analytics`），`module.json` 的 `projectRoot` 写相对路径 `..\run-analytics`，`module_registry` 会相对 console 根解析（不要改回按 cwd 解析，也不要写死盘符）。本仓库 `.gitignore` 排除 `run-analytics/` 整个目录，**两边提交互不混合**：改模块项目在它自己的仓库提交（含健康数据排除），改 `backend/modules/` 的接入层才在本仓库提交。

---

## 11. 已删除的模块（**不要加回来**，有负向断言）

- **版本 / 存储页面与假快照机制**：侧栏、项目内统计与跳转、演示数据、动作分支、样式和冒烟断言已全部移除；项目运行历史仍由后端真实记录提供。
- **预备检查卡**：异常不单独成卡，改为在「运行流程」卡内点名。
- **执行模块卡**：并入「运行流程」卡；「添加模块」入口移到该卡卡头。
- **独立待办 / 笔记页**：侧栏入口、首页卡片、页面渲染器、旧动作与对应样式已删除；任务 / 记录全部收进项目「开发上下文」。
- **收件箱 tab**：`S.todos.inbox` / `S.todoTab` 已删，不再存在独立内容入口。
- **侧栏「Apex 启动脚本」小卡**：含 `S.boot` / `runBoot` 动作 / `.mini-block` 系列样式，全清。
- **「打开项目」入口与 `wfOpenProject` 动作（2026-09-15）**：`projDevHTML()` 与 `devContextHTML()` 底部两处按钮 + `case 'wfOpenProject'` 一起清（它原本只是弹个 toast 的空动作；`devContextHTML` 其后已随下一条整体删除）。项目里真正的打开行为走 `openFolder`（`PATH_OF` 目录映射）。**注意**：命令面板里还有两个同名文案「打开项目」的入口，动作是 `openWf`（AI 卡片，跳转到项目详情）与 `askWorkflows`（问答 chip，跳到项目选择页），属于另一套跳转动作，未删除。
- **右侧抽屉版「完整开发上下文」与 `wfDev` 家族（2026-09-15）**：`devContextHTML()`、`wfDetailHTML()`、`wfDetail()`、`wfSwap()`（抽屉视图）已删；对应动作分支 `wfDetail` / `wfDev` / `wfDevBack` / `wfDevLink` / `wfOpenModule` / `setDevTask` / `clearDevTask` / 孤立触发的 `wfRun` 一起清。项目页底部原「完整开发上下文」按钮改为「编辑基本资料」（`data-act="editBasicInfo"`），打开居中弹窗（复用 `#noteModal` 宿主），内容 = `agentContextText()` 的同一份**纯文本**，可编辑、可保存回写（字段→`DATA.devContext`、待办→`S.todos`、灵感 / 笔记→`S.notes`、开发要求→`S.projRules`）；文本里缺掉的尾部条目属删数据，走 `basicInfoPreflightHTML` 预演 + 二次确认。抽屉里原来的「继续开发」按钮一并去掉。有负向断言（项目页不再出现「完整开发上下文」/`wfDev`）。
  - **模板精简（同日）**：`agentContextText()` 的定位段只输出 `项目` / `当前开发模块` / `模块路径` / `相关文件` 四行，后接三个内容段（`待办：` / `灵感 / 笔记：` / `开发要求：`）。原来的 `项目 ID`（与项目名等价）、`模块 ID`（路径里已含）、`开发状态`（静态值）三行，以及 `当前待办：N 项（含待修改 N 项）` / `当前灵感 / 笔记：N 项` 两行派生计数，已从模板剔除——计数与紧随其后的列表纯重复，对下游 Agent 无价值。**`下一步` 行也在第四轮一并剔除**（与待办列表里的目标重复，见下条）。**字段本身仍留在 `DATA.devContext` 里**（其中 `开发状态` 的页面宿主已在同日随开发上下文卡头一并删除，现在只剩「编辑基本资料」弹窗的 `nm-meta` 在显示）；`BI_FIELDS` 保持宽容解析，老文本若还带这些行照样吃得下（不丢历史数据），只是模板不再输出。有负向断言锁定（`项目 ID：` / `模块 ID：` / `开发状态：` / `当前待办：` / `当前灵感 / 笔记：` / `下一步：` 均不在模板里）。
  - **任务行格式收敛为 `N. [待办][优先级] 正文（截止）`（2026-09-15 四轮）**：①**类型徽章恒写「待办」**——「待修改」不再出现在任何输出里（`agentContextText` / 任务来源 / 删除预演 / `obsidianProjectNote` 全部改走新常量 `KIND_SHOW`），`TASK_KIND` 退居**数据词表**，只服务 `projTodos` / `projFixes` / `devCounts` 这几个内部分支；**`kind` 字段本身不动**，老数据仍可区分。②**优先级 高 / 中 / 低条条显式**——以前只有高 / 低带标记、中留空，现在三档全写，文本与界面的三档分组逐条对应。③**类型徽章刻意不参与解析**——`parseBasicInfoText()` 只回写 `pri` / 正文 / 截止，`applyBasicInfo()` 也不再写 `t.kind`；否则模板恒写「待办」会在保存时把 `fix` 条目**静默改成 `todo`**。**这条是硬约束**：新增任务由落库侧兜底成 `todo`。④「↳ 引用笔记」续行随之下线，`note.links` 至此**没有任何渲染宿主**。有正 / 负向断言（每条都带 `[高中低]`、解析结果无 `kind`、保存后 `fix` 仍为 `fix`、文本不含 `↳` / `下一步：` / `待修改`）。
- **开发上下文卡头整行删除（2026-09-15）**：`projDevHTML()` 返回的 `<section class="card tight">` 里，`card-head` 整块已删——既包括原标题 `继续开发 <项目名>`（项目名在页头 `h1` 与概览卡 `ov-name` 已各有一处，属第三处重复），也包括同行的开发状态徽章 `<span class="badge b-blue">${d.status}</span>`。**卡片现在直接以 `<div class="dev-cols">` 开场，没有卡头、没有标题**——这是有意为之，不要「顺手」补一个标题或徽章回来。**连带后果**：`devContext.status` 在页面上已无宿主，只剩「编辑基本资料」弹窗的 `nm-meta`（`${w.name} · ${d.status} · …`）在显示它；`projDevHTML()` 里对 `DATA.devContext[w.name]` 的兜底对象也顺手去掉了 `status` 键（`{files:[], lastEdit:'—'}`）。**字段本身没删**（保留 `DATA.devContext` 与 `BI_FIELDS` 里的 `开发状态` 宽容解析），要彻底删字段是另一件事。有断言（整页不含 `继续开发`、卡头紧接 `dev-cols`、卡内无 `card-head` / `badge b-blue`）。
- **任务编辑弹窗的「所属项目」选择器与「关联项目记录」整块（2026-09-15）**：两块连 UI 带动作一起清——`case 'todoSetProj'`（就地改任务归属）、`case 'todoNoteLink'`（建立 / 断开引用）、`toggleNoteLink()`（引用写入侧）全部删除，`todoMenu()` 里的 `projOpts` / `linkedNotes` / `pool` 局部变量一并去掉。**后果要清楚**：①任务创建后不能再改所属项目（所属项目只在弹窗标题下只读展示）；②任务 ↔ 记录的关联从两侧都无法再编辑（记录编辑器的任务清单早先已删），`note.links` 退化成**只读历史数据**——第四轮删掉「↳ 引用笔记」后它已无任何渲染宿主，只剩删除待办时的 `detachTodoRefs()` 兜底。**`notesLinkedTo` / `noteLinksOf` / `detachTodoRefs` 因此必须保留**——`detachTodoRefs()` 是唯一活着的消费者（两处调用：删除单条待办、保存基本资料时按文本差集删待办），不要连带删掉。有负向断言（`case 'todoSetProj'` / `case 'todoNoteLink'` / `toggleNoteLink` 零残留）。**遗留已确认（2026-09-16）**：`refBadgeOf` / `linkBadgeOf` / `notesLinkedTo` 三个纯展示函数**已无任何渲染宿主**，源码里只剩各自的定义与 `__T` 导出（`notesLinkedTo` 仅被 `refBadgeOf` 调用）——属**确认的死代码**。当前选择是**保留**（删它要连测试导出与断言一起改，收益低）；谁要清理，请连同 `smoke-test.js` 的导出清单一起改，别只删 app.js。
- **历史副本与探针截图**：`backups/`、`.probe-*.png` 已删除，内容归档在 `../backups-2026-09-15.zip`。
- **75 条孤儿 CSS 规则（50 个类名）**：早期卡片体系、播放器、旧项目卡等遗骸已清，**现零孤儿（458 个类全部有引用）**，且测试里有全局护栏断言锁定。
- **三份文档**：`存储与信息层级-设计方案.md`（存储机制未定稿，说明一并撤下）、`README.md`（内容已并入本文件）、`资料库同步地址清单-2026-09-12.md`（过时）——全部移入 `../backups-2026-09-15.zip`。
- **「脚本」页与运行终端（2026-09-16）**：整页取消，改为「模块」。同时清掉的还有 `viewScripts()` / `runScript()` / `tickTimer` / `.scripts` / `.script` / `.script .s-name` / `.script .s-meta` / `.caret` / `@keyframes blink`，以及动作分支 `run` / `clearTerm` / 无触发点的 `openScript`；样式里 `.terminal` / `.t-line` **保留**（应用详情、文件预览、运行流程卡的 `#termRun` 仍在用）。命令面板的「运行 start.sh」改为「新增执行模块」，设置页快捷键列表的「运行上次脚本 Ctrl+R」改为「打开模块 Ctrl+M」。**运行输出没有新宿主**——统一看项目「运行流程」卡的 `#termRun`，不要再为它加回一个终端。
- **四份分散的模块数据（2026-09-16）**：`DATA.scripts` / `DATA.webLib` / `DATA.folderLib` / `DATA.cmdLib` 合并为一份 `DATA.modules`，旧键**已彻底删除**（有负向断言）。连带简化：`larderItems()` 的四个 if/else 分支收敛成一次 `filter(m => m.type === t)`；`addStep()` 的 web / folder / script / cmd 四分支收敛成一次 `find()`（`base.note = m.arg || m.desc`，保持脚本步骤仍显示参数）。**迁移点**：脚本类模块的 `ref` 从内部 id（`s1`…`s5`）改成脚本文件名（`start.sh`…），项目步骤里唯一的引用 `w1s4` 已同步改写；新增模块的入口不参与 `ref` 唯一性以外的校验。**应用类不并入**（有断言锁定），仍走 `S.apps`。
- **「找不到就顶上第一个」的静默兜底（2026-09-16）**：`startRun()` 原为 `find(...) || curWf()`，项目被删后会**静默拿第一个项目顶上**（用户以为跑的是自己点的那个）；命令面板「常用」还写死了两个项目 id。两者已改：`startRun` 明确判存在并提示，常用分组改由 `DATA.projects` 派生。**这类兜底一律不要**——它把「失败」变成「做了另一件事」，比崩溃更难发现。
- **0 项目白屏（2026-09-16）**：`viewHome` 的 `cur.st` 与 `viewWorkflows` 的 `curWf().steps` 在 `DATA.projects` 为空时抛异常，异常发生在 `#view.innerHTML` 赋值**之前**，页面会停在上一屏、之后点任何导航都没反应（看起来像卡死）。现为两层防护：`projDeleteAsk` / `projDelete` 拦掉「删除最后一个项目」，两个页面各留一层空态。**记住这个模式**：`render()` 里任何在返回 HTML 之前就取属性的写法，抛错都会造成「页面冻结」而不是报错。

---

## 12. 交接规则

- **改完必跑 `node smoke-test.js`，末行 `ALL_PASS`**（当前 642 项）；改后端还必须跑 `backend/.venv/Scripts/python.exe -m pytest backend/tests -q`（当前 38 项）。结构变了补断言，删功能补负向断言。
- **本目录没有 git**：动手前自行留退路（复制到目录外），**不要破坏性覆盖**。
- **根目录只有原 5 个文件，后端统一进 `backend/`，源码是纯 LF**：别在根目录加东西；用脚本批量改写后必须复核 `b.count(b'\r\n') === 0`（见第 10 节第 11 条）。
- 一次只做一个主题的改动，不顺手重构无关代码；需求不明确先问。
- 历史形态在 `../backups-2026-09-15.zip`（2026-09-12 / 09-14 三个快照 + 一份旧文档，已校验可完整还原）。
- 正式运行方式：启动 `backend/start.ps1` 后访问 `http://127.0.0.1:8765`。直接打开 `index.html` 只适合看静态界面，真实执行仍要求本地后端已启动。若需交付他人，整个 `apex-console` 目录才是完整运行单元。
