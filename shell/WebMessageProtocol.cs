using System;
using System.Text.Json;

namespace ApexShell;

/// <summary>页面与桌面壳之间唯一的消息协议；负责校验输入与生成统一回帖。</summary>
internal static class WebMessageProtocol
{
    internal sealed record Request(
        string Type, long Id = -1, string Path = "/", string Method = "GET",
        string? Body = null, string? Command = null, string? Value = null,
        string? Title = null, string? Message = null);

    private static readonly string[] ApiMethods = { "GET", "POST", "PUT", "PATCH", "DELETE" };

    internal static Request Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            throw new JsonException("壳消息必须是对象");
        var type = RequiredString(root, "type");

        if (type == "shell-toast")
            return new Request(type, Title: OptionalString(root, "title"), Message: OptionalString(root, "message"));
        if (type == "chrome-command")
            return new Request(type, Command: RequiredString(root, "command"), Value: OptionalString(root, "value"));
        if (type != "api-call")
            return new Request(type);

        if (!root.TryGetProperty("id", out var idValue) || !idValue.TryGetInt64(out var id) || id < 0)
            throw new JsonException("api-call.id 必须是非负整数");
        var path = RequiredString(root, "path");
        if (!path.StartsWith("/", StringComparison.Ordinal))
            throw new JsonException("api-call.path 必须以 / 开头");
        var method = (OptionalString(root, "method") ?? "GET").ToUpperInvariant();
        if (Array.IndexOf(ApiMethods, method) < 0)
            throw new JsonException("api-call.method 不受支持");
        var body = OptionalString(root, "body");
        return new Request(type, id, path, method, body);
    }

    internal static string Success(long id, LocalApi.Reply reply) => JsonSerializer.Serialize(new
    {
        type = "api-reply", id, ok = true, status = reply.Status, text = reply.Text,
    });

    internal static string Failure(long id, Exception error) => JsonSerializer.Serialize(new
    {
        type = "api-reply", id, ok = false, status = 0,
        error = "本地 API 失败：" + error.Message,
    });

    private static string RequiredString(JsonElement root, string name) =>
        OptionalString(root, name) is { Length: > 0 } value
            ? value : throw new JsonException($"{name} 必须是非空字符串");

    private static string? OptionalString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        if (value.ValueKind != JsonValueKind.String) throw new JsonException($"{name} 必须是字符串或 null");
        return value.GetString();
    }
}
