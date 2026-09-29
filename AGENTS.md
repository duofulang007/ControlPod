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

## 验证

```powershell
node smoke-test.js
dotnet build shell\ApexShell.csproj -c Debug -p:Platform=x64 -p:RuntimeIdentifier=win-x64
shell\bin\x64\Debug\net10.0-windows10.0.19041.0\win-x64\ApexShell.exe --selftest
```

前端测试以末行 `ALL_PASS` 为准；壳自测以进程退出码和测试报告为准。改外部模块时，另跑该仓库自己的检查。视觉与桌面交互需在实际窗口复核，不能把无头自测当作窗口验收。
