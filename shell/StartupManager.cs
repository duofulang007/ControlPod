using System;
using System.IO;
using System.Text.Json.Serialization;
using Microsoft.Win32;

namespace ApexShell;

/// <summary>
/// 二期 C# 版 backend/app/startup_manager.py，逐条对齐其行为（对照 90 项后端测试里的 startup 组）。
/// 两个注册表位置缺一不可：
/// - Run：真正被执行的命令，值存在且等于我们的命令才算注册上；
/// - Explorer\StartupApproved\Run：任务管理器「启动应用」的开关状态，
///   没有记录 = 默认启用；禁用会留下 03 开头的 12 字节记录而 Run 值仍在 —— 只看 Run 会假绿。
/// </summary>
public sealed class StartupManager
{
    private readonly string _valueName;
    private readonly string? _commandOverride;

    private const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ApprovedPath =
        @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    /// <summary>StartupApproved 的值是 12 字节 REG_BINARY：首 4 字节标志位 + 8 字节时间戳。
    /// 实测 02 = 启用、03 = 禁用，所以「bit0 = 1」即被禁用。</summary>
    private const int ApprovedDisabledFlag = 0x01;
    private static readonly byte[] ApprovedEnabledValue =
        { 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };

    public StartupManager(string? valueName = null, string? command = null)
    {
        _valueName = valueName ?? "APEX Console";
        _commandOverride = command;
    }

    /// <summary>开机要执行的命令：直接拉 WinUI 壳（与 Python 版 _launcher_command 同一逻辑，
    /// 命令必须一字不差，否则两边算出的 registered 会互相打架）。壳没构建时回退 console_launcher。</summary>
    public string Command => _commandOverride ?? LauncherCommand();

    public static string LauncherCommand()
    {
        var shellExe = System.IO.Path.Combine(
            ConsoleConfig.ProjectDir, "shell", "bin", "x64", "Debug",
            "net8.0-windows10.0.19041.0", "win-x64", "ApexShell.exe");
        if (File.Exists(shellExe)) return QuoteCommandLine(shellExe);
        var pythonw = System.IO.Path.Combine(ConsoleConfig.BackendDir, ".venv", "Scripts", "pythonw.exe");
        var launcher = System.IO.Path.Combine(ConsoleConfig.BackendDir, "console_launcher.py");
        return $"{QuoteCommandLine(pythonw)} {QuoteCommandLine(launcher)}";
    }

    /// <summary>subprocess.list2cmdline 的最小实现：路径含空格就整体加双引号（本项目路径不含引号字符）。</summary>
    private static string QuoteCommandLine(string path) =>
        path.Contains(' ') ? "\"" + path + "\"" : path;

    private string? ReadValue()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RegistryPath, writable: false);
            if (key == null) return null;
            var raw = key.GetValue(_valueName);
            return raw as string;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or System.IO.IOException)
        {
            throw new StartupRegistrationError($"无法读取 Windows 启动项：{ex.Message}");
        }
    }

    /// <summary>Windows 侧是否允许启动。没有记录 = 启用（多数机器上不会生成这一项）。</summary>
    private bool ReadApproved()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(ApprovedPath, writable: false);
            if (key == null) return true;
            if (key.GetValue(_valueName) is not byte[] raw || raw.Length < 4) return true;
            var flags = raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24);
            return (flags & ApprovedDisabledFlag) == 0;
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or System.IO.IOException)
        {
            throw new StartupRegistrationError($"无法读取 Windows 启动项开关：{ex.Message}");
        }
    }

    public StartupStatus Status()
    {
        var registered = ReadValue() == Command;
        var approved = ReadApproved();
        return new StartupStatus(
            Enabled: registered && approved,
            Registered: registered,
            Approved: approved,
            Command: Command);
    }

    private void WriteRunValue(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                RegistryPath, writable: true)
                ?? throw new StartupRegistrationError("无法更新 Windows 启动项：注册表键不存在");
            if (enabled)
                key.SetValue(_valueName, Command, RegistryValueKind.String);
            else
            {
                try { key.DeleteValue(_valueName, throwOnMissingValue: false); }
                catch (System.ArgumentException) { /* 本来就没有，同 Python 版吞掉 */ }
            }
        }
        catch (StartupRegistrationError) { throw; }
        catch (Exception ex) when (ex is System.Security.SecurityException or System.IO.IOException
                                   or UnauthorizedAccessException)
        {
            throw new StartupRegistrationError($"无法更新 Windows 启动项：{ex.Message}");
        }
    }

    /// <summary>同步任务管理器里的那个开关。少了这一步，「开启」会被上一次的禁用记录压过去
    /// （Run 写成功但 status() 仍算未启用，用户看到开关自己弹回去）。
    /// 开启时把禁用记录改回启用；关闭时顺手把这条记录清掉。</summary>
    private void WriteApproved(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(ApprovedPath, writable: true);
            if (key == null)
            {
                if (!enabled) return; // 本来就没有记录要清，不必凭空建这个键
                using var created = Registry.CurrentUser.CreateSubKey(ApprovedPath, writable: true);
                created.SetValue(_valueName, ApprovedEnabledValue, RegistryValueKind.Binary);
                return;
            }
            if (enabled)
                key.SetValue(_valueName, ApprovedEnabledValue, RegistryValueKind.Binary);
            else
            {
                try { key.DeleteValue(_valueName, throwOnMissingValue: false); }
                catch (System.ArgumentException) { /* 本来就没有 */ }
            }
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or System.IO.IOException
                                   or UnauthorizedAccessException)
        {
            throw new StartupRegistrationError($"无法更新 Windows 启动项开关：{ex.Message}");
        }
    }

    public StartupStatus SetEnabled(bool enabled)
    {
        WriteRunValue(enabled);
        WriteApproved(enabled);

        var state = Status();
        if (state.Enabled != enabled)
            throw new StartupRegistrationError("Windows 启动项写入后校验失败");
        return state;
    }
}

/// <summary>与 Python 版 status() 返回的 JSON 字段一一对应（键名必须保持 Python 的小写蛇形）。</summary>
public sealed record StartupStatus(
    [property: JsonPropertyName("enabled")] bool Enabled,
    [property: JsonPropertyName("registered")] bool Registered,
    [property: JsonPropertyName("approved")] bool Approved,
    [property: JsonPropertyName("command")] string Command);

/// <summary>与 Python 版 StartupRegistrationError 同名对应：路由层映射为 503。</summary>
public sealed class StartupRegistrationError : Exception
{
    public StartupRegistrationError(string message) : base(message) { }
}
