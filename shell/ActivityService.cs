using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace ApexShell;

/// <summary>
/// 二期 C# 版 main.py 的 activity 面：heartbeat 上报（按本机本地日累加在线分钟）
/// + daily 聚合（在线分钟来自 activity_heartbeats；代码增删来自扫描全局代码目录下
/// 各 git 仓库的 --numstat，5 分钟进程内缓存）。非 git 目录 / git 不可用一律跳过，
/// 不让代码统计失败影响页面（与 Python 版同语义）。
/// </summary>
public sealed class ActivityService
{
    private readonly Db _db;
    /// <summary>activity_config.json 所在目录（Python 是 db.path.parent，即 backend/data）。</summary>
    private readonly string _dataDir;
    /// <summary>自测注入：直接给定代码目录集合，跳过配置文件读取。</summary>
    private readonly IReadOnlyList<string>? _codeDirsOverride;

    private readonly object _cacheLock = new();
    private Dictionary<string, Dictionary<string, long>>? _cachedChanges;
    private string? _cachedKey;
    private DateTimeOffset _cachedAt = DateTimeOffset.MinValue;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    public ActivityService(Db db, string? dataDir = null, IReadOnlyList<string>? codeDirsOverride = null)
    {
        _db = db;
        _dataDir = dataDir ?? ConsoleConfig.DataDir;
        _codeDirsOverride = codeDirsOverride;
    }

    /* ---------- POST /activity/heartbeat ---------- */

    public Dictionary<string, object?> Heartbeat()
    {
        var day = LocalDay(DateTimeOffset.Now);
        _db.Execute(
            "INSERT INTO activity_heartbeats(day,minutes,updated_at) VALUES(@p0,1,@p1) " +
            "ON CONFLICT(day) DO UPDATE SET minutes=minutes+1, updated_at=excluded.updated_at",
            day, Db.UtcNow());
        var row = _db.FetchOne("SELECT minutes FROM activity_heartbeats WHERE day=@p0", day);
        return new Dictionary<string, object?>
        {
            ["day"] = day,
            ["minutes"] = row is null ? 1L : Convert.ToInt64(row.GetValueOrDefault("minutes") ?? 1),
        };
    }

    /* ---------- GET /activity/daily?days=371 ---------- */

    public List<Dictionary<string, object?>> Daily(int days)
    {
        var span = Math.Clamp(days, 1, 400);
        var today = DateTimeOffset.Now.Date;
        var first = today.AddDays(-(span - 1));

        var online = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var row in _db.FetchAll("SELECT day,minutes FROM activity_heartbeats"))
        {
            var key = (row.GetValueOrDefault("day") as string) ?? "";
            if (key.Length > 0)
                online[key] = Convert.ToInt64(row.GetValueOrDefault("minutes") ?? 0);
        }

        var changes = GitCodeChanges(span);
        var payload = new List<Dictionary<string, object?>>(span);
        for (var offset = 0; offset < span; offset++)
        {
            var key = first.AddDays(offset).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var onlineMinutes = online.GetValueOrDefault(key, 0);
            var adds = changes.GetValueOrDefault(key)?.GetValueOrDefault("adds", 0) ?? 0;
            var dels = changes.GetValueOrDefault(key)?.GetValueOrDefault("dels", 0) ?? 0;
            payload.Add(new Dictionary<string, object?>
            {
                ["date"] = key,
                ["online"] = onlineMinutes,
                ["adds"] = adds,
                ["dels"] = dels,
                ["count"] = onlineMinutes + adds + dels,   // 接口兼容保留，前端底色只用 online
            });
        }
        return payload;
    }

    internal static string LocalDay(DateTimeOffset value) => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /* ---------- 代码增删：扫描全局代码目录下的 git 仓库 ---------- */

    /// <summary>codeDirs 语义（与本机约定一致）：填仓库的父目录、只扫一层不递归、
    /// [] = 彻底关闭（≠ 回退默认）。缺省 D:\Projects。</summary>
    internal IReadOnlyList<string> CodeDirs()
    {
        if (_codeDirsOverride is not null)
            return _codeDirsOverride.Where(Directory.Exists).ToList();
        var raw = new List<string> { @"D:\Projects" };
        try
        {
            var cfgPath = Path.Combine(_dataDir, "activity_config.json");
            if (File.Exists(cfgPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(cfgPath));
                if (doc.RootElement.TryGetProperty("codeDirs", out var dirs) && dirs.ValueKind == JsonValueKind.Array)
                {
                    raw = dirs.EnumerateArray()
                        .Where(d => d.ValueKind == JsonValueKind.String)
                        .Select(d => d.GetString()!)
                        .ToList();
                }
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            raw = new List<string> { @"D:\Projects" };
        }
        return raw.Where(Directory.Exists).ToList();
    }

    internal Dictionary<string, Dictionary<string, long>> GitCodeChanges(int sinceDays)
    {
        var bases = CodeDirs();
        var since = LocalDay(DateTimeOffset.Now.AddDays(-Math.Max(1, sinceDays)));
        var key = string.Join("\u0001", bases) + "\u0002" + since;
        lock (_cacheLock)
        {
            if (_cachedChanges is not null && _cachedKey == key
                && DateTimeOffset.UtcNow - _cachedAt < CacheTtl)
                return _cachedChanges;
        }

        var buckets = new Dictionary<string, Dictionary<string, long>>(StringComparer.Ordinal);
        foreach (var baseDir in bases)
        {
            List<string> repos;
            try
            {
                repos = Directory.EnumerateDirectories(baseDir)
                    .Where(dir => Directory.Exists(Path.Combine(dir, ".git")))
                    .OrderBy(dir => dir, StringComparer.Ordinal)
                    .ToList();
            }
            catch (IOException)
            {
                continue;
            }
            foreach (var repo in repos)
            {
                var stdout = RunGitNumstat(repo, since);
                if (stdout is null) continue;
                MergeNumstat(buckets, stdout);
            }
        }

        lock (_cacheLock)
        {
            _cachedChanges = buckets;
            _cachedKey = key;
            _cachedAt = DateTimeOffset.UtcNow;
        }
        return buckets;
    }

    /// <summary>git 不可用 / 仓库异常一律返回 null（跳过），不让统计失败影响页面。</summary>
    private static string? RunGitNumstat(string repo, string since)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "git",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = new UTF8Encoding(false),
            };
            foreach (var arg in new[]
                     {
                         "-C", repo, "log", $"--since={since}", "--date=short-local",
                         "--pretty=format:@@%ad", "--numstat",
                     })
                psi.ArgumentList.Add(arg);
            using var proc = Process.Start(psi);
            if (proc is null) return null;
            var stdout = proc.StandardOutput.ReadToEnd();
            if (!proc.WaitForExit(60000)) { try { proc.Kill(entireProcessTree: true); } catch { } return null; }
            return proc.ExitCode == 0 ? stdout : null;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            return null;
        }
    }

    /// <summary>解析 --numstat 输出（@@日期 切桶；二进制行的 `-` 计不出数就跳过）。</summary>
    internal static void MergeNumstat(Dictionary<string, Dictionary<string, long>> buckets, string stdout)
    {
        var day = "";
        foreach (var rawLine in stdout.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.StartsWith("@@", StringComparison.Ordinal))
            {
                day = line[2..].Trim();
                day = day.Length >= 10 ? day[..10] : day;
                continue;
            }
            if (day.Length == 0 || line.Length == 0) continue;
            var parts = line.Split('\t');
            if (parts.Length < 2) continue;
            if (!long.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var adds)
                || !long.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var dels))
                continue;
            if (!buckets.TryGetValue(day, out var slot))
                buckets[day] = slot = new Dictionary<string, long>(StringComparer.Ordinal);
            slot["adds"] = slot.GetValueOrDefault("adds", 0) + adds;
            slot["dels"] = slot.GetValueOrDefault("dels", 0) + dels;
        }
    }
}
