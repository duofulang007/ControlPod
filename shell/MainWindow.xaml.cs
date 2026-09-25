using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.Web.WebView2.Core;

namespace ApexShell;

/// <summary>
/// 一期壳：窗口 + WebView2，用虚拟主机映射加载 apex-console 的 Web 三件套，
/// Web 层零改动。WebMessage 通信链路在下一步接入。
///
/// 启动路径上同时有两条昂贵的初始化：①LocalApi（开库 / 迁移 / 模块登记 / 中断回收），
/// ②WebView2 环境创建（要拉起浏览器进程）。两者互不依赖，所以都丢出去并行跑，
/// UI 线程只负责尽快把「启动遮罩」画出来——见 MainWindow.xaml 的遮罩层与下方「启动遮罩」段。
/// </summary>
public sealed partial class MainWindow : Window
{
    /// <summary>虚拟主机名（不含 scheme）。页面内相对路径都会解析到这个域下。</summary>
    private const string VirtualHost = "apex.local";

    /// <summary>Web 三件套所在目录（apex-console 仓库根）。</summary>
    private const string WebRoot = @"D:\Projects\apex-console";

    /// <summary>遮罩兜底时限：导航迟迟不完成时不能把用户永远按在遮罩上。</summary>
    private static readonly TimeSpan SplashTimeout = TimeSpan.FromSeconds(20);

    public MainWindow()
    {
        InitializeComponent();
        Title = "APEX 总控台";

        ApplyDefaultPlacement(1440, 900);
        SetupTrayBehavior();

        // 启动加速 ①：LocalApi 初始化甩进线程池。它只需要赶在第一次 API 请求之前就绪——
        // 实测首屏第一枪（/bootstrap）在导航完成之后才发出，而导航本身要 2s，这段完全够用，
        // 不该让它串在 UI 线程上挡着窗口出现。
        _localApiTask = Task.Run(() =>
        {
            var api = new LocalApi(windowHost: new ShellWindowHost(() => _appWindow));
            ShellLog.Log("localapi: ready");
            return api;
        });

        // 启动加速 ②：WebView2 环境创建也立刻排队（异步），与上面的线程池初始化并行。
        _envTask = CreateWebViewEnvironmentAsync();

        SplashPanel.Loaded += (_, _) => FadeInSplash();
        Web.Loaded += async (_, _) => await InitWebViewAsync();

        // 窗口外壳：无边框卡片形态（圆角 / 描边 / 去掉系统三按钮）。
        // 拖动 / 全屏 / 托盘全部由页面声明（data-drag → chrome-command），壳只提供 Win32 原语。
        _chrome = new WindowChrome(this, _appWindow!);
        _chrome.Apply();

        // 最大化状态回推给页面：body.is-fullscreen 由壳状态驱动，按钮和双击两条路都不漂移
        _chrome.MaximizedChanged += maximized => PushChromeState(maximized);

        // 窗口尺寸 / 呈现状态的变化由 WindowChrome 自己差分上报（见其构造函数），这里不用重复挂
    }

    private readonly WindowChrome _chrome;

    /// <summary>把窗口最大化状态回推给页面。页面没导航完时 post 是空操作，通道本身能容忍。</summary>
    private void PushChromeState(bool maximized)
    {
        try
        {
            Web.CoreWebView2?.PostWebMessageAsJson(
                System.Text.Json.JsonSerializer.Serialize(new { type = "chrome-state", maximized }));
        }
        catch { /* 页面没就绪，回推没有意义 */ }
    }

    private bool IsMaximized() =>
        _appWindow?.Presenter is OverlappedPresenter p && p.State == OverlappedPresenterState.Maximized;

    /* 关窗 = 缩到托盘常驻（退出走托盘右键菜单）；Toast 通知留待独立主题。 */
    private Microsoft.UI.Windowing.AppWindow? _appWindow;
    private bool _exitFromTray;
    private TrayHost? _tray;

    /* ---------- 启动遮罩 ---------- */

    private bool _splashDismissed;
    private DispatcherQueueTimer? _splashGuard;

    private void FadeInSplash()
    {
        var fade = new DoubleAnimation
        {
            To = 1,
            Duration = new Duration(TimeSpan.FromMilliseconds(280)),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        Storyboard.SetTarget(fade, SplashPanel);
        Storyboard.SetTargetProperty(fade, "Opacity");
        var sb = new Storyboard();
        sb.Children.Add(fade);
        sb.Begin();
    }

    private void SetSplashHint(string text) => SplashHint.Text = text;

    /// <summary>揭幕：遮罩整体淡出 260ms 再摘掉。
    /// 这 260ms 正好盖住「导航完成 → bootstrap 回来 → render()」那约 160ms，
    /// 所以看到的是页面自己长出来，而不是先空一下再突然出现。</summary>
    private void DismissSplash(string reason)
    {
        if (_splashDismissed) return;
        _splashDismissed = true;
        _splashGuard?.Stop();
        ShellLog.Log($"splash: dismiss reason={reason}");

        var fade = new DoubleAnimation
        {
            To = 0,
            Duration = new Duration(TimeSpan.FromMilliseconds(260)),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseIn },
        };
        Storyboard.SetTarget(fade, Splash);
        Storyboard.SetTargetProperty(fade, "Opacity");
        var sb = new Storyboard();
        sb.Children.Add(fade);
        sb.Completed += (_, _) => Splash.Visibility = Visibility.Collapsed;
        sb.Begin();
    }

    /// <summary>导航迟迟不回来时的兜底：如实报「加载超时」，不假装成功也不无限转圈。</summary>
    private void OnSplashTimeout()
    {
        if (_splashDismissed) return;
        ShellLog.Log("splash: 导航超时，未揭幕");
        SetSplashHint("界面加载超时，请从托盘退出后重试");
    }

    private void SetupTrayBehavior()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var appWindow = AppWindow.GetFromWindowId(Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd));
        _appWindow = appWindow;

        appWindow.Closing += (_, args) =>
        {
            if (_exitFromTray) return;          // 托盘菜单的「退出」放行
            args.Cancel = true;                 // 点 X 只隐藏，进程常驻
            appWindow.Hide();
            ShellLog.Log("closing → hidden to tray");
        };

        _tray = new TrayHost(this, m => ShellLog.Log(m));
        _tray.ExitRequested += () =>
        {
            ShellLog.Log("exit requested from tray menu");
            _exitFromTray = true;
            _tray?.Dispose();
            Close();
            Application.Current.Exit();
        };
    }

    private async Task InitWebViewAsync()
    {
        // 二期块7：Python 后端已下线 —— 全部路由由壳内 LocalApi 就地作答（见 CoveredRoutes
        // 与自测 routes 阶段的双向对照），不再探测/拉起 8765，壳可独立运行。
        try
        {
            var env = await _envTask;          // 已在构造里先开始，这里通常已就绪
            await Web.EnsureCoreWebView2Async(env);
            _webEnv = env;                     // 图标拦截建响应用
            ShellLog.Log("webview: ready");
            SetSplashHint("正在载入界面…");

            Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost, WebRoot, CoreWebView2HostResourceAccessKind.Allow);

            void Log(string msg) => ShellLog.Log(msg);

            Web.CoreWebView2.NavigationStarting += (_, e) => Log("nav-start " + e.Uri);
            Web.CoreWebView2.NavigationCompleted += (_, e) =>
            {
                Log($"nav-done ok={e.IsSuccess} err={e.WebErrorStatus}");
                // 失败也揭幕：WebView2 自己会显示错误页，把真实状态交给用户，不要盖着一层假进度
                DismissSplash(e.IsSuccess ? "nav-done" : "nav-failed:" + e.WebErrorStatus);
                // 页面布局就绪后才量得到真实的顶栏尺寸 → 这时重算一次穿透区；
                // 顺带把当前最大化状态推过去（刷新 / F5 后按钮和 body 状态才不会是默认值）
                PushChromeState(IsMaximized());
                PushChromeState(IsMaximized());
            };
            Web.CoreWebView2.DocumentTitleChanged += (_, _) => Log("title: " + Web.CoreWebView2.DocumentTitle);

            // 二期块2：应用图标走 <img src>，不经 WebMessage 桥 —— 在虚拟主机网络栈上拦截并本地出图。
            // 没有这段，壳里 /api/applications/scan/{id}/icon 会落进文件夹映射 404。
            Web.CoreWebView2.AddWebResourceRequestedFilter(
                "https://" + VirtualHost + "/api/applications/scan/*/icon",
                CoreWebView2WebResourceContext.All);
            Web.CoreWebView2.WebResourceRequested += OnIconResourceRequested;

            // 超时兜底：导航卡住时把遮罩换成一句实话，而不是永远转圈
            var queue = DispatcherQueue
                ?? Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
            _splashGuard = queue.CreateTimer();
            _splashGuard.Interval = SplashTimeout;
            _splashGuard.IsRepeating = false;
            _splashGuard.Tick += (_, _) => OnSplashTimeout();
            _splashGuard.Start();

            Log("=== shell start ===");
            Web.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            Web.CoreWebView2.Navigate($"https://{VirtualHost}/index.html");
        }
        catch (Exception ex)
        {
            // WebView2 运行时装不上 / 环境创建失败：把真实原因写在遮罩上，不假装页面在加载
            ShellLog.Log("webview: 初始化失败 " + ex.Message);
            SetSplashHint("界面初始化失败：" + ex.Message);
        }
    }

    /// <summary>WebView2 用户数据目录：非打包应用必须显式指定，否则 WebView2 会尝试写可执行文件目录。</summary>
    private static async Task<CoreWebView2Environment> CreateWebViewEnvironmentAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ApexShell", "WebView2");
        return await CoreWebView2Environment.CreateWithOptionsAsync(
            null, userDataFolder, new CoreWebView2EnvironmentOptions());
    }

    /* ---------- 应用图标拦截（二期块2） ----------
       Python 版每次现扫全系统 + 现抽图标；C# 侧共享 LocalApi 里带 60s 缓存的扫描，
       抽图在后台线程做（GetDeferral 放行异步），响应对象回 UI 线程创建。 */

    private Microsoft.Web.WebView2.Core.CoreWebView2Environment? _webEnv;

    private async void OnIconResourceRequested(
        Microsoft.Web.WebView2.Core.CoreWebView2 sender,
        Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e)
    {
        var scanId = (string?)null;
        try
        {
            var path = new Uri(e.Request.Uri).AbsolutePath;
            var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            // /api/applications/scan/{id}/icon → [api, applications, scan, {id}, icon]
            if (segments.Length == 5 && segments[2] == "scan" && segments[4] == "icon")
                scanId = segments[3];
        }
        catch { return; }
        if (scanId is null || _webEnv is null) return;

        var deferral = e.GetDeferral();
        try
        {
            // 图标勾在首屏，理论上 LocalApi 早已就绪；这里仍等一次，避免抢在初始化完成前读库
            var api = await _localApiTask;
            var (bytes, contentType, cacheControl) = await Task.Run(() => BuildIconBody(api, scanId));
            var headers = $"Content-Type: {contentType}\r\nCache-Control: {cacheControl}";
            // CreateWebResourceResponse 要 IRandomAccessStream；404 也给一个空流，别传 null
            using var body = new MemoryStream(bytes ?? Array.Empty<byte>());
            e.Response = _webEnv.CreateWebResourceResponse(
                body.AsRandomAccessStream(),
                bytes is null ? 404 : 200,
                bytes is null ? "Not Found" : "OK",
                headers);
            ShellLog.Log($"local-icon {scanId} -> {(bytes is null ? 404 : 200)}");
        }
        catch (Exception ex)
        {
            ShellLog.Log($"local-icon {scanId} 失败：{ex.Message}");
        }
        finally
        {
            deferral.Complete();
        }
    }

    /// <summary>返回 (PNG 字节, image/png, 缓存头)；候选失效返回 (null, application/json, no-store)。</summary>
    private static (byte[]? Bytes, string ContentType, string CacheControl) BuildIconBody(
        LocalApi api, string scanId)
    {
        var candidate = api.FindScanCandidate(scanId);
        if (candidate is null)
            return (null, "application/json", "no-store");
        var source = candidate.IconSource.Length > 0 ? candidate.IconSource : candidate.LaunchPath;
        var png = ApplicationScanner.ExtractIconPng(source);
        if (png is not null)
            return (png, "image/png", "private, max-age=300");
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"8\" fill=\"#E8402A\"/>" +
                  "<path d=\"M10 10h12v12H10z\" fill=\"none\" stroke=\"white\" stroke-width=\"2\"/></svg>";
        return (System.Text.Encoding.UTF8.GetBytes(svg), "image/svg+xml", "private, max-age=60");
    }

    /// <summary>默认尺寸 + 居中到显示器工作区（不含任务栏）。
    /// 与 AppWindow.Resize 同一时机（窗口已建、尚未 Activate），所以首帧就是对的尺寸和位置。
    /// 工作区放不下时按工作区收窄——否则 1440×900 砸到小屏上会算出负坐标，
    /// 标题栏跑到屏幕外就再也拖不回来了。摆放失败只降级成「尺寸对、位置没居」，不影响开窗。</summary>
    private void ApplyDefaultPlacement(int width, int height)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        if (AppWindow.GetFromWindowId(windowId) is not { } appWindow) return;
        _appWindow = appWindow;

        var w = width;
        var h = height;
        try
        {
            // 多显示器取「窗口当前所在那块」，取不到退回主显示器
            var work = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Primary).WorkArea;
            w = Math.Min(width, work.Width);
            h = Math.Min(height, work.Height);
            appWindow.Resize(new Windows.Graphics.SizeInt32(w, h));
            appWindow.Move(new Windows.Graphics.PointInt32(
                work.X + (work.Width - w) / 2,
                work.Y + (work.Height - h) / 2));
            ShellLog.Log($"window: {w}x{h} centered at {appWindow.Position.X},{appWindow.Position.Y}");
            return;
        }
        catch (Exception ex)
        {
            ShellLog.Log("window: 居中失败，退回只设尺寸 " + ex.Message);
        }
        appWindow.Resize(new Windows.Graphics.SizeInt32(w, h));
    }

    /* ---------- WebMessage → 本机后端 代理（一期桥） ----------
       协议：JS 发 {type:"api-call", id, path, method, body}；
             壳回 {type:"api-reply", id, ok, status, text} / {…, ok:false, error}。
       后端已全部搬到壳内 LocalApi；下面只剩「万一漏移植」的 Python 应急兜底。 */

    private const string BackendBase = "http://127.0.0.1:8765/api";
    private static readonly System.Net.Http.HttpClient Http = new();

    /// <summary>二期本地路由分发器：已移植块在壳内直接作答，其余走上面的 Python 代理。
    /// 在线程池上构造（见构造函数的启动加速 ①），每个使用点先 await 它。</summary>
    private readonly Task<LocalApi> _localApiTask;

    /// <summary>WebView2 环境创建任务（构造期即启动，见启动加速 ②）。</summary>
    private readonly Task<CoreWebView2Environment> _envTask;

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        long id = -1;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("type", out var t))
            {
                var type = t.GetString();
                if (type == "shell-toast")
                {
                    // JS 侧运行终态的系统通知：fire-and-forget，不回帖
                    var title = root.TryGetProperty("title", out var tt) ? tt.GetString() : null;
                    var message = root.TryGetProperty("message", out var mm2) ? mm2.GetString() : null;
                    _tray?.ShowToast(title ?? "APEX 总控台", message ?? "");
                    return;
                }
                if (type == "chrome-command")
                {
                    // 顶栏的窗口控制按钮：缩小到托盘 / 全屏。
                    // 走 WebMessage 不走 API 路由 —— 自测会把路由清单和 backend/app/main.py 双向比对，
                    // 多一条就得连 Python 后端一起改，没必要。
                    var command = root.TryGetProperty("command", out var cmd) ? cmd.GetString() : null;
                    if (command == "hide")
                    {
                        _appWindow?.Hide();
                        ShellLog.Log("chrome: 缩小到托盘（顶栏按钮）");
                    }
                    else if (command == "drag")
                    {
                        _chrome.BeginDrag();
                    }
                    else if (command == "toggle-maximize")
                    {
                        _chrome.ToggleMaximize();
                    }
                    else
                    {
                        ShellLog.Log("chrome: 未知的 chrome-command " + command);
                    }
                    return;
                }
                if (type != "api-call") return;
            }
            id = root.GetProperty("id").GetInt64();
            var path = root.GetProperty("path").GetString() ?? "/";
            var method = root.TryGetProperty("method", out var m) && m.GetString() is { Length: > 0 } mm ? mm : "GET";
            var body = root.TryGetProperty("body", out var b) && b.ValueKind == System.Text.Json.JsonValueKind.String
                ? b.GetString() : null;

            // 二期块7：所有路由都已移植（LocalApi.CoveredRoutes，自测 routes 阶段双向对照）。
            // 下面的 Python 代理只剩「万一漏移植」的应急兜底，正常永远不会走到。
            var api = await _localApiTask;
            var local = await api.HandleAsync(method, path, body);
            if (local != null)
            {
                ShellLog.Log($"local-api {method} {path} -> {local.Status}");
                sender.PostWebMessageAsJson(System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "api-reply", id, ok = true, status = local.Status, text = local.Text
                }));
                return;
            }

            ShellLog.Log($"未移植路由（漏移植？）{method} {path}，尝试应急代理 8765");
            using var req = new System.Net.Http.HttpRequestMessage(new HttpMethod(method), BackendBase + path);
            if (body != null)
                req.Content = new System.Net.Http.StringContent(body, System.Text.Encoding.UTF8, "application/json");
            var resp = await Http.SendAsync(req);
            var text = await resp.Content.ReadAsStringAsync();

            var reply = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "api-reply", id, ok = true,
                status = (int)resp.StatusCode, text
            });
            sender.PostWebMessageAsJson(reply);
        }
        catch (Exception ex)
        {
            // 失败也必须回帖，否则 JS 侧的 Promise 会永远挂着
            var reply = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "api-reply", id, ok = false, status = 0,
                error = "壳代理失败：" + ex.Message
            });
            sender.PostWebMessageAsJson(reply);
        }
    }
}
