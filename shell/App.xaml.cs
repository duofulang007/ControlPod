using Microsoft.UI.Xaml;
using System;
using System.IO;
using System.Linq;
using System.Threading;

namespace ApexShell;

public partial class App : Application
{
    private Window? _window;
    private Mutex? _singleInstance;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        // 无头自测：--selftest [日志路径]。不建窗口不碰 WebView2（工具会话出身会被安全软件
        // 掐 WebView2，但纯计算 + 注册表 + SQLite 不会），跑完直接退出，结果落日志文件。
        var cli = Environment.GetCommandLineArgs();
        var selftestIdx = Array.IndexOf(cli, "--selftest");
        if (selftestIdx >= 0)
        {
            var logPath = selftestIdx + 1 < cli.Length && !cli[selftestIdx + 1].StartsWith("--")
                ? cli[selftestIdx + 1]
                : Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ApexShell", "selftest.log");
            var stagesIdx = Array.IndexOf(cli, "--stages");
            var stages = stagesIdx >= 0 && stagesIdx + 1 < cli.Length
                ? cli[stagesIdx + 1].Split(',', StringSplitOptions.RemoveEmptyEntries)
                : null;
            var ok = SelfTest.Run(logPath, stages);
            Environment.Exit(ok ? 0 : 1);
            return;
        }

        // 一键生成快捷方式：--shortcuts（桌面一个；开始菜单里若有同名旧 lnk，一并重指过来）
        if (Array.IndexOf(cli, "--shortcuts") >= 0)
        {
            try
            {
                var desktopLnk = ShortcutMaker.CreateDesktopShortcut();
                Console.WriteLine($"shortcut created:\n  {desktopLnk}");
                var startLnk = ShortcutMaker.UpdateExistingStartMenuShortcut();
                Console.WriteLine(startLnk is null
                    ? "start menu: 没有同名快捷方式，跳过"
                    : $"start menu updated:\n  {startLnk}");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.WriteLine("shortcuts failed: " + ex.Message);
                Environment.Exit(1);
            }
            return;
        }

        // 排查：--inspect-shortcuts 列出桌面/开始菜单里所有 ControlPod 及旧名快捷方式
        if (Array.IndexOf(cli, "--inspect-shortcuts") >= 0)
        {
            foreach (var line in ShortcutMaker.InspectAll()) Console.WriteLine(line);
            Environment.Exit(0);
            return;
        }

        // 排查：--scan 打印应用扫描的分层结果（开始菜单 / 快捷方式解析 / 商店清单 / App Paths / 最终候选），
        // 并逐个复验库里带真实入口的应用——谁会被判「入口已失效」直接点名。
        if (Array.IndexOf(cli, "--scan") >= 0)
        {
            foreach (var line in new ApplicationScanner().Diagnose()) Console.WriteLine(line);
            Environment.Exit(0);
            return;
        }

        // 壳当「看板窗口」用：--url=<地址> 时本进程加载该外部地址而不是总控台。
        // 用途：run-analytics 的跑步看板要在无边框壳里打开（浏览器小窗口观感差）。
        // 关键：它用**独立的单实例锁与独立的窗口标题** —— 总控台和看板窗口各自单实例、
        // 可同时存在，互不唤醒（共用一个锁的话，点看板会把总控台唤到前台，反了）。
        string? externalUrl = null;
        var urlIdx = Array.IndexOf(cli, "--url");
        if (urlIdx >= 0 && urlIdx + 1 < cli.Length) externalUrl = cli[urlIdx + 1];
        else
        {
            foreach (var a in cli)
                if (a.StartsWith("--url=", StringComparison.OrdinalIgnoreCase))
                    externalUrl = a["--url=".Length..];
        }

        var isConsole = string.IsNullOrWhiteSpace(externalUrl);
        var mutexName = isConsole
            ? @"Local\ApexShell_SingleInstance"
            : @"Local\ApexShell_SingleInstance_Dashboard_" + StableHash(externalUrl!);
        var windowTitle = isConsole ? "ControlPod" : "CPod 看板";

        // 单实例：已有实例在跑时，二次启动 = 唤起已有窗口，不再开新进程
        _singleInstance = new Mutex(true, mutexName, out var isNew);
        if (!isNew)
        {
            var hwnd = TrayHost.Native.FindWindowW(null, windowTitle);
            ShellLog.Log($"second launch ({windowTitle}) → activate existing hwnd={hwnd}");
            if (hwnd != IntPtr.Zero)
            {
                TrayHost.Native.ShowWindow(hwnd, 9);            // SW_RESTORE
                TrayHost.Native.SetForegroundWindow(hwnd);
            }
            Exit();
            return;
        }

        _window = new MainWindow(externalUrl);
        _window.Activate();
    }

    /// <summary>把 URL 折成一个稳定的短散列，用作单实例锁名后缀。
    /// 目标地址变了就是「另一个看板窗口」，互不冲突；同一地址则复用同一个窗口。</summary>
    private static string StableHash(string s)
    {
        unchecked
        {
            uint h = 2166136261;
            foreach (var c in s) h = (h ^ c) * 16777619;
            return h.ToString("X8");
        }
    }
}
