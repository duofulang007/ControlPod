using System;
using System.IO;

namespace ApexShell;

/// <summary>
/// ControlPod 的源码、外部项目与本机运行数据路径。
/// 运行数据统一放 LocalAppData，避免数据库、日志和运行产物污染源码仓库。
/// </summary>
public static class ConsoleConfig
{
    public static string ProjectDir { get; } = @"D:\Projects\ControlPod";

    /// <summary>开发构建直接映射源码以便 F5；安装版使用发布目录内自带的 wwwroot。</summary>
    public static string WebRoot
    {
        get
        {
            var baseDir = Path.GetFullPath(AppContext.BaseDirectory);
            var projectDir = Path.GetFullPath(ProjectDir).TrimEnd(Path.DirectorySeparatorChar);
            if (baseDir.StartsWith(projectDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return projectDir;
            var bundled = Path.Combine(baseDir, "wwwroot");
            return File.Exists(Path.Combine(bundled, "index.html")) ? bundled : projectDir;
        }
    }

    public static string RuntimeDir { get; } =
        Environment.GetEnvironmentVariable("CONTROLPOD_RUNTIME_DIR")
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ControlPod");

    public static string ProjectsDir =>
        Environment.GetEnvironmentVariable("CONTROLPOD_PROJECTS_DIR")
        ?? Environment.GetEnvironmentVariable("APEX_CONSOLE_PROJECTS_DIR")
        ?? Directory.GetParent(ProjectDir)?.FullName
        ?? throw new InvalidOperationException("无法定位 D:\\Projects 项目目录");

    public static string DataDir =>
        Environment.GetEnvironmentVariable("CONTROLPOD_DATA_DIR")
        ?? Environment.GetEnvironmentVariable("APEX_CONSOLE_DATA_DIR")
        ?? RuntimeDir;

    public static string DbPath =>
        Environment.GetEnvironmentVariable("CONTROLPOD_DB_PATH")
        ?? Environment.GetEnvironmentVariable("APEX_CONSOLE_DB_PATH")
        ?? Path.Combine(DataDir, "controlpod.db");

    public static string ModulesDir =>
        Environment.GetEnvironmentVariable("CONTROLPOD_MODULES_DIR")
        ?? Environment.GetEnvironmentVariable("APEX_CONSOLE_MODULES_DIR")
        ?? Path.Combine(RuntimeDir, "modules");

    public static string RunsDir =>
        Environment.GetEnvironmentVariable("CONTROLPOD_RUNS_DIR")
        ?? Environment.GetEnvironmentVariable("APEX_CONSOLE_RUNS_DIR")
        ?? Path.Combine(DataDir, "runs");
}
