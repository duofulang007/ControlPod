using System;
using System.Collections.Generic;
using Microsoft.UI.Windowing;

namespace ApexShell;

public sealed class ConsoleWindowError : Exception
{
    public ConsoleWindowError(string message) : base(message) { }
}

/// <summary>
/// 窗口置顶控制面。Python 版（window_manager.py）要 EnumWindows 找「ControlPod」浏览器窗口
/// 再 SetWindowPos；壳里目标就是自己这扇原生窗口，直接走 WinUI 的
/// OverlappedPresenter.IsAlwaysOnTop —— 「topmost 对壳是原生能力」。
/// 接口化是为了自测能在无窗口环境注入假实现。
/// </summary>
public interface IConsoleWindowHost
{
    Dictionary<string, object?> Status();
    Dictionary<string, object?> SetTopmost(bool enabled);
}

public sealed class ShellWindowHost : IConsoleWindowHost
{
    /// <summary>AppWindow 的提供者：窗口可能尚未创建或已被重建，每次现取。</summary>
    private readonly Func<AppWindow?> _provider;

    public ShellWindowHost(Func<AppWindow?> provider) => _provider = provider;

    public Dictionary<string, object?> Status()
    {
        var appWindow = _provider();
        if (appWindow is null)
            return Unavailable();
        var presenter = appWindow.Presenter as OverlappedPresenter;
        var size = appWindow.Size;
        return new Dictionary<string, object?>
        {
            ["available"] = true,
            ["topmost"] = presenter?.IsAlwaysOnTop ?? false,
            ["width"] = size.Width,
            ["height"] = size.Height,
        };
    }

    public Dictionary<string, object?> SetTopmost(bool enabled)
    {
        var appWindow = _provider()
            ?? throw new ConsoleWindowError("没有可控制的 ControlPod 窗口，请先打开 ControlPod");
        if (appWindow.Presenter is not OverlappedPresenter presenter)
            throw new ConsoleWindowError("当前窗口形态不支持置顶");
        presenter.IsAlwaysOnTop = enabled;
        var state = Status();
        if ((state["topmost"] as bool?) != enabled)
            throw new ConsoleWindowError("窗口置顶操作后校验失败");
        return state;
    }

    private static Dictionary<string, object?> Unavailable() => new()
    {
        ["available"] = false, ["topmost"] = false, ["width"] = 990, ["height"] = 700,
    };
}
