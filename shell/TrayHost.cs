using System;
using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace ApexShell;

/// <summary>
/// 托盘图标 + 全局快捷键（Ctrl+Alt+A 唤起/隐藏），纯 Win32 实现，不引第三方包。
/// 结构：一个隐藏的原生窗口同时承接 Shell_NotifyIcon 回调与 WM_HOTKEY。
/// </summary>
internal sealed class TrayHost : IDisposable
{
    /// <summary>托盘菜单点了「退出」。</summary>
    public event Action? ExitRequested;

    private const uint WM_APP_TRAY = 0x8000;   // WM_APP 起步的自定义托盘回调消息
    private const int HOTKEY_ID = 0xA001;      // Ctrl+Alt+A

    private readonly Action<string>? _log;
    private readonly Window _window;
    private readonly IntPtr _mainHwnd;
    private readonly Native.WndProc _wndProc;  // 字段持引用，防委托被 GC 回收
    private readonly IntPtr _hwnd;
    private readonly IntPtr _hIcon;
    private bool _disposed;

    public TrayHost(Window window, Action<string>? log = null)
    {
        _log = log;
        _window = window;
        _mainHwnd = WinRT.Interop.WindowNative.GetWindowHandle(window);
        _wndProc = WndProc;
        _hwnd = CreateMessageWindow();
        _log?.Invoke($"tray: msg-window hwnd={_hwnd}");
        if (_hwnd == IntPtr.Zero)
        {
            _log?.Invoke("tray: 隐藏窗口创建失败，托盘/热键不可用");
            return;
        }
        _hIcon = LoadTrayIcon();
        AddTrayIcon();
        // MOD_ALT(0x1) | MOD_CONTROL(0x2)，'A' = 0x41
        var hotkeyOk = Native.RegisterHotKey(_hwnd, HOTKEY_ID, 0x3, 0x41);
        _log?.Invoke($"tray: RegisterHotKey(Ctrl+Alt+A) = {hotkeyOk}");
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        var data = MakeIconData();
        Native.Shell_NotifyIconW(Native.NIM_DELETE, ref data);
        Native.UnregisterHotKey(_hwnd, HOTKEY_ID);
        Native.DestroyWindow(_hwnd);
    }

    /// <summary>
    /// 系统通知：托盘气球（NIF_INFO）在 Win10/11 上即原生 Toast 样式，可进通知中心。
    /// 复用托盘图标，无需 MSIX 身份。托盘不可用时静默跳过。
    /// </summary>
    public void ShowToast(string title, string message)
    {
        if (_disposed || _hwnd == IntPtr.Zero) return;
        var data = MakeIconData();
        data.uFlags |= Native.NIF_INFO;
        data.szInfoTitle = string.IsNullOrWhiteSpace(title) ? "ControlPod" : title;
        data.szInfo = message ?? "";
        data.dwInfoFlags = Native.NIIF_INFO;
        if (!Native.Shell_NotifyIconW(Native.NIM_MODIFY, ref data))
            _log?.Invoke("toast: NIM_MODIFY failed");
    }

    /* ---------- 行为 ---------- */

    private void ToggleWindow()
    {
        if (Native.IsWindowVisible(_mainHwnd)) HideMain();
        else ShowMain();
    }

    private void ShowMain()
    {
        var appWindow = AppWindow.GetFromWindowId(
            Microsoft.UI.Win32Interop.GetWindowIdFromWindow(_mainHwnd));
        appWindow.Show();
        Native.ShowWindow(_mainHwnd, 9);            // SW_RESTORE
        Native.SetForegroundWindow(_mainHwnd);
    }

    private void HideMain()
    {
        AppWindow.GetFromWindowId(
            Microsoft.UI.Win32Interop.GetWindowIdFromWindow(_mainHwnd)).Hide();
    }

    private void ShowTrayMenu()
    {
        var menu = Native.CreatePopupMenu();
        Native.AppendMenuW(menu, 0, (IntPtr)1, "打开 ControlPod");
        Native.AppendMenuW(menu, Native.MF_SEPARATOR, IntPtr.Zero, null);
        Native.AppendMenuW(menu, 0, (IntPtr)2, "退出");
        Native.SetForegroundWindow(_hwnd);          // 托盘菜单官方惯例：先置前台再 TrackPopupMenu
        Native.GetCursorPos(out var pt);
        var cmd = Native.TrackPopupMenu(menu,
            Native.TPM_RETURNCMD | Native.TPM_RIGHTBUTTON, pt.X, pt.Y, 0, _hwnd, IntPtr.Zero);
        Native.PostMessageW(_hwnd, 0, IntPtr.Zero, IntPtr.Zero);  // TPM 文档要求的收尾消息
        Native.DestroyMenu(menu);
        if (cmd == 1) ShowMain();
        else if (cmd == 2) ExitRequested?.Invoke();
    }

    private IntPtr WndProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        switch (msg)
        {
            case WM_APP_TRAY:
                var mouse = (uint)(lParam.ToInt64() & 0xFFFF);
                if (mouse == 0x0202) ToggleWindow();       // WM_LBUTTONUP
                else if (mouse == 0x0205) ShowTrayMenu();  // WM_RBUTTONUP
                break;
            case Native.WM_HOTKEY:
                if (wParam.ToInt64() == HOTKEY_ID) ToggleWindow();
                break;
        }
        return Native.DefWindowProcW(hwnd, msg, wParam, lParam);
    }

    /* ---------- 托盘注册 ---------- */

    private Native.NOTIFYICONDATAW MakeIconData() => new()
    {
        cbSize = Marshal.SizeOf<Native.NOTIFYICONDATAW>(),
        hWnd = _hwnd,
        uID = 1,
        uFlags = Native.NIF_MESSAGE | Native.NIF_ICON | Native.NIF_TIP,
        uCallbackMessage = WM_APP_TRAY,
        hIcon = _hIcon,
        szTip = "ControlPod",
        szInfo = "",
        szInfoTitle = "",
    };

    private void AddTrayIcon()
    {
        var data = MakeIconData();
        var ok = Native.Shell_NotifyIconW(Native.NIM_ADD, ref data);
        _log?.Invoke($"tray: NIM_ADD = {ok}");
    }

    private IntPtr CreateMessageWindow()
    {
        var hInst = Native.GetModuleHandleW(null);
        var cls = new Native.WNDCLASSW
        {
            lpfnWndProc = _wndProc,
            hInstance = hInst,
            lpszClassName = "ApexShellTrayHost",
        };
        var atom = Native.RegisterClassW(ref cls);
        _log?.Invoke($"tray: RegisterClassW atom={atom}");
        // 经典模式：普通隐藏窗口（从不 Show），托盘回调与热键消息都落到这里
        return Native.CreateWindowExW(0, "ApexShellTrayHost", "ApexShellTrayHost",
            0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
    }

    private static IntPtr LoadTrayIcon()
    {
        var exe = Environment.ProcessPath;
        if (exe != null && Native.ExtractIconExW(exe, 0, out _, out var small, 1) > 0 && small != IntPtr.Zero)
            return small;
        return Native.LoadIconW(IntPtr.Zero, (IntPtr)32512);  // IDI_APPLICATION 兜底
    }

    /* ---------- Win32 P/Invoke ---------- */

    internal static class Native
    {
        public delegate IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        public const int HWND_MESSAGE = -3;
        public const uint NIM_ADD = 0, NIM_MODIFY = 1, NIM_DELETE = 2;
        public const uint NIF_MESSAGE = 1, NIF_ICON = 2, NIF_TIP = 4, NIF_INFO = 0x10;
        public const uint NIIF_INFO = 0x1;
        public const uint WM_HOTKEY = 0x0312;
        public const uint MF_SEPARATOR = 0x0800;
        public const uint TPM_RIGHTBUTTON = 0x0002, TPM_RETURNCMD = 0x0100;

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr FindWindowW(string? lpClassName, string lpWindowName);

        [StructLayout(LayoutKind.Sequential)]
        public struct WNDCLASSW
        {
            public uint style;
            public WndProc lpfnWndProc;
            public int cbClsExtra, cbWndExtra;
            public IntPtr hInstance, hIcon, hCursor, hbrBackground;
            [MarshalAs(UnmanagedType.LPWStr)] public string? lpszMenuName;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct NOTIFYICONDATAW
        {
            public int cbSize;
            public IntPtr hWnd;
            public uint uID, uFlags, uCallbackMessage;
            public IntPtr hIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
            public uint dwState, dwStateMask;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
            public uint uVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
            public uint dwInfoFlags;
            public Guid guidItem;
            public IntPtr hBalloonIcon;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X, Y; }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern ushort RegisterClassW(ref WNDCLASSW lpWndClass);

        // CharSet.Unicode 必须显式声明：DllImport 默认按 ANSI 封送字符串，
        // 而类名是 RegisterClassW 注册的 Unicode 名，ANSI/Unicode 对不上会 hwnd=0
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateWindowExW(uint dwExStyle, string lpClassName, string lpWindowName,
            uint dwStyle, int x, int y, int w, int h, IntPtr hWndParent, IntPtr hMenu, IntPtr hInstance, IntPtr lpParam);

        [DllImport("user32.dll")]
        public static extern IntPtr DefWindowProcW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool DestroyWindow(IntPtr hWnd);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr GetModuleHandleW(string? lpModuleName);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern bool Shell_NotifyIconW(uint dwMessage, ref NOTIFYICONDATAW lpData);

        [DllImport("user32.dll")]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern int ExtractIconExW(string lpszFile, int nIconIndex,
            out IntPtr phiconLarge, out IntPtr phiconSmall, int nIcons);

        [DllImport("user32.dll")]
        public static extern IntPtr LoadIconW(IntPtr hInstance, IntPtr lpIconName);

        [DllImport("user32.dll")]
        public static extern IntPtr CreatePopupMenu();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern bool AppendMenuW(IntPtr hMenu, uint uFlags, IntPtr uIDNewItem, string? lpNewItem);

        [DllImport("user32.dll")]
        public static extern int TrackPopupMenu(IntPtr hMenu, uint uFlags, int x, int y,
            int nReserved, IntPtr hWnd, IntPtr prcRect);   // TPM_RETURNCMD 模式：返回选中项 ID

        [DllImport("user32.dll")]
        public static extern bool DestroyMenu(IntPtr hMenu);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern bool PostMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    }
}

/// <summary>壳层共享诊断日志（一期联调用，稳定后删除）。落 %LOCALAPPDATA%\ApexShell\web-shell.log。</summary>
/// <summary>壳层日志：每行带「距本进程启动多少毫秒」，启动耗时一眼可查（+4123ms 这种）。
/// 加锁是因为它同时被 UI 线程与线程池写（图标拦截、应用扫描都调它）。</summary>
internal static class ShellLog
{
    private static readonly string LogPath = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ApexShell", "web-shell.log");

    private static readonly object Gate = new();

    /// <summary>本进程启动时刻：只用来算相对耗时，拿不到就退回首次日志时刻（不影响相对比较）。</summary>
    private static readonly DateTime ProcessStart = ResolveProcessStart();

    private static DateTime ResolveProcessStart()
    {
        try { return System.Diagnostics.Process.GetCurrentProcess().StartTime; }
        catch { return DateTime.Now; }
    }

    /// <summary>距本进程启动的毫秒数。</summary>
    public static long SinceStartMs => (long)(DateTime.Now - ProcessStart).TotalMilliseconds;

    public static void Log(string msg)
    {
        var line = $"[{DateTime.Now:HH:mm:ss.fff}] +{SinceStartMs}ms {msg}\n";
        lock (Gate)
        {
            try { System.IO.File.AppendAllText(LogPath, line); }
            catch { /* 日志写不进去不能反过来影响主流程 */ }
        }
    }
}
