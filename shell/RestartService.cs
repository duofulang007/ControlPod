using System;
using System.Diagnostics;
using System.IO;

namespace ApexShell;

internal static class RestartService
{
    internal static void StartReplacement()
    {
        var executable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable))
            throw new IOException("无法确认当前 CPod 启动入口");
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(executable)!
        };
        start.ArgumentList.Add("--restart-after");
        start.ArgumentList.Add(Environment.ProcessId.ToString());
        using var replacement = Process.Start(start) ?? throw new IOException("无法启动新的 CPod 进程");
    }

    internal static void WaitForPreviousProcess(int previousPid, int timeoutMs = 30000)
    {
        if (previousPid <= 0 || previousPid == Environment.ProcessId)
            throw new ArgumentException("重启进程编号无效");
        Process previous;
        try { previous = Process.GetProcessById(previousPid); }
        catch (ArgumentException) { return; } // 旧进程已退出。
        using (previous)
        {
            if (!previous.WaitForExit(timeoutMs))
                throw new TimeoutException("旧 CPod 未完全退出，已停止重启");
        }
    }
}
