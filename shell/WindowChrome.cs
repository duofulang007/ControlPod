using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Graphics;
using WinRT.Interop;

namespace ApexShell;

/// <summary>
/// 窗口外壳：把壳做成「整窗一张卡片」的无边框形态。
///
/// 做的事（每条都有实测依据，别凭直觉改）：
/// ① <b>去掉系统标题栏那三个按钮</b>（最小化 / 最大化 / 关闭）。实测
///    <c>OverlappedPresenter.SetBorderAndTitleBar(hasBorder:true, hasTitleBar:false)</c> <b>不管用</b>——
///    调完 WS_CAPTION / WS_SYSMENU / WS_MINIMIZEBOX / WS_MAXIMIZEBOX 一个不少；真正让按钮不画出来的是
///    剥掉窗口样式里的 <c>WS_SYSMENU</c>（注意 WS_MIN/MAXBOX 两位会被 WinUI 复原，不影响——按钮已不画）。
/// ② <b>内容顶到窗口最上沿</b>：<c>ExtendsContentIntoTitleBar</c> + 指定拖拽元素。
/// ③ <b>圆角与描边色交给 DWM</b>（DwmSetWindowAttribute 33 / 34），不自己画——实测两者都生效，
///    而且 DWM 的圆角会把 WebView2 一起裁掉，所以不需要再做一层圆角裁剪。
/// ④ <b>顶栏的可点区域必须显式声明成「穿透」</b>：扩展进标题栏后，整条顶栏默认都是拖拽区，
///    不声明的话搜索框那一整段点不动。拖拽区宽度<b>不写死</b>——实时量页面里搜索框的左边缘
///    （= 侧栏宽 + 顶栏左内边距），所以侧栏折叠 / 紧凑窗口收窄时它能自己跟上。
/// ⑤ <b>双击拖拽区 = 最大化 / 还原</b>，替代被去掉的最大化按钮。
/// ⑥ <b>把最大化矩形钳到监视器工作区</b>（WM_GETMINMAXINFO），保证不压任务栏。
///    注意别用 GetWindowRect 复核这一步：WinUI 窗口（WS_THICKFRAME）的 GetWindowRect
///    含每边 8px 的不可见调整边框，最大化时读出来是 (-8,-8)-(1928,1040)，看着像「溢出屏幕」，
///    实际可见边框（DWMWA_EXTENDED_FRAME_BOUNDS）正好等于工作区。2026-09-26 踩过这个口径坑。
/// </summary>
internal sealed class WindowChrome
{
    private const int GwlStyle = -16;
    private const int WsSysMenu = 0x00080000;
    private const uint SwpNosize = 0x0001;
    private const uint SwpNomove = 0x0002;
    private const uint SwpNozorder = 0x0004;
    private const uint SwpFramechanged = 0x0020;

    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmwaBorderColor = 34;
    private const int DwmwaCaptionColor = 35;
    private const int DwmcpRound = 2;

    /// <summary>不画边框线（DWMWA_COLOR_NONE）。多弗朗 2026-09-26：品牌红描边不要了，
    /// 层次感交给 DWM 自带阴影 —— 窗口保留 WS_THICKFRAME，阴影随它来，不用自己画。</summary>
    private const int DwmColorNone = unchecked((int)0xFFFFFFFE);

    private const uint WmGetMinMaxInfo = 0x0024;
    private const uint MonitorDefaultToNearest = 0x00000002;

    private readonly Window _window;
    private readonly AppWindow _appWindow;

    private readonly IntPtr _hwnd;

    /// <summary>最大化状态变化后通知宿主：壳好把状态回推给页面，同步 body.is-fullscreen。</summary>
    public event Action<bool>? MaximizedChanged;

    /// <summary>窗口几何（位置或尺寸）变化后通知宿主：用于把布局持久化到窗口状态文件。
    /// 拖动 / 拉边 / 最大化都会走到这里，宿主自己再做防抖。</summary>
    public event Action? PlacementChanged;

    /// <summary>当前是否为「铺满屏幕」的全屏态或最大化态 —— 宿主保存布局时要跳过，
    /// 因为这时量到的尺寸是屏幕尺寸，存下来会让下次开窗直接铺满（丢失用户的窗口化大小）。</summary>
    public bool IsFullscreenOrMaximized =>
        _fullscreen || (_appWindow.Presenter is OverlappedPresenter p
            && p.State == OverlappedPresenterState.Maximized);

    /// <summary>子类化回调必须由字段持有，否则会被 GC 回收（表现为点几下就崩）。</summary>
    private SubclassProcDelegate? _subclassProc;

    /// <summary>0 = 没在拖，1 = 拖动中。Interlocked 换入换出，防止连点两次起两个拖动线程。</summary>
    private int _dragging;

    /// <summary>拖动循环的保险丝：万一按键状态读不到，最多 30 秒自动收手。</summary>
    private static readonly TimeSpan DragSafetyTimeout = TimeSpan.FromSeconds(30);


    public WindowChrome(Window window, AppWindow appWindow)
    {
        _window = window;
        _appWindow = appWindow;
        _hwnd = WindowNative.GetWindowHandle(window);

        // 最大化状态用「差分」统一上报：无论是按钮 / 双击拖拽区，还是拖到屏幕顶端触发的
        // 系统贴边最大化，都汇到同一个出口。WinAppSDK 1.6 的 AppWindowChangedEventArgs 没有
        // DidPresenterStateChange 这类属性，只能自己比对。
        _appWindow.Changed += (_, args) =>
        {
            if (!args.DidSizeChange && !args.DidPositionChange) return;
            // 过渡动画期间每帧都在改几何，这里必须静音，否则会踩两个坑：
            // ① 每帧回推一次最大化状态 → 页面的 is-fullscreen 在错误的时刻落定，
            //    主内容会「先铺满再跳回限宽」；
            // ② 把动画中间帧的尺寸当成用户的窗口化布局持久化下来。
            // 收尾由 AnimateWindowTo 统一处理（精确对齐后再放开静音 + 回推）。
            if (Volatile.Read(ref _animating) != 0) return;
            EmitMaximized(_fullscreen || (_appWindow.Presenter is OverlappedPresenter p
                && p.State == OverlappedPresenterState.Maximized));
            // 几何变化顺带上报，供宿主持久化布局（宿主自己防抖，这里不筛频率）
            PlacementChanged?.Invoke();
        };
    }

    /// <summary>只在社会化状态真正翻转时上报，避免同一次最大化触发两次回推。</summary>
    private bool _lastMaximized;

    /// <summary>主动进入全屏时置 true：这期间 WM_GETMINMAXINFO 不要把尺寸钳到工作区，否则全屏变 1920×1032。</summary>
    private bool _fullscreenIntent;

    /// <summary>当前处于「铺满整块屏幕」的全屏态（WinAppSDK 1.6 没有 presenter 级全屏，用标志位自管）。</summary>
    private bool _fullscreen;

    /* ---------- 全屏过渡动画（2026-10-04） ----------
       目标：1:1 复刻 ChatGPT 网页端的「窗口/内容表面 → 全屏 → 退出全屏」过渡。
       核心不是把整个 App 放大，而是让**当前窗口表面**平滑扩张到屏幕四周。

       硬约束（多弗朗明确给出，照做，别自作主张加东西）：
       · 动画只发生在**外层窗口**（位置 / 尺寸 / 圆角 / 阴影 / 裁剪）。内部文字、按钮、
         图标、输入框、侧边栏始终保持 1:1 —— 绝不对 App 根节点做整体 scale，
         那是「网页被放大」，不是「窗口展开」。
       · 内容只按新的可用空间自然重排 → 所以**页面侧一行都不加**，就是让 WebView2
         跟着窗口逐帧重排。任何「钉住布局 / 收尾再换布局 / 交叉淡化」都会让内容在某一刻
         突然换一次宽，正是要避免的割裂感（上一版被否掉就是这个原因）。
       · 不做弹簧 / 回弹 / overshoot，不做整体淡入淡出，不给内部控件加 transform 动画。
       · 起步干脆、中段连续、末端柔和减速、精确停住。 */

    /// <summary>过渡时长（毫秒）。300–400 是舒适区；340 配 cubic-bezier(0.2,0,0,1)
    /// 正好是「起步干脆、末端柔和减速」。</summary>
    internal const int AnimDurationMs = 340;

    /// <summary>帧间隔（毫秒），≈60Hz。**别调到 7ms**：2026-10-04 实测 140Hz 时 WebView2
    /// 渲不过来，会把上一帧拉伸到新尺寸顶上去（用户看到的「内容被拉大一下、还在晃」），
    /// 帧越密越糟。60Hz 才留足 16.7ms 预算让 Chromium 完成 layout + paint。</summary>
    internal const int AnimFrameMs = 15;

    /// <summary>动画世代号：连点 / 中途反向时，旧线程发现世代变了就自己退出，不会两个线程抢窗口。</summary>
    private int _animGeneration;

    /// <summary>1 = 正在跑几何过渡。用来静音 _appWindow.Changed 的自动回推与布局持久化。</summary>
    private int _animating;

    /// <summary>当前 DWM 圆角档位缓存，避免每帧重复调 DWM。</summary>
    private bool _cornersRounded = true;

    /// <summary>进全屏前的窗口化矩形，退出时还原。</summary>
    private RectInt32 _restoreRect;

    /// <summary>进全屏前的置顶状态，退出时还原（全屏期间临时置顶是为了盖住任务栏）。</summary>
    private bool _topmostBefore;

    private void EmitMaximized(bool maximized)
    {
        if (maximized == _lastMaximized) return;
        _lastMaximized = maximized;
        MaximizedChanged?.Invoke(maximized);
    }

    /// <summary>挂上外壳。必须在 InitializeComponent 之后、且 _appWindow 已就绪时调用。</summary>
    public void Apply()
    {
        KillSystemChrome();
        ApplyDwmRoundingAndBorder();
        HookMinMaxInfoGuard();
        ShellLog.Log("chrome: 无边框卡片外壳已挂上");
    }

    /// <summary>开始拖动窗口：页面在 data-drag 区域 mousedown 时发 <c>chrome-command: drag</c> 触发。
    ///
    /// 不用经典三件套 <c>ReleaseCapture + SendMessage(WM_NCLBUTTONDOWN, HTCAPTION)</c> —— 实测这套在
    /// WinUI 3 壳里不生效（页面按了窗口纹丝不动，它是 WPF / WinForms / Electron 的路子）。
    /// 也不走 UI 线程的 DispatcherQueueTimer —— 它分辨率粗、还会被 WebView2 的渲染挤占，拖起来掉帧。
    /// 最终做法：<b>专用后台线程</b> + <c>timeBeginPeriod(1)</c> 拿到真 8ms 节拍 +
    /// 原生 <c>SetWindowPos(SWP_ASYNCWINDOWPOS)</c>（异步落位、不阻塞自己），左键松开即停。
    /// 不依赖 Win32 模态循环，所以也从不需要 SetTitleBar / 穿透区那套机制。</summary>
    public void BeginDrag()
    {
        if (Interlocked.Exchange(ref _dragging, 1) == 1) return;   // 已经在拖
        if (!GetCursorPos(out var start)) { _dragging = 0; return; }
        var winStart = _appWindow.Position;
        ShellLog.Log($"chrome: 开始拖动（起点 {start.X},{start.Y} 窗口 {winStart.X},{winStart.Y}）");

        var thread = new Thread(() =>
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            timeBeginPeriod(1);                                    // 默认 15.6ms 的系统节拍会让 Sleep(8) 变 15ms
            try
            {
                while ((short)GetAsyncKeyState(VkLButton) < 0 && sw.Elapsed < DragSafetyTimeout)
                {
                    if (GetCursorPos(out var now))
                        _ = SetWindowPos(_hwnd, IntPtr.Zero,
                            winStart.X + now.X - start.X, winStart.Y + now.Y - start.Y,
                            0, 0, SwpNosize | SwpNozorder | SwpNoactivate | SwpAsyncwindowpos);
                    Thread.Sleep(7);
                }
            }
            finally
            {
                timeEndPeriod(1);
                _dragging = 0;
                ShellLog.Log("chrome: 拖动结束（" + sw.ElapsedMilliseconds + "ms）");
            }
        })
        { IsBackground = true };
        thread.Start();
    }

    /// <summary>去掉系统标题栏那三个按钮（最小化 / 最大化 / 关闭）。
    ///
    /// 2026-09-26 在真机上实测两件事，纠正了空壳阶段的结论：
    /// ① <b>只剥 WS_SYSMENU 不够</b> —— WinUI 的标题栏按钮是它自己画的，不走经典非客户区绘制，
    ///    样式位剥了按钮照样在（真机 `WS_SYSMENU=无` 但三个按钮仍在）；
    /// ② 真正让按钮消失的是把 presenter 的标题栏整个关掉：
    ///    <c>SetBorderAndTitleBar(hasBorder:false, hasTitleBar:false)</c>。
    ///    hasBorder:false 只剥 WS_BORDER、保留 WS_THICKFRAME，所以边缘缩放不受影响；
    ///    代价是没有系统边框时最大化会盖住任务栏，靠 HookMinMaxInfoGuard 钳回工作区补。
    /// 顺序必须是这条在前：<c>ExtendsContentIntoTitleBar</c> 会把标题栏样式加回去。</summary>
    private void KillSystemChrome()
    {
        if (_appWindow.Presenter is OverlappedPresenter presenter)
        {
            try
            {
                presenter.SetBorderAndTitleBar(hasBorder: false, hasTitleBar: false);
                presenter.IsResizable = true;
                presenter.IsMaximizable = true;
                presenter.IsMinimizable = true;
                ShellLog.Log("chrome: SetBorderAndTitleBar(false,false) OK " +
                             $"resizable={presenter.IsResizable} maximizable={presenter.IsMaximizable}");
            }
            catch (Exception ex)
            {
                ShellLog.Log("chrome: SetBorderAndTitleBar 失败 " + ex.Message);
            }
        }
        else
        {
            ShellLog.Log("chrome: presenter 不是 OverlappedPresenter，跳过");
        }

        var before = GetWindowLongPtrW(_hwnd, GwlStyle).ToInt64();
        SetWindowLongPtrW(_hwnd, GwlStyle, before & ~(long)WsSysMenu);
        SetWindowPos(_hwnd, IntPtr.Zero, 0, 0, 0, 0,
            SwpNomove | SwpNosize | SwpNozorder | SwpFramechanged);
        ShellLog.Log($"chrome: 剥 WS_SYSMENU 0x{before:X8} -> 0x{GetWindowLongPtrW(_hwnd, GwlStyle).ToInt64():X8}");
    }

    private void ApplyDwmRoundingAndBorder()
    {
        try
        {
            var corner = DwmcpRound;
            var hrCorner = DwmSetWindowAttribute(_hwnd, DwmwaWindowCornerPreference, ref corner, sizeof(int));
            var border = DwmColorNone;
            var hrBorder = DwmSetWindowAttribute(_hwnd, DwmwaBorderColor, ref border, sizeof(int));
            ShellLog.Log($"chrome: dwm 圆角 hr={hrCorner} / 描边线关闭 hr={hrBorder}（层次感靠阴影）");
        }
        catch (Exception ex)
        {
            ShellLog.Log("chrome: 设置 DWM 圆角/描边失败 " + ex.Message);
        }
    }

    /// <summary>DWM 标题栏底色（DWMWA_CAPTION_COLOR）跟随页面主题。
    ///
    /// 顶部 8px 保留区在客户区之外、由 DWM 画成浅色标题栏默认色 F3F3F3（Win11 caption 默认值，
    /// 2026-09-26 PrintWindow 像素取证 y=1~7=243）：RootGrid 底色是客户区内的，够不着这里，
    /// 唯有把 caption 色一并换掉才能让深色页面下这 8px 不露白。colorref 按 0x00BBGGRR。</summary>
    public void SetCaptionColor(byte r, byte g, byte b)
    {
        try
        {
            var colorref = r | (g << 8) | (b << 16);
            var hr = DwmSetWindowAttribute(_hwnd, DwmwaCaptionColor, ref colorref, sizeof(int));
            ShellLog.Log($"chrome: dwm caption 色 hr={hr} rgb({r},{g},{b})");
        }
        catch (Exception ex)
        {
            ShellLog.Log("chrome: 设置 caption 色失败 " + ex.Message);
        }
    }

    private void HookMinMaxInfoGuard()
    {
        _subclassProc = OnSubclassed;
        if (!SetWindowSubclass(_hwnd, _subclassProc, 1, IntPtr.Zero))
        {
            ShellLog.Log("chrome: SetWindowSubclass 失败（Win32 错误 " +
                         Marshal.GetLastWin32Error() + "），最大化可能溢出 8px");
        }
    }

    /// <summary>只记第一次，避免每次最大化都刷屏——用来确认这条钳制到底有没有被系统采纳。</summary>
    private bool _minMaxInfoLogged;

    private IntPtr OnSubclassed(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam,
        IntPtr idSubclass, IntPtr refData)
    {
        if (msg == WmGetMinMaxInfo)
        {
            try
            {
                var area = ClampMaximizedToWorkArea(lParam);
                if (!_minMaxInfoLogged)
                {
                    _minMaxInfoLogged = true;
                    ShellLog.Log($"chrome: WM_GETMINMAXINFO 钳到工作区 {area.Width}x{area.Height} @{area.X},{area.Y}");
                }
            }
            catch { /* 钳不出正确值也不能让窗口起不来，交回默认逻辑 */ }
        }
        return DefSubclassProc(hWnd, msg, wParam, lParam);
    }

    /// <summary>把最大化的位置/尺寸钳到监视器工作区，保证不压任务栏。
    ///
    /// <b>ptMaxSize 是「可见」尺寸</b>：窗口外层会自动再补上不可见调整边框，
    /// 所以事后用 GetWindowRect 复核会看到「比工作区大 16px」，那是正常的，不是溢出
    /// （实测：钳入 1920x1032，GetWindowRect 读回 1936x1048，可见边框正好 1920x1032 == 工作区）。</summary>
    private RectInt32 ClampMaximizedToWorkArea(IntPtr lParam)
    {
        var area = WorkArea();
        if (_fullscreenIntent) return area;   // 全屏要整块屏幕（1920×1080），别钳成工作区
        var mmi = Marshal.PtrToStructure<MinMaxInfo>(lParam);
        mmi.ptMaxPosition.X = area.X;
        mmi.ptMaxPosition.Y = area.Y;
        mmi.ptMaxSize.X = area.Width;
        mmi.ptMaxSize.Y = area.Height;
        Marshal.StructureToPtr(mmi, lParam, false);
        return area;
    }

    /* ---------- 最大化 / 还原 ---------- */

    /// <summary>双击拖拽区 → 最大化 / 还原。走系统原生状态（presenter），
    /// 这样贴边停靠、任务栏还原、Win+方向键这些系统行为都还在。
    ///
    /// <b>别拿 GetWindowRect 判定它「溢出屏幕」</b>——WinUI 窗口（WS_THICKFRAME）的 GetWindowRect
    /// 含每边 8px 的<b>不可见调整边框</b>，最大化时读出来是 <c>(-8,-8)-(1928,1040)</c>，看着像溢出，
    /// 其实可见边框 <c>DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)</c> 正好等于工作区。
    /// 2026-09-26 实测：可见 (0,0)-(1920,1032) == rcWork，左上各 8px 差异全是不可见边框。</summary>
    /// <summary>全屏切换（页面 #fsBtn、看板窗口条 DashFull、双击拖动区 —— 三路合一）。
    /// 多弗朗 2026-09-26：全屏要铺满**整块屏幕**（1K = 1920×1080），不是避开任务栏的工作区最大化。
    /// 2026-10-04：改成**从当前窗口真实边界平滑扩张**到屏幕四周（退出反向收缩），几何全部由
    /// 外层窗口逐帧插值，页面内容只跟着新的可用空间自然重排 —— 见 AnimateWindowTo。
    ///
    /// 时序上有一处**刻意的不对称**，它是消掉「瞬间跳宽」的关键（别顺手改成对称的）：
    /// · 进入：动画**开始**就把 is-fullscreen 回推给页面。卡片宽（1260 上下）时
    ///   max-width:1440 根本不起作用，之后窗口每宽一点、限宽才逐渐参与布局，全程连续。
    ///   若压到收尾才回推，内容会先铺满 1920 再跳回 1440 居中 —— 那正是「瞬间又变大」的割裂感。
    /// · 退出：动画**收尾**才摘。摘早了窗口还 1920 宽，主内容会从 1440 瞬间弹到 1920。</summary>
    public void ToggleMaximize()
    {
        if (_appWindow.Presenter is not OverlappedPresenter presenter) return;

        if (_fullscreen)
        {
            _fullscreen = false;
            _fullscreenIntent = false;
            presenter.IsAlwaysOnTop = _topmostBefore;
            var from = CurrentOuterRect();      // 实时读：中途连点也不会从过期的起点出发
            var to = _restoreRect;
            ShellLog.Log($"chrome: 退出全屏 {from.Width}x{from.Height} -> {to.Width}x{to.Height}@{to.X},{to.Y}"
                         + (AnimationsDisabled() ? "（瞬时：系统已关动画）" : $"（{AnimDurationMs}ms）"));
            AnimateWindowTo(from, to, entering: false, () => EmitMaximized(false));
            return;
        }

        var pos = _appWindow.Position;
        var size = _appWindow.Size;
        _restoreRect = new RectInt32(pos.X, pos.Y, size.Width, size.Height);
        _topmostBefore = presenter.IsAlwaysOnTop;
        var monitor = MonitorRect();
        _fullscreen = true;
        _fullscreenIntent = true;
        presenter.IsAlwaysOnTop = true;          // 不置顶的话任务栏会压在窗口底部
        var outer = FullscreenOuterRect(monitor);
        EmitMaximized(true);                     // 立刻回推：限宽规则从现在起就参与布局，全程连续
        ShellLog.Log($"chrome: 进入全屏 {_restoreRect.Width}x{_restoreRect.Height}@{_restoreRect.X},{_restoreRect.Y}"
                     + $" -> {outer.Width}x{outer.Height}@{outer.X},{outer.Y}"
                     + (AnimationsDisabled() ? "（瞬时：系统已关动画）" : $"（{AnimDurationMs}ms）"));
        AnimateWindowTo(_restoreRect, outer, entering: true, null);
    }

    /* ---------- 过渡动画实现 ---------- */

    /// <summary>DWM 的「不要圆角」档（DWMWCP_DONOTROUND）。</summary>
    private const int DwmcpDoNotRound = 1;

    /// <summary>把窗口几何从 <paramref name="from"/> 逐帧插值到 <paramref name="to"/>。
    ///
    /// 为什么放后台线程 + timeBeginPeriod(1)：UI 线程会被 WebView2 的渲染挤占，
    /// DispatcherQueueTimer 分辨率粗、会被拖成掉帧（与 BeginDrag 同因）。
    ///
    /// 为什么用 SWP_ASYNCWINDOWPOS：逐帧同步落位会阻塞调用线程、让窗口线程排队；
    /// 异步落位足够跟手，收尾再用一次同步 SetWindowPos 精确对齐（异步帧可能差 1px）。
    ///
    /// 圆角：DWM 只给「圆 / 不圆」两档（没有任意半径），没法逐帧插值。折中是靠近全屏时才切档
    /// —— 8px 圆角在接近屏幕尺寸的窗口上已经看不出来，切换不可察觉；反过来退出时等窗口收缩得
    /// 差不多了再切回圆角，免得窗口还在全屏位置就露出四个圆角缺口。阴影不用特意管：窗口铺满后
    /// DWM 阴影本身落在屏幕外，随扩张自然「消失」。</summary>
    private void AnimateWindowTo(RectInt32 from, RectInt32 to, bool entering, Action? onDone)
    {
        var gen = Interlocked.Increment(ref _animGeneration);
        Volatile.Write(ref _animating, 1);

        if (AnimationsDisabled())
        {
            Finish();                            // 系统关了动画：一步吸附，与页面 prefers-reduced-motion 一致
            return;
        }

        var thread = new Thread(() =>
        {
            timeBeginPeriod(1);
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                while (true)
                {
                    if (Volatile.Read(ref _animGeneration) != gen) return;    // 已被新一代接管
                    var p = Math.Min(1.0, sw.Elapsed.TotalMilliseconds / AnimDurationMs);
                    var e = EaseInOutEmphasized(p);
                    var r = LerpRect(from, to, e);
                    _ = SetWindowPos(_hwnd, IntPtr.Zero, r.X, r.Y, r.Width, r.Height,
                        SwpNozorder | SwpNoactivate | SwpAsyncwindowpos);
                    SetCornersRounded(entering ? e <= 0.85 : e < 0.15);
                    if (p >= 1.0) break;
                    Thread.Sleep(AnimFrameMs);
                }
            }
            finally
            {
                timeEndPeriod(1);
            }
            _window.DispatcherQueue.TryEnqueue(() =>
            {
                if (Volatile.Read(ref _animGeneration) != gen) return;        // 中途被接管，别动别人的窗口
                Finish();
            });
        })
        { IsBackground = true };
        thread.Start();

        void Finish()
        {
            // 收尾精确对齐（抹掉异步落位那不到 1px 的误差），再放开静音、回推状态
            _ = SetWindowPos(_hwnd, IntPtr.Zero, to.X, to.Y, to.Width, to.Height,
                SwpNozorder | SwpNoactivate);
            SetCornersRounded(!entering);
            Volatile.Write(ref _animating, 0);
            onDone?.Invoke();
        }
    }

    /// <summary>cubic-bezier(0.2, 0, 0, 1)：起步干脆、中段连续、末端柔和减速
    /// （前一半时间走完约 88% 的距离，剩下的是长尾巴减速）。
    /// 实现必须二分求参数 u 使 x(u)=t 再取 y(u) —— 直接拿 t 当参数取 y 会得到错误的进度，
    /// 因为贝塞尔的两个轴不是同一个参数。</summary>
    internal static double EaseInOutEmphasized(double t)
    {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        double lo = 0, hi = 1, u = t;
        for (var i = 0; i < 24; i++)
        {
            u = (lo + hi) / 2;
            if (BezierAxis(u, 0.2, 0.0) < t) lo = u; else hi = u;
        }
        return BezierAxis(u, 0.0, 1.0);
    }

    /// <summary>三次贝塞尔某一轴的取值（端点固定 P0=0 / P3=1，只传中间两个控制点分量）。</summary>
    private static double BezierAxis(double u, double a, double b)
    {
        var v = 1 - u;
        return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
    }

    /// <summary>两个矩形按比例插值（四边一起走，所以窗口是「向四周扩张」而不是「向一边推」）。</summary>
    private static RectInt32 LerpRect(RectInt32 a, RectInt32 b, double t) =>
        new((int)Math.Round(a.X + (b.X - a.X) * t),
            (int)Math.Round(a.Y + (b.Y - a.Y) * t),
            (int)Math.Round(a.Width + (b.Width - a.Width) * t),
            (int)Math.Round(a.Height + (b.Height - a.Height) * t));

    /// <summary>当前窗口的外层矩形。<b>GetWindowRect 口径与 AppWindow.Position/Size、
    /// MoveAndResize 三者一致</b>（都含 WS_THICKFRAME 那圈不可见调整边框），所以插值可以直接
    /// 拿 _restoreRect 当起点终点，不需要做边框补偿。</summary>
    private RectInt32 CurrentOuterRect()
    {
        var gwr = new NativeRect();
        if (!GetWindowRect(_hwnd, ref gwr))
        {
            var p = _appWindow.Position;
            var s = _appWindow.Size;
            return new RectInt32(p.X, p.Y, s.Width, s.Height);
        }
        return new RectInt32(gwr.left, gwr.top, gwr.right - gwr.left, gwr.bottom - gwr.top);
    }

    /// <summary>切换 DWM 圆角档位。只有两档可选，所以只在真正跨档时调一次 DWM，别每帧 hammer。</summary>
    private void SetCornersRounded(bool rounded)
    {
        if (_cornersRounded == rounded) return;
        _cornersRounded = rounded;
        try
        {
            var corner = rounded ? DwmcpRound : DwmcpDoNotRound;
            _ = DwmSetWindowAttribute(_hwnd, DwmwaWindowCornerPreference, ref corner, sizeof(int));
        }
        catch { /* 圆角只是视觉细节，拿不到也不能因此中断窗口动画 */ }
    }

    /// <summary>系统是否关掉了动画（Windows 的「显示动画」设置，≈ 页面的 prefers-reduced-motion）。
    /// 命中就直接吸附到目标、不跑帧循环 —— 页面侧那条 @media 也会同步退化成瞬时，两边口径一致。</summary>
    private static bool AnimationsDisabled()
    {
        try { return !new Windows.UI.ViewManagement.UISettings().AnimationsEnabled; }
        catch { return false; }
    }

    /// <summary>算出全屏要用的「外层矩形」。MoveAndResize 设的是含<b>不可见调整边框</b>的外层矩形，
    /// 肉眼看到的是可见边框（无边框后实测差值 左7 上0 右7 下7，来自残留的 WS_THICKFRAME）——
    /// 不补偿的话全屏右边和下面会各留一条缝。差值在进全屏那一刻现量，不写死。</summary>
    private RectInt32 FullscreenOuterRect(RectInt32 monitor)
    {
        var gwr = new NativeRect();
        _ = GetWindowRect(_hwnd, ref gwr);
        var ext = new NativeRect();
        if (DwmGetWindowAttribute(_hwnd, DwmwaExtendedFrameBounds, ref ext,
                Marshal.SizeOf<NativeRect>()) != 0)
            return monitor;

        var bLeft = Math.Max(0, ext.left - gwr.left);
        var bTop = Math.Max(0, ext.top - gwr.top);
        var bRight = Math.Max(0, gwr.right - ext.right);
        var bBottom = Math.Max(0, gwr.bottom - ext.bottom);
        if (bLeft == 0 && bTop == 0 && bRight == 0 && bBottom == 0) return monitor;

        return new RectInt32(monitor.X - bLeft, monitor.Y - bTop,
            monitor.Width + bLeft + bRight, monitor.Height + bTop + bBottom);
    }

    /// <summary>当前窗口所在监视器的整块矩形（物理像素，含任务栏那一条）。</summary>
    private RectInt32 MonitorRect()
    {
        var monitor = MonitorFromWindow(_hwnd, MonitorDefaultToNearest);
        var info = new MonitorInfo { cbSize = Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfoW(monitor, ref info))
            return new RectInt32(0, 0, _appWindow.Size.Width, _appWindow.Size.Height);
        return new RectInt32(info.rcMonitor.left, info.rcMonitor.top,
            info.rcMonitor.right - info.rcMonitor.left, info.rcMonitor.bottom - info.rcMonitor.top);
    }

    /// <summary>当前窗口所在监视器的工作区（物理像素，已排除任务栏）。</summary>
    private RectInt32 WorkArea()
    {
        var monitor = MonitorFromWindow(_hwnd, MonitorDefaultToNearest);
        var info = new MonitorInfo { cbSize = Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfoW(monitor, ref info))
        {
            var size = _appWindow.Size;
            return new RectInt32(0, 0, size.Width, size.Height);
        }
        return new RectInt32(info.rcWork.left, info.rcWork.top,
            info.rcWork.right - info.rcWork.left, info.rcWork.bottom - info.rcWork.top);
    }

    /* ---------- Win32 ---------- */

    private delegate IntPtr SubclassProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam,
        IntPtr lParam, IntPtr idSubclass, IntPtr refData);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public NativePoint ptReserved;
        public NativePoint ptMaxSize;
        public NativePoint ptMaxPosition;
        public NativePoint ptMinTrackSize;
        public NativePoint ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int left; public int top; public int right; public int bottom; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MonitorInfo
    {
        public int cbSize;
        public NativeRect rcMonitor;
        public NativeRect rcWork;
        public int dwFlags;
    }

    private const int VkLButton = 0x01;
    private const uint SwpNoactivate = 0x0010;
    private const uint SwpAsyncwindowpos = 0x4000;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint2 { public int X; public int Y; }

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out NativePoint2 point);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);


    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, ref NativeRect rect);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, ref NativeRect rect, int size);

    private const int DwmwaExtendedFrameBounds = 9;

    [DllImport("winmm.dll")]
    private static extern uint timeBeginPeriod(uint ms);

    [DllImport("winmm.dll")]
    private static extern uint timeEndPeriod(uint ms);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtrW(IntPtr hWnd, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int index, long value);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y,
        int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfoW(IntPtr monitor, ref MonitorInfo info);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hWnd, int attribute, ref int value, int size);

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool SetWindowSubclass(IntPtr hWnd, SubclassProcDelegate proc,
        IntPtr idSubclass, IntPtr refData);

    [DllImport("comctl32.dll")]
    private static extern IntPtr DefSubclassProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
