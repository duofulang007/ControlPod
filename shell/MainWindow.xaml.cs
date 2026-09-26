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

        ApplyStoredShellTheme();   // 深色用户启动不白闪：壳底色先对齐上次页面主题
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

        // 顶部 8px 保留区的 DWM 段（caption 残留底色）：启动恢复时 _chrome 还没建，
        // 在这里按已恢复的基调补上，深色用户开窗首帧就不露白。
        var tone = _shellTone == ShellTone.Dark ? ToneDarkColor : ToneLightColor;
        _chrome.SetCaptionColor(tone.R, tone.G, tone.B);

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

    /* ---------- 壳底色跟随页面主题 ---------- */

    /// <summary>壳底色的两种基调：对应页面 body 渐变在顶边的合成色。</summary>
    private enum ShellTone { Light, Dark }

    /// <summary>浅色主题页面顶部合成色（探针实测 F3F3F3 白带旁的页面色，取近似顶值）。</summary>
    private static readonly Windows.UI.Color ToneLightColor = new() { A = 255, R = 0xF9, G = 0xF3, B = 0xF0 };

    /// <summary>深色主题页面顶部合成色（探针实测 rgb(32,30,37)）。</summary>
    private static readonly Windows.UI.Color ToneDarkColor = new() { A = 255, R = 0x20, G = 0x1E, B = 0x25 };

    /// <summary>壳主题记忆文件：页面 applyTheme 推送时写入，壳下次启动读回。</summary>
    private static string ThemeStorePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ApexShell", "last-theme.txt");

    /// <summary>启动恢复：读记忆文件把壳底色对齐上次主题；读不到按浅色起。</summary>
    private void ApplyStoredShellTheme()
    {
        var v = "light";
        try
        {
            if (File.Exists(ThemeStorePath))
                v = File.ReadAllText(ThemeStorePath).Trim();
        }
        catch { /* 读不到按浅色起，不影响启动 */ }
        SetShellTheme(v == "dark" ? ShellTone.Dark : ShellTone.Light, persist: false);
    }

    /// <summary>当前壳基调：ApplyStoredShellTheme 在 _chrome 就绪前跑，先记下，构造尾部补设 caption 色。</summary>
    private ShellTone _shellTone = ShellTone.Light;

    /// <summary>RootGrid / Splash 底色 = 页面顶部合成色；persist=true 时写入记忆文件。
    ///
    /// 背景：无边框壳在窗口顶部有 8 物理像素系统保留区（WinAppSDK 对
    /// SetBorderAndTitleBar(false,false) 窗口的既定行为；WM_NCCALCSIZE 覆写与
    /// TitleBar.PreferredHeightOption=Collapsed 两路实验均已证伪改不动）。
    /// 它分两层：客户区内的 XAML 底（RootGrid 兜底）+ 客户区外由 DWM 画的
    /// 标题栏残留底色（F3F3F3），后者走 WindowChrome.SetCaptionColor 一并跟主题。</summary>
    private void SetShellTheme(ShellTone tone, bool persist)
    {
        _shellTone = tone;
        var dark = tone == ShellTone.Dark;
        var c = dark ? ToneDarkColor : ToneLightColor;
        var brush = new Microsoft.UI.Xaml.Media.SolidColorBrush(c);
        RootGrid.Background = brush;
        Splash.Background = brush;
        _chrome?.SetCaptionColor(c.R, c.G, c.B);   // 构造早期 _chrome 未建，跳过；构造尾部补设
        if (persist)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ThemeStorePath)!);
                File.WriteAllText(ThemeStorePath, dark ? "dark" : "light");
            }
            catch { /* 记不住只影响下次启动首帧，不影响运行 */ }
        }
        ShellLog.Log($"shell: 壳底色={tone}{(persist ? "（已记忆）" : "（启动恢复）")}");
    }

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
            using var body = new MemoryStream(bytes);
            // 恒 200：BuildIconBody 保证有降级产物，破图占位比 404 更没用。
            // 只有它内部意外抛错（catch 分支）才落到空响应，那种情况才回 500。
            e.Response = _webEnv.CreateWebResourceResponse(
                body.AsRandomAccessStream(), 200, "OK", headers);
            ShellLog.Log($"local-icon {scanId} -> 200 {contentType} {bytes.Length}B");
        }
        catch (Exception ex)
        {
            ShellLog.Log($"local-icon {scanId} 失败：{ex.Message}");
            try
            {
                var fallback = LetterIconSvg("");
                e.Response = _webEnv.CreateWebResourceResponse(
                    new MemoryStream(fallback).AsRandomAccessStream(), 200, "OK",
                    "Content-Type: image/svg+xml\r\nCache-Control: no-store");
            }
            catch { /* 连降级响应都建不出来：留空，WebView2 自己处理 */ }
        }
        finally
        {
            deferral.Complete();
        }
    }

    /// <summary>返回 (字节, Content-Type, 缓存头)。
    /// **永远返回 200 + 一张能看的图**：这条路由是 &lt;img src&gt; 的图源，一旦回 404 / 空图，
    /// 浏览器只会画出破图占位（图标「无法识别」），用户拿不到任何可判断的信息。
    /// 三级降级：真图标 → 首字母色块 → 通用方框，逐级都留下 content-type 可辨的产物。
    /// 注意：候选失效（扫描结果里找不到这个 scan_id）不算「没图」，走首字母块即可 —— 图标坏了
    /// 不该顺带把应用行渲染成破图。</summary>
    private static (byte[] Bytes, string ContentType, string CacheControl) BuildIconBody(
        LocalApi api, string scanId)
    {
        var candidate = api.FindScanCandidate(scanId);
        // 首选图源：icon_source（UWP 走 shell 路径）→ launch_path（.lnk / .exe）
        var source = candidate is null
            ? ""
            : (candidate.IconSource.Length > 0 ? candidate.IconSource : candidate.LaunchPath);
        if (source.Length > 0)
        {
            foreach (var png in IconSourceFallbacks(source))
            {
                var bytes = ApplicationScanner.ExtractIconPng(png);
                // 抽图失败时 Python 侧曾回退到 shell:AppsFolder，保留同样的第二跳（对 UWP 尤其有用：
                // shell:AppsFolder\AUMID 与 AUMID 原串在 SHGetFileInfoW 上行为不同）
                if (bytes is not null)
                    return (bytes, "image/png", "private, max-age=300");
            }
        }
        // 二级降级：首字母色块（按名称散出一色，至少让不同应用看得出来是不同应用）
        return (LetterIconSvg(candidate?.Name ?? ""), "image/svg+xml", "private, max-age=60");
    }

    /// <summary>图标图源候选：原串 + 对 UWP 追加 shell:AppsFolder 前缀形式。</summary>
    private static IEnumerable<string> IconSourceFallbacks(string source)
    {
        yield return source;
        // 形如 OpenAI.Codex_2p2nqsd0c76g0!App 的 AUMID：补 shell:AppsFolder\ 再试一次
        if (!source.StartsWith("shell:", StringComparison.OrdinalIgnoreCase)
            && !source.StartsWith(@"\\", StringComparison.Ordinal)
            && !Path.IsPathRooted(source))
            yield return @"shell:AppsFolder\" + source;
    }

    /// <summary>首字母色块 SVG：抽图失败时的兜底，保证 &lt;img&gt; 永远有内容。</summary>
    private static byte[] LetterIconSvg(string name)
    {
        var letter = string.IsNullOrWhiteSpace(name) ? "?" : name.Trim()[..1].ToUpperInvariant();
        // 简单的名称散列取色，同一应用每次同色
        var hue = 0;
        foreach (var ch in name) hue = (hue * 31 + ch) % 360;
        var bg = $"hsl({hue},52%,58%)";
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\">" +
                  $"<rect width=\"32\" height=\"32\" rx=\"8\" fill=\"{bg}\"/>" +
                  "<text x=\"16\" y=\"21\" text-anchor=\"middle\" font-family=\"Segoe UI,Microsoft YaHei,sans-serif\" " +
                  $"font-size=\"16\" font-weight=\"600\" fill=\"#FFFFFF\">{System.Security.SecurityElement.Escape(letter)}</text></svg>";
        return System.Text.Encoding.UTF8.GetBytes(svg);
    }

    /// <summary>自测入口：验证降级产物形态（不依赖 LocalApi / 不建窗口）。</summary>
    internal static (byte[] Bytes, string ContentType, string CacheControl) BuildIconFallbackForTest(
        string scanId, string name) => (LetterIconSvg(name), "image/svg+xml", "private, max-age=60");

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
                    else if (command == "theme")
                    {
                        // 页面 applyTheme 唯一收口推送：壳底色跟随，深色下顶部保留区不露白带
                        var value = root.TryGetProperty("value", out var vv) ? vv.GetString() : null;
                        SetShellTheme(value == "dark" ? ShellTone.Dark : ShellTone.Light, persist: true);
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
