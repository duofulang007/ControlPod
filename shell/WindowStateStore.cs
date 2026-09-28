using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ApexShell;

/// <summary>
/// 壳窗口的位置与尺寸持久化（2026-09-28 新增）。
///
/// 背景：此前壳窗口每次启动都走 ApplyDefaultPlacement(1440, 900) 固定居中，
/// 用户拖动 / 调整后的布局下次启动就丢。这里补上「记住上次位置和大小」。
///
/// 设计要点：
/// ① **按窗口角色分文件**：总控台与跑步看板是两个独立的壳窗口（各自单实例、可同时存在），
///    它们的位置尺寸必须互不干扰，所以状态文件按 role 命名（shell-window-console.json /
///    shell-window-dashboard.json），而不是共用一份。
/// ② **读失败一律退回默认摆放**，绝不因为状态文件损坏 / 字段缺失就让窗口开在屏幕外。
///    宁可回到「居中默认尺寸」，也不要把标题栏丢到看不见的地方（那时用户根本拖不回来）。
/// ③ **越界校验**：显示器拔掉 / 分辨率变化后，旧坐标可能落在所有显示器之外。
///    这里只做「尺寸钳到工作区」和「位置必须与该显示器工作区有足够重叠」两道保护，
///    真正落不上去时由调用方退回居中。
/// ④ **写盘是尽力而为**：磁盘满 / 无权限时只记日志，不影响窗口正常使用。
/// </summary>
public sealed class WindowStateStore
{
    /// <summary>窗口角色：决定状态文件名，保证不同壳窗口的布局互不覆盖。</summary>
    public enum Role
    {
        Console,     // 总控台
        Dashboard,   // 外部看板（--url 打开的那种）
    }

    /// <summary>持久化的窗口几何。字段全部可空，缺失即视为「没有可用状态」。</summary>
    public sealed class WindowState
    {
        [JsonPropertyName("x")] public int? X { get; set; }
        [JsonPropertyName("y")] public int? Y { get; set; }
        [JsonPropertyName("width")] public int? Width { get; set; }
        [JsonPropertyName("height")] public int? Height { get; set; }
        [JsonPropertyName("maximized")] public bool? Maximized { get; set; }

        /// <summary>位置与尺寸都齐全才算可用；只有一半的状态没有意义。</summary>
        [JsonIgnore]
        public bool HasPlacement =>
            X.HasValue && Y.HasValue && Width.HasValue && Height.HasValue
            && Width.Value > 0 && Height.Value > 0;

        /// <summary>位置与尺寸都缺、但记了「上次是最大化」——用来单独还原最大化态。</summary>
        [JsonIgnore]
        public bool IsMaximizedOnly => Maximized == true && !HasPlacement;
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _path;
    private readonly Action<string>? _log;

    public string Path => _path;

    public WindowStateStore(Role role, Action<string>? log = null)
    {
        _log = log;
        var name = role == Role.Console ? "shell-window-console.json" : "shell-window-dashboard.json";
        _path = System.IO.Path.Combine(ConsoleConfig.DataDir, name);
    }

    /// <summary>读上次状态。文件不存在 / 解析失败 / 字段不全 → 返回 null（调用方退回默认摆放）。</summary>
    public WindowState? Load()
    {
        try
        {
            if (!File.Exists(_path))
            {
                _log?.Invoke($"window-state: 无历史状态（{System.IO.Path.GetFileName(_path)}）");
                return null;
            }

            var text = File.ReadAllText(_path);
            if (string.IsNullOrWhiteSpace(text)) return null;

            var state = JsonSerializer.Deserialize<WindowState>(text, JsonOpts);
            if (state is null)
            {
                _log?.Invoke("window-state: 内容为空，退回默认摆放");
                return null;
            }

            _log?.Invoke($"window-state: 读到 x={state.X} y={state.Y} w={state.Width} h={state.Height} max={state.Maximized}");
            return state;
        }
        catch (Exception ex)
        {
            // 损坏的状态文件不该让窗口开不出来 —— 如实记因，退回默认
            _log?.Invoke("window-state: 读取失败，退回默认摆放 — " + ex.Message);
            return null;
        }
    }

    /// <summary>写当前状态。尽力而为，失败只记日志。</summary>
    public void Save(WindowState state)
    {
        try
        {
            var dir = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(_path, JsonSerializer.Serialize(state, JsonOpts));
        }
        catch (Exception ex)
        {
            _log?.Invoke("window-state: 保存失败（不影响窗口使用）— " + ex.Message);
        }
    }
}
