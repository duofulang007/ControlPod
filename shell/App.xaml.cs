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

        // 一键生成快捷方式：--shortcuts（桌面一个，指向当前 exe）
        if (Array.IndexOf(cli, "--shortcuts") >= 0)
        {
            try
            {
                var desktopLnk = ShortcutMaker.CreateDesktopShortcut();
                Console.WriteLine($"shortcut created:\n  {desktopLnk}");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.WriteLine("shortcuts failed: " + ex.Message);
                Environment.Exit(1);
            }
            return;
        }

        // 排查：--inspect-shortcuts 列出桌面/开始菜单里所有 APEX 快捷方式及其真实目标
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

        // 单实例：已有实例在跑时，二次启动 = 唤起已有窗口，不再开新进程
        _singleInstance = new Mutex(true, @"Local\ApexShell_SingleInstance", out var isNew);
        if (!isNew)
        {
            var hwnd = TrayHost.Native.FindWindowW(null, "APEX 总控台");
            ShellLog.Log($"second launch → activate existing hwnd={hwnd}");
            if (hwnd != IntPtr.Zero)
            {
                TrayHost.Native.ShowWindow(hwnd, 9);            // SW_RESTORE
                TrayHost.Native.SetForegroundWindow(hwnd);
            }
            Exit();
            return;
        }

        _window = new MainWindow();
        _window.Activate();
    }
}
