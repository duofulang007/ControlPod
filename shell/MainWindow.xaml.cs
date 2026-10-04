using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.Web.WebView2.Core;

namespace ApexShell;

/// <summary>
/// 一期壳：窗口 + WebView2，用虚拟主机映射加载 ControlPod 的 Web 三件套，
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

    /// <summary>Web 三件套所在目录（ControlPod 仓库根）。</summary>

    /// <summary>遮罩兜底时限：导航迟迟不完成时不能把用户永远按在遮罩上。</summary>
    private static readonly TimeSpan SplashTimeout = TimeSpan.FromSeconds(20);

    /// <summary>总控台的默认尺寸（首次启动、还没有历史状态时用）。</summary>
    private const int DefaultWidth = 1440;
    private const int DefaultHeight = 900;

    /// <summary>看板窗口专用：把页面自带的浏览器滚动条藏掉（只藏视觉，不停用滚动）。
    ///
    /// 多弗朗 2026-09-28：「这个滑动条删掉。不要显示」。触发条件是**窗口小于约 1367×627** ——
    /// 那时看板内容纵向溢出，Chromium 就在窗口右缘画一条 15px 的条；而 run-analytics 的
    /// styles.css 没有声明 <c>color-scheme</c>，深色系统下这条会被画成**深色**
    /// （轨道 rgb(44,44,44) / 滑块 rgb(159,159,159)），压在 <c>--bg:#eaf0f2</c> 的浅色页上格外突兀。
    ///
    /// 为什么在壳侧注入、而不是去看板里加 CSS：壳对看板的承诺是「不动看板内部代码」，
    /// 而这层皮肤本来就属于壳的职责 —— 换个 url 也照样成立。
    /// ★ 只藏视觉：滚轮 / 键盘 / 拖动照旧能滚，页内那些 <c>overflow-y:auto</c> 的面板
    ///   （.history-list / .fitness-run-list 等）也一并不再画条，行为不变。
    /// ★ <c>body *</c> 那两条是必要的：只写 html/body 的话，内层面板的条会照旧露出来。
    /// ★ <c>::-webkit-scrollbar</c> 一旦被声明，Chromium 就会从 Fluent 滚动条切回可自定义那条，
    ///   所以 <c>display:none</c> 在两种实现下都生效；<c>scrollbar-width</c> 是标准属性，双保险。</summary>
    private const string NoScrollbarScript =
        "(function(){" +
        "var css=" +
        "'html,body{scrollbar-width:none!important;-ms-overflow-style:none!important}'" +
        "+'html::-webkit-scrollbar,body::-webkit-scrollbar" +
        "{width:0!important;height:0!important;display:none!important}'" +
        "+'body *{scrollbar-width:none!important;-ms-overflow-style:none!important}'" +
        "+'body *::-webkit-scrollbar" +
        "{width:0!important;height:0!important;display:none!important}';" +
        "function apply(){" +
        "var s=document.createElement('style');" +
        "s.setAttribute('data-apex','no-scrollbar');" +
        "s.textContent=css;" +
        "(document.head||document.documentElement).appendChild(s);" +
        "}" +
        "if(document.head){apply();}" +
        "else{document.addEventListener('DOMContentLoaded',apply,{once:true});}" +
        "})();";

    /// <summary>
    /// 外部目标地址（--url 传入）。为 null 时是总控台模式：走虚拟主机映射加载本地 Web 三件套。
    /// 非 null 时是「壳当看板窗口用」：直接导航到这个 http 地址，不做虚拟主机映射，
    /// 也不注入总控台的启动遮罩文案（那是总控台专属）。
    /// </summary>
    private readonly string? _externalUrl;

    /// <summary>窗口角色：决定托盘提示文案、窗口状态文件名（各自单实例、布局互不干扰）。</summary>
    private readonly WindowStateStore.Role _role;

    /// <summary>本窗口的布局持久化（位置 / 尺寸 / 最大化态）。</summary>
    private readonly WindowStateStore _stateStore;

    /// <summary>总控台模式构造（1440×900 居中，标题「ControlPod」）。</summary>
    public MainWindow() : this(null) { }

    /// <summary>
    /// 通用构造。externalUrl 非 null 时本窗口是个「看板窗口」：
    /// 有独立的单实例锁与独立的窗口状态文件，与总控台窗口可以同时存在、互不干扰。
    /// </summary>
    public MainWindow(string? externalUrl)
    {
        InitializeComponent();
        _externalUrl = string.IsNullOrWhiteSpace(externalUrl) ? null : externalUrl.Trim();
        _role = _externalUrl is null ? WindowStateStore.Role.Console : WindowStateStore.Role.Dashboard;
        _stateStore = new WindowStateStore(_role, ShellLog.Log);

        Title = _externalUrl is null ? "ControlPod" : "CPod 看板";

        ApplyStoredShellTheme();   // 深色用户启动不白闪：壳底色先对齐上次页面主题
        ApplyStoredOrDefaultPlacement();

        // 看板窗口（--url）：底色跟看板自己的 --bg，不跟总控台主题 —— 否则用户在总控台
        // 切了深色，看板窗口顶部那条 8px 系统保留区会露一条深色带。看板只有浅色主题，
        // 所以这里固定浅色。必须在 ApplyStoredShellTheme 之后调，否则会被它覆盖。
        if (_externalUrl is not null)
        {
            ApplyDashboardTone();
            EnableDashboardChrome();
        }

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
        // 用 _shellBaseColor（而不是再按 _shellTone 推一次）—— 看板窗口的底色不在
        // Light/Dark 两档里（它跟的是看板 --bg），再推一次必然推错。
        var tone = _shellBaseColor;
        _chrome.SetCaptionColor(tone.R, tone.G, tone.B);

        // 最大化状态回推给页面：body.is-fullscreen 由壳状态驱动，按钮和双击两条路都不漂移
        _chrome.MaximizedChanged += maximized =>
        {
            PushChromeState(maximized);
            SyncDashFullscreenIcon();   // 看板窗口条的全屏按钮图标（总控台模式下是空操作）
        };

        /* 构造时补一次图标：窗口可能在 _chrome 建出来**之前**就已经是最大化态 ——
           ApplyStoredOrDefaultPlacement 里的 TryMaximize 跑在上面第 67 行，那时
           MaximizedChanged 的差分还没挂上，图标会一直停在「全屏」骗人。 */
        SyncDashFullscreenIcon();

        // 布局持久化：窗口几何变化 → 防抖后写盘（拖动时不能每个像素都写一次）
        _chrome.PlacementChanged += SchedulePlacementSave;
        SetupPlacementPersistence();

        // 窗口尺寸 / 呈现状态的变化由 WindowChrome 自己差分上报（见其构造函数），这里不用重复挂
    }

    /* ---------- 窗口布局持久化 ----------
       拖动窗口时 AppWindow.Changed 会以鼠标频率连续触发，直接写盘就是几百次 IO。
       这里做 700ms 防抖：手停下来才落一次盘；关闭窗口时再强制冲一次，保证最后一次拖动不丢。 */

    private DispatcherQueueTimer? _placementTimer;
    private bool _placementDirty;

    private void SetupPlacementPersistence()
    {
        var queue = DispatcherQueue
            ?? Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
        _placementTimer = queue.CreateTimer();
        _placementTimer.Interval = TimeSpan.FromMilliseconds(700);
        _placementTimer.IsRepeating = false;
        _placementTimer.Tick += (_, _) => FlushPlacement();

        // 关窗时冲掉待写状态（缩到托盘不关窗，所以这里只在真正退出时跑）
        Closed += (_, _) => FlushPlacement();
    }

    private void SchedulePlacementSave()
    {
        _placementDirty = true;
        _placementTimer?.Stop();
        _placementTimer?.Start();
    }

    /// <summary>把当前窗口几何落盘。最大化 / 全屏态下只记「最大化」标志，不记被撑满的尺寸 ——
    /// 否则下次开窗会直接铺满屏幕，丢掉用户原本的窗口化大小。</summary>
    private void FlushPlacement()
    {
        if (!_placementDirty) return;
        if (_appWindow is null) return;
        _placementDirty = false;

        try
        {
            var maximized = _chrome?.IsFullscreenOrMaximized ?? false;
            if (maximized)
            {
                // 只更新最大化标志，保留上一次窗口化时的位置尺寸
                var prev = _stateStore.Load() ?? new WindowStateStore.WindowState();
                prev.Maximized = true;
                _stateStore.Save(prev);
                return;
            }

            /* GetWindowRect 含不可见调整边框（每边约 8px），直接存会让窗口每次重开都长一圈。
               用 DWMWA_EXTENDED_FRAME_BOUNDS 取「肉眼看到的」矩形 —— 这也是 AGENTS.md
               §10 记过的坑（最大化判定时必须用它）。 */
            if (!TryGetVisibleBounds(out var rect)) return;

            _stateStore.Save(new WindowStateStore.WindowState
            {
                X = rect.X,
                Y = rect.Y,
                Width = rect.Width,
                Height = rect.Height,
                Maximized = false,
            });
        }
        catch (Exception ex)
        {
            ShellLog.Log("window-state: 落盘失败（不影响使用）" + ex.Message);
        }
    }

    private bool TryGetVisibleBounds(out Windows.Graphics.RectInt32 rect)
    {
        rect = default;
        try
        {
            var bounds = new NativeRect();
            var hr = DwmGetWindowAttribute(
                WinRT.Interop.WindowNative.GetWindowHandle(this),
                DwmwaExtendedFrameBounds, out bounds, System.Runtime.InteropServices.Marshal.SizeOf<NativeRect>());
            if (hr != 0) return false;
            rect = new Windows.Graphics.RectInt32(
                bounds.Left, bounds.Top, bounds.Right - bounds.Left, bounds.Bottom - bounds.Top);
            return rect.Width > 0 && rect.Height > 0;
        }
        catch { return false; }
    }

    private const int DwmwaExtendedFrameBounds = 9;

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }

    /// <summary>Win32 POINT（ClientToScreen 用）。</summary>
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct NativePoint2 { public int X, Y; }

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hwnd, int attr, out NativeRect value, int size);

    /* ---------- 显示器工作区查询（纯 Win32，见 PlacementIsReachable 的说明） ---------- */

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    private struct MonitorInfo
    {
        public int cbSize;
        public NativeRect rcMonitor;
        public NativeRect rcWork;
        public uint dwFlags;
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern IntPtr MonitorFromRect(ref NativeRect lprc, uint dwFlags);

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MonitorInfo lpmi);

    /// <summary>客户区坐标 → 屏幕坐标。用来把 XAML 里量到的窗口条位置换成可点/可拖的屏幕像素，
    /// 便于自动化验证（拖动层和关闭按钮真的落在那个位置吗）。</summary>
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd, ref NativePoint2 point);

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

    /// <summary>当前壳**实际**用的底色。总控台走 Light/Dark 两档，看板窗口走它自己的 --bg，
    /// 所以 caption 色一律以这个字段为准，别拿 _shellTone 再推一次（推不出看板那一档）。</summary>
    private Windows.UI.Color _shellBaseColor = ToneLightColor;

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
        _shellBaseColor = c;
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

    /* ---------- 看板窗口条（仅 --url 模式） ----------
       多弗朗 2026-09-28：看板改成无边框壳窗口之后拖不动、也关不掉 ——
       run-analytics 不是为壳写的，页面里没有任何 [data-drag] 声明，总控台那套
       「页面声明拖动区 → chrome-command: drag」的机制在看板里根本不存在。
       所以壳自己给一条 32px 的窗口条：整条可拖 + 右上关闭。 */

    /// <summary>看板窗口的壳底色 = 跑步看板的 --bg（styles.css 的 <c>--bg:#eaf0f2</c>）。
    /// 看板只有浅色主题，所以这个色**不跟 last-theme.txt 走**：否则用户在总控台切了深色，
    /// 看板窗口顶部那条 8px 系统保留区会露一条深色带，跟页面顶边接不上。</summary>
    private static readonly Windows.UI.Color ToneDashboardColor =
        new() { A = 255, R = 0xEA, G = 0xF0, B = 0xF2 };

    /// <summary>把壳底色切到看板那一档。不写记忆文件 —— last-theme.txt 是总控台的偏好，
    /// 看板窗口不该去改它（否则开一次看板就把总控台的深色设置冲成浅色）。</summary>
    private void ApplyDashboardTone()
    {
        _shellTone = ShellTone.Light;             // 看板无深色；caption 也走浅色
        _shellBaseColor = ToneDashboardColor;
        var brush = new Microsoft.UI.Xaml.Media.SolidColorBrush(ToneDashboardColor);
        RootGrid.Background = brush;
        Splash.Background = brush;
        _chrome?.SetCaptionColor(ToneDashboardColor.R, ToneDashboardColor.G, ToneDashboardColor.B);
        ShellLog.Log("shell: 看板窗口底色=EAF0F2（跟随看板 --bg，不写记忆文件）");
    }

    /// <summary>亮出看板窗口条。只有 url 参数模式需要：总控台的页面自己声明了
    /// <c>[data-drag]</c>（顶栏 + 侧栏品牌区），壳再给一条会多出一块空白。</summary>
    private void EnableDashboardChrome()
    {
        DashChrome.Visibility = Visibility.Visible;
        // 布局完成后再量：ActualWidth/ActualHeight 在 Loaded 之前是 0。
        DashChrome.Loaded += (_, _) => LogDashboardChromeGeometry();
        ShellLog.Log("chrome: 看板窗口条已启用（32px 整条可拖 + 右上全屏/关闭）");
    }

    /// <summary>把窗口条 / 全屏按钮 / 关闭按钮的**屏幕**矩形记进日志。
    ///
    /// 为什么值得专门记一笔：壳是 WebView2 窗口，GDI 截图（BitBlt / PrintWindow）抓不到内容，
    /// 所以「这条到底落在哪、拖动层盖没盖住按钮」没法靠看图确认。这里有坐标 + 模拟鼠标点击
    /// 就能把拖动 / 全屏 / 关闭都验掉（鼠标事件走的是系统输入队列，不是伪造的 XAML 事件）。</summary>
    private void LogDashboardChromeGeometry()
    {
        try
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            var origin = new NativePoint2 { X = 0, Y = 0 };
            _ = ClientToScreen(hwnd, ref origin);

            var strip = DashChrome.TransformToVisual(RootGrid)
                .TransformPoint(new Windows.Foundation.Point(0, 0));
            var full = DashFull.TransformToVisual(RootGrid)
                .TransformPoint(new Windows.Foundation.Point(0, 0));
            var close = DashClose.TransformToVisual(RootGrid)
                .TransformPoint(new Windows.Foundation.Point(0, 0));

            ShellLog.Log(
                $"chrome: 看板窗口条 屏幕 x={origin.X + strip.X:F0} y={origin.Y + strip.Y:F0} " +
                $"w={DashChrome.ActualWidth:F0} h={DashChrome.ActualHeight:F0}；" +
                $"拖动层 w={DashDragZone.ActualWidth:F0} h={DashDragZone.ActualHeight:F0}；" +
                $"全屏按钮 屏幕 x={origin.X + full.X:F0} y={origin.Y + full.Y:F0} " +
                $"w={DashFull.ActualWidth:F0} h={DashFull.ActualHeight:F0}；" +
                $"关闭按钮 屏幕 x={origin.X + close.X:F0} y={origin.Y + close.Y:F0} " +
                $"w={DashClose.ActualWidth:F0} h={DashClose.ActualHeight:F0}");
        }
        catch (Exception ex)
        {
            ShellLog.Log("chrome: 量看板窗口条失败 " + ex.Message);
        }
    }

    /// <summary>按下窗口条 = 拖窗。复用总控台那条原生拖动实现（后台线程 + SetWindowPos），
    /// 观感与总控台完全一致 —— 多弗朗要的就是「参考原来总控台的拖动范围」。</summary>
    private void OnDashDragPressed(object sender, PointerRoutedEventArgs e)
    {
        _chrome.BeginDrag();
    }

    /// <summary>双击窗口条 = 最大化 / 还原，跟总控台拖拽区的双击行为对齐。</summary>
    private void OnDashDragDoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        _chrome.ToggleMaximize();
    }

    private static readonly Microsoft.UI.Xaml.Media.SolidColorBrush DashButtonIdleBrush =
        new(Colors.Transparent);

    /// <summary>窗口条按钮的悬停底色。用半透明黑而不是写死的浅灰 —— 换底色也不会失配。</summary>
    private static readonly Microsoft.UI.Xaml.Media.SolidColorBrush DashButtonHoverBrush =
        new(Windows.UI.Color.FromArgb(0x1A, 0, 0, 0));

    private void OnDashClosePointerEntered(object sender, PointerRoutedEventArgs e) =>
        DashClose.Background = DashButtonHoverBrush;

    private void OnDashClosePointerExited(object sender, PointerRoutedEventArgs e) =>
        DashClose.Background = DashButtonIdleBrush;

    private void OnDashFullPointerEntered(object sender, PointerRoutedEventArgs e) =>
        DashFull.Background = DashButtonHoverBrush;

    private void OnDashFullPointerExited(object sender, PointerRoutedEventArgs e) =>
        DashFull.Background = DashButtonIdleBrush;

    /// <summary>窗口条全屏按钮。
    ///
    /// 走的就是双击拖动区那条路（WindowChrome.ToggleMaximize），不另写一套 —— 无边框窗口里
    /// 「全屏」是 <c>MoveAndResize</c> 到监视器整块矩形 + 临时置顶（WinAppSDK 1.6 的
    /// OverlappedPresenter 没有 SetFullscreen），自己再实现一遍必然跟双击、跟总控台顶栏那颗
    /// fsBtn 三份状态各说各话。</summary>
    private void OnDashFullTapped(object sender, TappedRoutedEventArgs e)
    {
        ShellLog.Log("chrome: 看板窗口全屏切换（窗口条按钮）");
        _chrome.ToggleMaximize();
    }

    /// <summary>全屏按钮的图标 / 提示语跟着窗口真实状态翻转。
    ///
    /// ★ 状态源是 <c>_chrome.IsFullscreenOrMaximized</c>，不是自己维护一个 bool：窗口还能通过
    ///   双击拖动区、拖到屏幕顶端贴边、以及启动时还原存档这三条壳外路径改变状态，自记一个
    ///   bool 必然漂移。
    /// E740 = 四角向外（点进全屏）；E73F = 四角向内（点回窗口）。与总控台顶栏 fsBtn 的
    ///   aria-pressed 是同一个语义，只是这里换字形表达。</summary>
    private void SyncDashFullscreenIcon()
    {
        var on = _chrome?.IsFullscreenOrMaximized ?? false;
        DashFullIcon.Glyph = on ? "\uE73F" : "\uE740";
        Microsoft.UI.Xaml.Controls.ToolTipService.SetToolTip(DashFull, on ? "退出全屏" : "全屏");
        // 记一笔：字形是 XAML 内部状态，外面截不到图也读不到值，只能靠这行日志自证翻转。
        ShellLog.Log($"chrome: 全屏按钮图标 -> {(on ? "E73F 退出全屏" : "E740 进入全屏")}");
    }

    /// <summary>关闭看板窗口 = **真的关掉这个窗口进程**，不是缩到托盘。
    ///
    /// 看板是「随用随开」的次级窗口：缩到托盘会在通知区多留一个图标（而且看板窗口的托盘
    /// 还会去抢注册 Ctrl+Alt+A，第二个必然注册失败），用户反而找不到它。
    /// 每个看板地址是独立进程（见 App.xaml.cs 的单实例锁），所以关它不影响总控台。</summary>
    private void OnDashCloseTapped(object sender, TappedRoutedEventArgs e)
    {
        ShellLog.Log("chrome: 看板窗口关闭（窗口条按钮）");
        _exitFromTray = true;      // 放行 AppWindow.Closing 里那道「只隐藏」的拦截
        _tray?.Dispose();          // 摘掉托盘图标，别在通知区留个残影
        Close();
        Application.Current.Exit();
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

            /* 外部 URL 模式（--url）：壳当「看板窗口」用，直接导航到 http 地址。
               这个分支刻意不加虚拟主机映射、不挂总控台专属的资源拦截 —— 看板是独立站点，
               它的资源由它自己的本地桥服务，壳只负责提供无边框窗口。 */
            if (_externalUrl is not null)
            {
                SetSplashHint("正在载入看板…");
                Web.CoreWebView2.NavigationStarting += (_, e) => Log("nav-start " + e.Uri);
                /* 藏掉看板页面自带的浏览器滚动条。必须在 Navigate **之前**注册 ——
                   AddScriptToExecuteOnDocumentCreatedAsync 只对「之后创建」的文档生效，
                   Navigate 之后再挂就晚了（首个文档已经建好）。 */
                await Web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(NoScrollbarScript);

                Web.CoreWebView2.NavigationCompleted += async (_, e) =>
                {
                    Log($"nav-done ok={e.IsSuccess} err={e.WebErrorStatus} uri={_externalUrl}");
                    // 失败也揭幕：让 WebView2 自己的错误页把真实状态交给用户
                    DismissSplash(e.IsSuccess ? "nav-done" : "nav-failed:" + e.WebErrorStatus);

                    /* 视口自证（2026-09-28）：页面有浏览器滚动条时，documentElement.clientWidth
                       会比 innerWidth 少一个条宽（本机实测 15px）；藏条生效后两者必须相等 ——
                       这是「滑动条删掉没有」最硬的口径（不依赖截图，WebView2 区域有时截不到）。
                       hid = 那支注入样式有没有落地。
                       顺手记内容高度：页面比窗口高多少，决定「只藏视觉、不停用滚动」够不够用。 */
                    try
                    {
                        var probe = await Web.CoreWebView2.ExecuteScriptAsync(
                            "JSON.stringify({inner:innerWidth,client:document.documentElement.clientWidth," +
                            "h:innerHeight,content:document.documentElement.scrollHeight," +
                            "bar:innerWidth-document.documentElement.clientWidth," +
                            "hid:document.querySelector('style[data-apex=no-scrollbar]')?1:0})");
                        Log("viewport " + probe);
                    }
                    catch (Exception ex) { Log("viewport 取值失败 " + ex.Message); }
                };
                Web.CoreWebView2.DocumentTitleChanged += (_, _) => Log("title: " + Web.CoreWebView2.DocumentTitle);

                var q = DispatcherQueue
                    ?? Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
                _splashGuard = q.CreateTimer();
                _splashGuard.Interval = SplashTimeout;
                _splashGuard.IsRepeating = false;
                _splashGuard.Tick += (_, _) => OnSplashTimeout();
                _splashGuard.Start();

                Log("=== shell start (external url) === " + _externalUrl);
                Web.CoreWebView2.Navigate(_externalUrl);
                return;
            }

            SetSplashHint("正在载入界面…");

            Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost, ConsoleConfig.WebRoot, CoreWebView2HostResourceAccessKind.Allow);

            void Log(string msg) => ShellLog.Log(msg);

            Web.CoreWebView2.NavigationStarting += (_, e) => Log("nav-start " + e.Uri);
            Web.CoreWebView2.NavigationCompleted += async (_, e) =>
            {
                Log($"nav-done ok={e.IsSuccess} err={e.WebErrorStatus}");
                // 启动耗时诊断（2026-09-27）：nav-start→nav-done 稳定 ~2.05s，而页面只有 448KB、
                // 零外链、本地虚拟主机映射。这 2s 到底花在「首字节之前」还是「页面执行」，
                // 打一行 ttfb/dcl/load 就能分开，不再靠猜。
                try
                {
                    var perf = await Web.CoreWebView2.ExecuteScriptAsync(
                        "(function(){var n=(performance.getEntriesByType('navigation')[0])||{};" +
                        "'ttfb='+Math.round(n.responseStart||0)+' dcl='+Math.round(n.domContentLoadedEventEnd||0)" +
                        "+' load='+Math.round(n.loadEventEnd||0);})()");
                    Log("perf: " + perf.Trim('"'));
                }
                catch (Exception ex) { Log("perf: 取不到 (" + ex.Message + ")"); }
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

            /* 每次启动先清掉 WebView2 的磁盘缓存（2026-10-04 踩实）。
             *
             * 壳用的是持久化 profile（%LOCALAPPDATA%\ApexShell\WebView2），apex.local 下的
             * index.html / app.js / styles.css 会被 Chromium 缓存。踩的这次是：app.js 连改两版，
             * 磁盘缓存里一版新的都没有 —— 页面一直跑改动前的旧脚本，表现是「新功能一点没生效、
             * 也不报任何错」，靠 grep 缓存里的版本标记才定位到。
             *
             * 本地静态资源重新读一遍的代价可以忽略（几百 KB），换来的是「改完 Web 文件重启即生效」，
             * 不必再依赖 index.html 里的 ?v= 串记得往上滚。只清 DiskCache —— cookie / localStorage
             * 一律不碰，界面偏好照旧。 */
            try
            {
                await Web.CoreWebView2.Profile.ClearBrowsingDataAsync(
                    Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.DiskCache);
                Log("webview: 已清磁盘缓存（本地静态资源每次重启重新读取）");
            }
            catch (Exception ex)
            {
                Log("webview: 清磁盘缓存失败（不影响使用）— " + ex.Message);
            }

            Web.CoreWebView2.Navigate($"https://{VirtualHost}/index.html");
        }
        catch (Exception ex)
        {
            // WebView2 运行时装不上 / 环境创建失败：把真实原因写在遮罩上，不假装页面在加载
            ShellLog.Log("webview: 初始化失败 " + ex.Message);
            SetSplashHint("界面初始化失败：" + ex.Message);
        }
    }

    /// <summary>WebView2 用户数据目录：非打包应用必须显式指定，否则 WebView2 会尝试写可执行文件目录。
    ///
    /// 启动加速 ③：关掉 Chromium 启动期的三项后台网络活动。Chromium 起浏览器进程时会并行做
    /// 组件更新（update.googleapis.com）、variations seed、域名可靠性上报等请求；本机这些域名
    /// 不可达（curl 实测 update.googleapis.com 8s 超时），这些请求拖到超时就把**首次导航**
    /// 硬生生顶成 ~2.0s —— 而同进程内第二次导航只要 20~90ms，正是「慢在启动网络活动而非页面本身」的铁证。
    /// 本壳只从 apex.local 加载本地静态资源，这些后台能力一个都用不上（LocalApi 不受影响）。</summary>
    private static async Task<CoreWebView2Environment> CreateWebViewEnvironmentAsync()
    {
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ApexShell", "WebView2");
        var options = new CoreWebView2EnvironmentOptions
        {
            AdditionalBrowserArguments = string.Join(" ", new[]
            {
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-domain-reliability",
            }),
        };
        return await CoreWebView2Environment.CreateWithOptionsAsync(null, userDataFolder, options);
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

    /// <summary>优先还原上次的位置 / 尺寸；没有可用状态、或状态落在所有显示器之外时退回默认居中。</summary>
    private void ApplyStoredOrDefaultPlacement()
    {
        var saved = _stateStore.Load();
        if (saved is not null && saved.HasPlacement && TryRestorePlacement(saved))
        {
            if (saved.Maximized == true) TryMaximize();
            return;
        }
        /* 没有位置尺寸、但记着「上次最大化」：按默认尺寸开窗后直接最大化，
           否则用户明明一直用最大化，重开却回到小窗。 */
        if (saved is not null && saved.IsMaximizedOnly)
        {
            ApplyDefaultPlacement(DefaultWidth, DefaultHeight);
            TryMaximize();
            return;
        }
        ApplyDefaultPlacement(DefaultWidth, DefaultHeight);
    }

    /// <summary>按保存的几何落位。返回 false 表示这份状态不可用（越界 / 尺寸非法），调用方退回默认。
    ///
    /// 越界保护：显示器拔掉或分辨率变化后，旧坐标可能整个落在屏幕外，
    /// 那时用户看不到窗口也拖不回来。判据是「窗口矩形与该显示器工作区的交集必须够大」——
    /// 留 120×40 的可抓取余量，保证标题栏至少露出一块能拖。</summary>
    private bool TryRestorePlacement(WindowStateStore.WindowState saved)
    {
        try
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
            if (AppWindow.GetFromWindowId(windowId) is not { } appWindow) return false;
            _appWindow = appWindow;

            var w = saved.Width!.Value;
            var h = saved.Height!.Value;
            var x = saved.X!.Value;
            var y = saved.Y!.Value;

            /* 尺寸至少给个可用下限；上限钳到主显示器工作区（避免存了个超大尺寸开出来没法用） */
            var primary = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Primary).WorkArea;
            w = Math.Clamp(w, 480, Math.Max(480, primary.Width));
            h = Math.Clamp(h, 360, Math.Max(360, primary.Height));

            /* 位置校验：与任一块显示器工作区的交集必须够大，否则视为越界 */
            if (!PlacementIsReachable(x, y, w, h))
            {
                ShellLog.Log($"window: 保存的位置 {x},{y} 已不可达，退回默认居中");
                return false;
            }

            appWindow.Resize(new Windows.Graphics.SizeInt32(w, h));
            appWindow.Move(new Windows.Graphics.PointInt32(x, y));
            ShellLog.Log($"window: 还原上次布局 {w}x{h} at {x},{y}（role={_role}）");
            return true;
        }
        catch (Exception ex)
        {
            ShellLog.Log("window: 还原布局失败，退回默认 " + ex.Message);
            return false;
        }
    }

    /// <summary>窗口矩形是否落在某块显示器工作区里（留可抓取余量）。
    ///
    /// ⚠️ 用 **Win32 的 `MonitorFromRect`** 而不是 WinRT 的 `DisplayArea.FindAll()`：
    /// 后者在窗口构造早期抛 `E_NOINTERFACE`（"不支持此接口"，2026-09-28 实测），
    /// 会把整个「还原上次布局」拖进 catch 退化成默认居中 —— 表现就是「位置怎么都记不住」。
    /// `MonitorFromRect` 是纯 Win32，任何时候都能调，且语义正是我们要问的
    /// 「这块矩形落在哪块显示器的监视区里」。</summary>
    private static bool PlacementIsReachable(int x, int y, int w, int h)
    {
        const int MinVisibleW = 120;   // 标题栏上至少要能露出这么宽，才抓得住拖动
        const int MinVisibleH = 40;
        const uint MONITOR_DEFAULTTONULL = 0;

        var rect = new NativeRect { Left = x, Top = y, Right = x + w, Bottom = y + h };
        var monitor = MonitorFromRect(ref rect, MONITOR_DEFAULTTONULL);
        if (monitor == IntPtr.Zero) return false;   // 完全不在任何显示器上

        var info = new MonitorInfo { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfo(monitor, ref info)) return false;

        var work = info.rcWork;
        var ox = Math.Max(0, Math.Min(rect.Right, work.Right) - Math.Max(rect.Left, work.Left));
        var oy = Math.Max(0, Math.Min(rect.Bottom, work.Bottom) - Math.Max(rect.Top, work.Top));
        return ox >= MinVisibleW && oy >= MinVisibleH;
    }

    private void TryMaximize()
    {
        try
        {
            if (_appWindow?.Presenter is OverlappedPresenter p) p.Maximize();
        }
        catch (Exception ex)
        {
            ShellLog.Log("window: 还原最大化失败（不影响使用）" + ex.Message);
        }
    }

    /* ---------- WebMessage → C# 本地 API ----------
       协议：JS 发 {type:"api-call", id, path, method, body}；
             壳回 {type:"api-reply", id, ok, status, text} / {…, ok:false, error}。 */

    /// <summary>C# 唯一本地路由分发器。在线程池上构造，每个使用点先 await 它。</summary>
    private readonly Task<LocalApi> _localApiTask;

    /// <summary>WebView2 环境创建任务（构造期即启动，见启动加速 ②）。</summary>
    private readonly Task<CoreWebView2Environment> _envTask;

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        long id = -1;
        try
        {
            var request = WebMessageProtocol.Parse(e.WebMessageAsJson);
            id = request.Id;
            if (request.Type == "shell-toast")
            {
                _tray?.ShowToast(request.Title ?? "ControlPod", request.Message ?? "");
                return;
            }
            if (request.Type == "chrome-command")
            {
                if (request.Command == "hide")
                {
                    _appWindow?.Hide();
                    ShellLog.Log("chrome: 缩小到托盘（顶栏按钮）");
                }
                else if (request.Command == "drag") _chrome.BeginDrag();
                else if (request.Command == "toggle-maximize") _chrome.ToggleMaximize();
                else if (request.Command == "restart")
                {
                    try
                    {
                        var restartApi = await _localApiTask;
                        if (restartApi.HasActiveExecutions)
                            throw new InvalidOperationException("还有执行中的项目操作，请等待完成后再重启");
                        var status = await restartApi.HandleAsync("GET", "/settings/updates", null);
                        if (status.Status != 200) throw new InvalidOperationException("无法确认更新状态，请稍后重试");
                        using var doc = JsonDocument.Parse(status.Text);
                        if (doc.RootElement.TryGetProperty("busy", out var busy) && busy.ValueKind == JsonValueKind.True)
                            throw new InvalidOperationException("更新正在执行，请等待完成后再重启");
                        if (doc.RootElement.TryGetProperty("state", out var state) && state.ValueKind == JsonValueKind.Object
                            && state.TryGetProperty("phase", out var phase) && phase.GetString() == "pending")
                            throw new InvalidOperationException("桌面更新已准备好，请点击退出并完成更新");
                        RestartService.StartReplacement();
                        OnDashCloseTapped(this, null!);
                    }
                    catch (Exception ex)
                    {
                        ShellLog.Log("restart rejected: " + ex.Message);
                        _tray?.ShowToast("CPod 重启失败", ex.Message);
                    }
                }
                else if (request.Command == "quit-for-update")
                {
                    var updateApi = await _localApiTask;
                    var status = await updateApi.HandleAsync("GET", "/settings/updates", null);
                    using var doc = JsonDocument.Parse(status.Text);
                    if (doc.RootElement.TryGetProperty("state", out var state) && state.ValueKind == JsonValueKind.Object
                        && state.TryGetProperty("phase", out var phase) && phase.GetString() == "pending")
                    {
                        if (updateApi.HasActiveExecutions) _tray?.ShowToast("ControlPod", "还有执行中的项目操作，请等待完成后再退出更新");
                        else OnDashCloseTapped(this, null!);
                    }
                }
                else if (request.Command == "theme")
                    SetShellTheme(request.Value == "dark" ? ShellTone.Dark : ShellTone.Light, persist: true);
                else ShellLog.Log("chrome: 未知的 chrome-command " + request.Command);
                return;
            }
            if (request.Type != "api-call") return;

            var api = await _localApiTask;
            var local = await api.HandleAsync(request.Method, request.Path, request.Body);
            ShellLog.Log($"local-api {request.Method} {request.Path} -> {local.Status}");
            sender.PostWebMessageAsJson(WebMessageProtocol.Success(id, local));
        }
        catch (Exception ex)
        {
            // 失败也必须回帖，否则 JS 侧的 Promise 会永远挂着
            sender.PostWebMessageAsJson(WebMessageProtocol.Failure(id, ex));
        }
    }
}
