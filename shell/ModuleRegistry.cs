using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ApexShell;

/* 二期 C# 版 backend/app/module_registry.py，逐字段对齐：
   id 正则 ^[a-z][a-z0-9-]{1,63}$、schemaVersion==1、actions.run 必有、
   timeoutSeconds 1..1800、projectRoot 支持 {console_root} 占位符/绝对/相对（相对 console 根解析，
   不按 cwd——cwd 取决于谁拉起服务，Python 版踩过）、cwd 支持 {module_dir}/{project_root}。 */

public sealed record ModuleActionDef(string Program, IReadOnlyList<string> Args, string Cwd);

public sealed record ModuleDefinition(
    string Id,
    string ProjectId,
    string ProjectName,
    string ProjectDescription,
    string Name,
    string Version,
    string ModuleDir,
    string ProjectRoot,
    IReadOnlyDictionary<string, ModuleActionDef> Actions,
    bool RequiresAdmin,
    bool SingleInstance,
    int TimeoutSeconds,
    string ManifestPath);

public sealed class ModuleRegistryError : Exception
{
    public ModuleRegistryError(string message) : base(message) { }
}

public sealed class ModuleRegistry
{
    public const string DefaultProjectName = "APEX 启动";
    public const string DefaultProjectDescription = "一键启动 AK、Steam 与 APEX，不启动旧前端。";

    private static readonly Regex IdRegex = new("^[a-z][a-z0-9-]{1,63}$", RegexOptions.Compiled);

    private readonly string _root;
    private Dictionary<string, ModuleDefinition> _modules = new(StringComparer.Ordinal);

    public ModuleRegistry(string root) => _root = root;

    /// <summary>modules 目录默认 &lt;console&gt;/backend/modules，往上两级即 console 根。
    /// manifest 的 projectRoot 与动作参数都可写 {console_root}，两处必须同一口径。</summary>
    public string ConsoleRoot => Path.GetFullPath(Path.Combine(_root, "..", ".."));

    public IReadOnlyList<ModuleDefinition> All() => _modules.Values.ToList();

    public ModuleDefinition? Get(string moduleId) =>
        _modules.TryGetValue(moduleId, out var value) ? value : null;

    public IReadOnlyDictionary<string, ModuleDefinition> Load()
    {
        var modules = new Dictionary<string, ModuleDefinition>(StringComparer.Ordinal);
        if (Directory.Exists(_root))
        {
            // 与 Python 版 glob("*/module.json") 同义：只扫一层子目录
            var manifestPaths = Directory.EnumerateDirectories(_root)
                .Select(dir => Path.Combine(dir, "module.json"))
                .Where(File.Exists)
                .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                .ToList();
            foreach (var path in manifestPaths)
            {
                var item = LoadOne(path);
                if (modules.ContainsKey(item.Id))
                    throw new ModuleRegistryError($"模块 id 重复：{item.Id}");
                modules[item.Id] = item;
            }
        }
        _modules = modules;
        return modules;
    }

    private static string RequiredText(JsonElement data, string key, string source)
    {
        if (!data.TryGetProperty(key, out var el) || el.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(el.GetString()))
            throw new ModuleRegistryError($"{source}: {key} 必须是非空字符串");
        return el.GetString()!.Trim();
    }

    private ModuleDefinition LoadOne(string path)
    {
        JsonElement data;
        try
        {
            data = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            throw new ModuleRegistryError($"{path}: manifest 不是可读的 JSON（{ex.Message}）");
        }
        var moduleId = RequiredText(data, "id", path);
        if (!IdRegex.IsMatch(moduleId))
            throw new ModuleRegistryError($"{path}: 非法模块 id");
        if (!data.TryGetProperty("schemaVersion", out var schemaEl) || schemaEl.GetInt32() != 1)
            throw new ModuleRegistryError($"{path}: 不支持的 schemaVersion");
        if (!data.TryGetProperty("actions", out var actionsRaw) || actionsRaw.ValueKind != JsonValueKind.Object
            || !actionsRaw.TryGetProperty("run", out var runRaw) || runRaw.ValueKind != JsonValueKind.Object)
            throw new ModuleRegistryError($"{path}: 缺少 actions.run");

        var moduleDir = Path.GetFullPath(Path.GetDirectoryName(path)!);
        var consoleRoot = ConsoleRoot;
        var projectRootRaw = RequiredText(data, "projectRoot", path);
        var expanded = projectRootRaw.Replace("{console_root}", consoleRoot);
        if (!Path.IsPathRooted(expanded))
            expanded = Path.Combine(consoleRoot, expanded);
        var projectRoot = Path.GetFullPath(expanded);

        var actions = new Dictionary<string, ModuleActionDef>(StringComparer.Ordinal);
        foreach (var action in actionsRaw.EnumerateObject())
        {
            if (!IdRegex.IsMatch(action.Name))
                throw new ModuleRegistryError($"{path}: 非法 action 名称");
            if (action.Value.ValueKind != JsonValueKind.Object)
                throw new ModuleRegistryError($"{path}: actions.{action.Name} 必须是对象");
            var args = new List<string>();
            if (action.Value.TryGetProperty("args", out var argsRaw))
            {
                if (argsRaw.ValueKind != JsonValueKind.Array)
                    throw new ModuleRegistryError($"{path}: actions.{action.Name}.args 必须是字符串数组");
                foreach (var arg in argsRaw.EnumerateArray())
                {
                    if (arg.ValueKind != JsonValueKind.String)
                        throw new ModuleRegistryError($"{path}: actions.{action.Name}.args 必须是字符串数组");
                    args.Add(arg.GetString()!);
                }
            }
            var cwdRaw = action.Value.TryGetProperty("cwd", out var cwdEl) && cwdEl.ValueKind == JsonValueKind.String
                ? cwdEl.GetString()! : "{module_dir}";
            var cwd = Path.GetFullPath(cwdRaw
                .Replace("{module_dir}", moduleDir)
                .Replace("{project_root}", projectRoot));
            actions[action.Name] = new ModuleActionDef(RequiredText(action.Value, "program", path), args, cwd);
        }

        var timeout = data.TryGetProperty("timeoutSeconds", out var timeoutEl) && timeoutEl.TryGetInt32(out var t)
            ? t : 240;
        if (timeout < 1 || timeout > 1800)
            throw new ModuleRegistryError($"{path}: timeoutSeconds 必须在 1..1800");
        var projectName = data.TryGetProperty("projectName", out var pnEl) && pnEl.ValueKind == JsonValueKind.String
            ? pnEl.GetString()!.Trim() : "";
        var projectDescription = data.TryGetProperty("projectDescription", out var pdEl)
            && pdEl.ValueKind == JsonValueKind.String ? pdEl.GetString()!.Trim() : "";

        return new ModuleDefinition(
            Id: moduleId,
            ProjectId: RequiredText(data, "projectId", path),
            ProjectName: projectName.Length > 0 ? projectName : DefaultProjectName,
            ProjectDescription: projectDescription.Length > 0 ? projectDescription : DefaultProjectDescription,
            Name: RequiredText(data, "name", path),
            Version: RequiredText(data, "version", path),
            ModuleDir: moduleDir,
            ProjectRoot: projectRoot,
            Actions: actions,
            RequiresAdmin: data.TryGetProperty("requiresAdmin", out var raEl) && raEl.ValueKind == JsonValueKind.True,
            SingleInstance: !data.TryGetProperty("singleInstance", out var siEl) || siEl.ValueKind != JsonValueKind.False,
            TimeoutSeconds: timeout,
            ManifestPath: Path.GetFullPath(path));
    }
}
