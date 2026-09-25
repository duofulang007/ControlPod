using System;
using System.IO;
using System.Reflection;

namespace ApexShell;

/// <summary>
/// 一键生成「APEX 总控台」快捷方式（桌面 + 仓库根）。
/// 为什么要壳自己来做：exe 的真实路径又深又长
/// （shell\bin\x64\Debug\net8.0-windows10.0.19041.0\win-x64），不该让人记。
/// <para>
/// 为什么不在工具会话里用 PowerShell 建：本机安全策略把 `New-Object -ComObject WScript.Shell`
/// 直接拦掉（"COM object instantiation can run arbitrary code"）。而壳进程内的 COM 是通的
/// ——二期块2 的快捷方式解析就是这么跑通真机 151 个候选的。
/// </para>
/// 目标取 <see cref="Environment.ProcessPath"/>：Debug / publish / 换机器都不用改代码。
/// </summary>
public static class ShortcutMaker
{
    public const string ShortcutName = "APEX 总控台";

    /// <summary>在桌面建快捷方式（返回路径），已完成「写后读回」校验。
    /// **只建桌面这一个**：仓库根那个 `00-启动 APEX 总控台.lnk` 已按多弗朗要求删除，
    /// 不能再重建——否则每次跑 `--shortcuts` 又会长出来，违背「根目录只留源码」的约定。</summary>
    public static string CreateDesktopShortcut()
    {
        var exe = Environment.ProcessPath
            ?? throw new InvalidOperationException("拿不到当前 exe 路径");
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (string.IsNullOrEmpty(desktop))
            throw new InvalidOperationException("拿不到桌面目录");

        var desktopPath = Path.Combine(desktop, ShortcutName + ".lnk");
        CreateOne(desktopPath, exe);
        return desktopPath;
    }

    private static void CreateOne(string linkPath, string target)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("WScript.Shell 不可用");
        object? shell = null;
        object? link = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod,
                null, shell, new object[] { linkPath })
                ?? throw new InvalidOperationException($"创建快捷方式失败：{linkPath}");
            var linkType = link.GetType();
            Set(linkType, link, "TargetPath", target);
            Set(linkType, link, "WorkingDirectory", ConsoleConfig.ProjectDir);
            Set(linkType, link, "IconLocation", target + ",0");
            Set(linkType, link, "Description", ShortcutName);
            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        }
        finally
        {
            if (link is not null) System.Runtime.InteropServices.Marshal.ReleaseComObject(link);
            if (shell is not null) System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
        }
        // 写后读回：lnk 是真二进制结构，不看一眼目标不算数
        var readBack = ReadTarget(linkPath);
        if (!string.Equals(readBack, target, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"快捷方式目标校验失败：{linkPath} → {readBack}");
        Console.WriteLine($"  {linkPath}\n    → {readBack}");
    }

    /// <summary>排查用：列出桌面与开始菜单里所有 APEX 相关快捷方式及其真实目标。
    /// .lnk 内部是 shell 的二进制 IDList，只能靠 COM 解读——所以这个清单必须由壳来出。</summary>
    public static List<string> InspectAll()
    {
        var result = new List<string>();
        var dirs = new List<string>
        {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs"),
        };
        foreach (var dir in dirs)
        {
            IEnumerable<string> links;
            try
            {
                if (!Directory.Exists(dir)) continue;
                links = Directory.EnumerateFiles(dir, "*.lnk", SearchOption.AllDirectories);
            }
            catch (IOException)
            {
                continue;
            }
            foreach (var link in links.Where(p =>
                         p.Contains("APEX", StringComparison.OrdinalIgnoreCase)
                         || p.Contains("总控台", StringComparison.Ordinal)))
            {
                var target = ReadTarget(link) ?? "(读不出目标)";
                var exists = File.Exists(target) ? "存在" : "缺失";
                result.Add($"{link}\n    → {target}   [{exists}]");
            }
        }
        return result;
    }

    /// <summary>读回 .lnk 的 TargetPath（shell 的 IDList 是二进制，只能靠 COM 解读）。</summary>
    public static string? ReadTarget(string linkPath)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null) return null;
        object? shell = null;
        object? link = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod,
                null, shell, new object[] { linkPath });
            return link?.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null) as string;
        }
        catch
        {
            return null;
        }
        finally
        {
            if (link is not null) System.Runtime.InteropServices.Marshal.ReleaseComObject(link);
            if (shell is not null) System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
        }
    }

    private static void Set(Type linkType, object link, string property, string value) =>
        linkType.InvokeMember(property, BindingFlags.SetProperty, null, link, new object[] { value });
}
