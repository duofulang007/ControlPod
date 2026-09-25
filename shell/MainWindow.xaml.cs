using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;

namespace ApexShell;

/// <summary>
/// 一期壳：窗口 + WebView2，用虚拟主机映射加载 apex-console 的 Web 三件套，
/// Web 层零改动。WebMessage 通信链路在下一步接入。
/// </summary>
public sealed partial class MainWindow : Window
{
    /// <summary>虚拟主机名（不含 scheme）。页面内相对路径都会解析到这个域下。</summary>
    private const string VirtualHost = "apex.local";

    /// <summary>Web 三件套所在目录（apex-console 仓库根）。</summary>
    private const string WebRoot = @"D:\Projects\apex-console";

    public MainWindow()
    {
        InitializeComponent();
        Title = "APEX 总控台";

        SetDefaultSize(1440, 900);
        SetupTrayBehavior();

        // 块4：窗口置顶走壳原生能力（AppWindow/OverlappedPresenter），Func 延迟取 _appWindow
        _localApi = new LocalApi(windowHost: new ShellWindowHost(() => _appWindow));

        Web.Loaded += async (_, _) => await InitWebViewAsync();
    }

    /* 关窗 = 缩到托盘常驻（退出走托盘右键菜单）；Toast 通知留待独立主题。 */
    private Microsoft.UI.Windowing.AppWindow? _appWindow;
    private bool _exitFromTray;
    private TrayHost? _tray;

    private void SetupTrayBehavior()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var appWindow = AppWindow.GetFromWindowId(Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd));
        _appWindow = appWindow;

        appWindow.Closing += (_, args) =>
        {
            if (_exitFromTray) return;          // 托盘菜单的「退出」放行
            args.Cancel = true;                 // 点 X 只隐藏，进程常驻
            appWindow.Hide();
            ShellLog.Log("closing → hidden to tray");
        };

        _tray = new TrayHost(this, m => ShellLog.Log(m));
        _tray.ExitRequested += () =>
        {
            ShellLog.Log("exit requested from tray menu");
            _exitFromTray = true;
            _tray?.Dispose();
            Close();
            Application.Current.Exit();
        };
    }

    private async Task InitWebViewAsync()
    {
        // 二期块7：Python 后端已下线 —— 全部路由由壳内 LocalApi 就地作答（见 CoveredRoutes
        // 与自测 routes 阶段的双向对照），不再探测/拉起 8765，壳可独立运行。
        // 非打包应用要显式指定用户数据目录，否则 WebView2 会尝试写可执行文件目录
        var userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ApexShell", "WebView2");

        // WinUI3 投影里的重载是 CreateAsync(folder) 与 CreateWithOptionsAsync(folder, userDataFolder, options)
        var env = await CoreWebView2Environment.CreateWithOptionsAsync(
            null, userDataFolder, new CoreWebView2EnvironmentOptions());
        await Web.EnsureCoreWebView2Async(env);
        _webEnv = env;   // 图标拦截建响应用

        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
            VirtualHost, WebRoot, CoreWebView2HostResourceAccessKind.Allow);

        // —— 临时诊断：一期壳联调期用，稳定后删除（ShellLog 见 TrayHost.cs）——
        void Log(string msg) => ShellLog.Log(msg);

        Web.CoreWebView2.NavigationStarting += (_, e) => Log("nav-start " + e.Uri);
        Web.CoreWebView2.NavigationCompleted += (_, e) => Log($"nav-done ok={e.IsSuccess} err={e.WebErrorStatus}");
        Web.CoreWebView2.DocumentTitleChanged += (_, _) => Log("title: " + Web.CoreWebView2.DocumentTitle);
        Web.CoreWebView2.AddWebResourceRequestedFilter(
            "https://" + VirtualHost + "/*", CoreWebView2WebResourceContext.All);
        Web.CoreWebView2.WebResourceRequested += (_, e) => Log("res-req " + e.Request.Uri);

        // 二期块2：应用图标走 <img src>，不经 WebMessage 桥 —— 在虚拟主机网络栈上拦截并本地出图。
        // 没有这段，壳里 /api/applications/scan/{id}/icon 会落进文件夹映射 404。
        Web.CoreWebView2.AddWebResourceRequestedFilter(
            "https://" + VirtualHost + "/api/applications/scan/*/icon",
            CoreWebView2WebResourceContext.All);
        Web.CoreWebView2.WebResourceRequested += OnIconResourceRequested;

        Log("=== shell start ===");
        Web.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        Web.CoreWebView2.Navigate($"https://{VirtualHost}/index.html");
    }

    /* ---------- 应用图标拦截（二期块2） ----------
       Python 版每次现扫全系统 + 现抽图标；C# 侧共享 LocalApi 里带 60s 缓存的扫描，
       抽图在后台线程做（GetDeferral 放行异步），响应对象回 UI 线程创建。 */

    private Microsoft.Web.WebView2.Core.CoreWebView2Environment? _webEnv;

    private async void OnIconResourceRequested(
        Microsoft.Web.WebView2.Core.CoreWebView2 sender,
        Microsoft.Web.WebView2.Core.CoreWebView2WebResourceRequestedEventArgs e)
    {
        var scanId = (string?)null;
        try
        {
            var path = new Uri(e.Request.Uri).AbsolutePath;
            var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
            // /api/applications/scan/{id}/icon → [api, applications, scan, {id}, icon]
            if (segments.Length == 5 && segments[2] == "scan" && segments[4] == "icon")
                scanId = segments[3];
        }
        catch { return; }
        if (scanId is null || _webEnv is null) return;

        var deferral = e.GetDeferral();
        try
        {
            var (bytes, contentType, cacheControl) = await Task.Run(() => BuildIconBody(scanId));
            var headers = $"Content-Type: {contentType}\r\nCache-Control: {cacheControl}";
            // CreateWebResourceResponse 要 IRandomAccessStream；404 也给一个空流，别传 null
            using var body = new MemoryStream(bytes ?? Array.Empty<byte>());
            e.Response = _webEnv.CreateWebResourceResponse(
                body.AsRandomAccessStream(),
                bytes is null ? 404 : 200,
                bytes is null ? "Not Found" : "OK",
                headers);
            ShellLog.Log($"local-icon {scanId} -> {(bytes is null ? 404 : 200)}");
        }
        catch (Exception ex)
        {
            ShellLog.Log($"local-icon {scanId} 失败：{ex.Message}");
        }
        finally
        {
            deferral.Complete();
        }
    }

    /// <summary>返回 (PNG 字节, image/png, 缓存头)；候选失效返回 (null, application/json, no-store)。</summary>
    private (byte[]? Bytes, string ContentType, string CacheControl) BuildIconBody(string scanId)
    {
        var candidate = _localApi.FindScanCandidate(scanId);
        if (candidate is null)
            return (null, "application/json", "no-store");
        var source = candidate.IconSource.Length > 0 ? candidate.IconSource : candidate.LaunchPath;
        var png = ApplicationScanner.ExtractIconPng(source);
        if (png is not null)
            return (png, "image/png", "private, max-age=300");
        var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" rx=\"8\" fill=\"#E8402A\"/>" +
                  "<path d=\"M10 10h12v12H10z\" fill=\"none\" stroke=\"white\" stroke-width=\"2\"/></svg>";
        return (System.Text.Encoding.UTF8.GetBytes(svg), "image/svg+xml", "private, max-age=60");
    }

    private void SetDefaultSize(int width, int height)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        if (AppWindow.GetFromWindowId(windowId) is { } appWindow)
        {
            _appWindow = appWindow;
            appWindow.Resize(new Windows.Graphics.SizeInt32(width, height));
        }
    }

    /* ---------- WebMessage → 本机后端 代理（一期桥） ----------
       协议：JS 发 {type:"api-call", id, path, method, body}；
             壳回 {type:"api-reply", id, ok, status, text} / {…, ok:false, error}。
       后端仍是 Python（127.0.0.1:8765），二期由 C# 服务原位接替它。 */

    private const string BackendBase = "http://127.0.0.1:8765/api";
    private static readonly System.Net.Http.HttpClient Http = new();

    /// <summary>二期本地路由分发器：已移植块在壳内直接作答，其余走上面的 Python 代理。</summary>
    private readonly LocalApi _localApi;

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        long id = -1;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("type", out var t))
            {
                var type = t.GetString();
                if (type == "shell-toast")
                {
                    // JS 侧运行终态的系统通知：fire-and-forget，不回帖
                    var title = root.TryGetProperty("title", out var tt) ? tt.GetString() : null;
                    var message = root.TryGetProperty("message", out var mm2) ? mm2.GetString() : null;
                    _tray?.ShowToast(title ?? "APEX 总控台", message ?? "");
                    return;
                }
                if (type != "api-call") return;
            }
            id = root.GetProperty("id").GetInt64();
            var path = root.GetProperty("path").GetString() ?? "/";
            var method = root.TryGetProperty("method", out var m) && m.GetString() is { Length: > 0 } mm ? mm : "GET";
            var body = root.TryGetProperty("body", out var b) && b.ValueKind == System.Text.Json.JsonValueKind.String
                ? b.GetString() : null;

            // 二期块7：所有路由都已移植（LocalApi.CoveredRoutes，自测 routes 阶段双向对照）。
            // 下面的 Python 代理只剩「万一漏移植」的应急兜底，正常永远不会走到。
            var local = await _localApi.HandleAsync(method, path, body);
            if (local != null)
            {
                ShellLog.Log($"local-api {method} {path} -> {local.Status}");
                sender.PostWebMessageAsJson(System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "api-reply", id, ok = true, status = local.Status, text = local.Text
                }));
                return;
            }

            ShellLog.Log($"未移植路由（漏移植？）{method} {path}，尝试应急代理 8765");
            using var req = new System.Net.Http.HttpRequestMessage(new HttpMethod(method), BackendBase + path);
            if (body != null)
                req.Content = new System.Net.Http.StringContent(body, System.Text.Encoding.UTF8, "application/json");
            var resp = await Http.SendAsync(req);
            var text = await resp.Content.ReadAsStringAsync();

            var reply = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "api-reply", id, ok = true,
                status = (int)resp.StatusCode, text
            });
            sender.PostWebMessageAsJson(reply);
        }
        catch (Exception ex)
        {
            // 失败也必须回帖，否则 JS 侧的 Promise 会永远挂着
            var reply = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "api-reply", id, ok = false, status = 0,
                error = "壳代理失败：" + ex.Message
            });
            sender.PostWebMessageAsJson(reply);
        }
    }
}
