# ControlPod 维护说明

ControlPod 是 Windows 本地总控台。当前实现为 WinUI 3 外壳（`shell/`）、原生 HTML/CSS/JavaScript（仓库根目录）和壳内 C# LocalApi。日常数据保存在 `%LOCALAPPDATA%\ControlPod`。本仓库不运行 Python 后端，也不提供本地 HTTP 服务。

## 修改前

- 先检查 `git status`，保留已有改动。按当前代码与测试判断行为，不沿用旧 APEX Console 的实现说明。
- `app.js` 管页面状态和事件委托，`web/shell-bridge.js` 管 WebView2 消息，`shell/LocalApi.cs` 分发本地 API；相关行为改动要贯通这几处。
- 独立工具位于 `D:\Projects` 下各自的 Git 仓库；ControlPod 只发现直接子级仓库的 `.apex/module.json` 并编排，不复制它们的源码或运行环境。模块契约见 `docs/module-authoring.md`。

## 必须保持

- 真实执行失败、模块缺失或权限拒绝时，显示原因并停止后续步骤，不制造成功状态。
- 删除用户数据前提供预览和确认；保留 SQLite 中已有数据。数据库迁移只追加到 `shell/Db.cs`，用 `PRAGMA user_version` 管版本，并测试旧库升级和较新版本拒绝启动。
- 应用启动入口必须重新验证；移出应用清单不删除本机安装文件。
- 前端继续使用原生 HTML/CSS/JS，不引入构建框架。界面文案使用中文；新增交互沿用 `data-act` 事件委托，插入 HTML 的数据须转义。
- WebView2 页面通过消息桥访问壳内 API。新增或删除路由时，同步更新 `LocalApi.CoveredRoutes` 和 `shell/SelfTest.cs`。
- 模块的清单、适配器和依赖由所属仓库维护；ControlPod 不改写外部模块清单。

## 前端维护

- 项目卡片主按钮负责运行、关闭和重启；铅笔按钮进入详情。卡片空白处用于长按排序，按钮点击和拖拽不能互相抢占。
- 卡片与详情共用 `projectRunControlsHTML()` 和项目运行状态；恢复页面时按后端实际状态对账。流程名统一经 `flowNameOf()` 读取。
- 外观尺寸和动效参数集中在 `styles.css` 的令牌；交互保持键盘可用，并遵守 `prefers-reduced-motion`。删除功能时一并清理动作分支、样式和对应断言。
- 后端数据以成功响应为准再更新页面；外观偏好沿用 `PREF_KEYS` 白名单，新增持久数据先明确归属。

## 验证

```powershell
node smoke-test.js
dotnet build shell\ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe --selftest
```

前端测试以末行 `ALL_PASS` 为准；壳自测以进程退出码和测试报告为准。改外部模块时，另跑该仓库自己的检查。视觉与桌面交互需在实际窗口复核，不能把无头自测当作窗口验收。

构建环境、源码路径和发布版区别见 `README.md`。无需为文档或 Web 文件更新重新发布桌面程序；用户要求更新安装版时，再构建并发布。

## 更新与维护工具

- 本地更新链路：`tools/update-local.ps1`（检查 / 测试 / 发布，按文件数逐段上报 `progress`）→ `tools/apply-update.ps1`（退出后替换并重开）。外部项目由 `tools/update-external.ps1` 按各仓库维护配方处理，回归脚本 `tools/test-external-updates.ps1`。
- 更新状态只写 `%LOCALAPPDATA%\ControlPod\updates\status.json`；前端读该文件的 `progress`，不再按阶段自行编进度。
- `tools/trim-update-artifacts.ps1` 默认只预览，`-Mode clean` 才执行；只清可再生成的 bin/obj/publish 与多余回退副本，不碰源码快照、测试报告和数据库。
- 仓库根只放源码与 Git 配置（`smoke-test.js` 有根目录白名单断言）。交接 / 状态文档归档到 `D:\Projects\.workbuddy\backups\<仓库>\`，不放回仓库根。
