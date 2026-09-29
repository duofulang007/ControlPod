using System;
using System.IO;

namespace ApexShell;

/// <summary>
/// 二期 C# 后端的路径配置，逐项镜像 backend/app/config.py。
/// 两套栈（Python / C#）过渡期读写同一个 SQLite 库，路径必须一字不差。
/// 硬编码的仓库根与 MainWindow.WebRoot 同源，打包前统一挪进 shell.config.json
/// （见 AGENTS.md 打包三档计划）。
/// </summary>
public static class ConsoleConfig
{
    public static string ProjectDir { get; } = @"D:\Projects\apex-console";

    public static string BackendDir { get; } = Path.Combine(ProjectDir, "backend");

    public static string ProjectsDir =>
        Environment.GetEnvironmentVariable("APEX_CONSOLE_PROJECTS_DIR")
        ?? Directory.GetParent(ProjectDir)?.FullName
        ?? throw new InvalidOperationException("无法定位 D:\\Projects 项目目录");

    public static string DataDir =>
        Environment.GetEnvironmentVariable("APEX_CONSOLE_DATA_DIR")
        ?? Path.Combine(BackendDir, "data");

    public static string DbPath =>
        Environment.GetEnvironmentVariable("APEX_CONSOLE_DB_PATH")
        ?? Path.Combine(DataDir, "apex-console.db");

    public static string ModulesDir =>
        Environment.GetEnvironmentVariable("APEX_CONSOLE_MODULES_DIR")
        ?? Path.Combine(BackendDir, "modules");

    public static string RunsDir =>
        Environment.GetEnvironmentVariable("APEX_CONSOLE_RUNS_DIR")
        ?? Path.Combine(DataDir, "runs");
}
