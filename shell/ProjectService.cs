using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace ApexShell;

/* 异常与 Python 版 project_service 的映射一致：
   ProjectNotFound/TaskNotFound/NoteNotFound→404  BasicInfoValidation/ProjectOrder/ProjectFile→422  ProjectConflict→409 */

public sealed class ProjectMissingError : Exception { public ProjectMissingError(string m) : base(m) { } }
public sealed class ProjectConflictError : Exception { public ProjectConflictError(string m) : base(m) { } }
public sealed class TaskMissingError : Exception { public TaskMissingError(string m) : base(m) { } }
public sealed class NoteMissingError : Exception { public NoteMissingError(string m) : base(m) { } }
public sealed class BasicInfoInvalidError : Exception { public BasicInfoInvalidError(string m) : base(m) { } }
public sealed class ProjectOrderInvalidError : Exception { public ProjectOrderInvalidError(string m) : base(m) { } }
public sealed class ProjectFileInvalidError : Exception { public ProjectFileInvalidError(string m) : base(m) { } }

public sealed record BasicInfoTaskInput(string? Id, string Title, string? DueDate, string Priority, string Kind);
public sealed record BasicInfoNoteInput(string? Id, string Title, string Tag);

/// <summary>
/// 二期 C# 版 services/project_service.py + repositories/project_repository.py（两层合一：
/// C# 的 Db 本身就是 SQL 门面，再拆 repository 没有意义）。项目 / 任务 / 项目记录 /
/// 开发上下文 / 项目文件的全部业务规则与 SQL 逐条对齐。
/// </summary>
public sealed class ProjectService
{
    /// <summary>与 Python json.dumps(..., ensure_ascii=False) 对齐：中文不转义。</summary>
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly Db _db;

    public ProjectService(Db db) => _db = db;

    private static string NewProjectId() => "p-" + Guid.NewGuid().ToString("N")[..12];

    /* ---------- 项目 ---------- */

    public List<Dictionary<string, object?>> ListProjects() =>
        _db.FetchAll("SELECT * FROM projects ORDER BY sort_order, created_at, id");

    public Dictionary<string, object?> CreateProject(string name, string description, string status)
    {
        var cleanName = name.Trim();
        if (FindProjectByName(cleanName) is not null)
            throw new ProjectConflictError("已有同名项目");
        var projectId = NewProjectId();
        var now = Db.UtcNow();
        // 新项目排在末尾：拖拽排序决定的是已有项目的先后，不抢别人已经排好的位置
        _db.Execute(
            "INSERT INTO projects(id,name,description,status,created_at,updated_at,sort_order) " +
            "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM projects))",
            projectId, cleanName, description.Trim(), status, now, now);
        return FindProject(projectId) ?? new Dictionary<string, object?>();
    }

    /// <summary>整批重排：请求必须是**全量且唯一**的 id 列表，否则整批拒绝、不写一半。</summary>
    public List<Dictionary<string, object?>> ReorderProjects(List<string> orderedIds)
    {
        var current = ListProjects().Select(row => (row.GetValueOrDefault("id") as string) ?? "").ToList();
        if (orderedIds.Count != orderedIds.Distinct(StringComparer.Ordinal).Count())
            throw new ProjectOrderInvalidError("排序请求包含重复的项目");
        if (orderedIds.Any(item => !current.Contains(item)))
            throw new ProjectOrderInvalidError("排序请求包含不存在的项目");
        if (orderedIds.Count != current.Count)
            throw new ProjectOrderInvalidError("排序请求缺少项目，已拒绝整批写入");
        _db.WithTransaction(conn =>
        {
            for (var index = 0; index < orderedIds.Count; index++)
                Db.ExecOn(conn, "UPDATE projects SET sort_order=@p0 WHERE id=@p1", (long)index, orderedIds[index]);
        });
        return ListProjects();
    }

    public Dictionary<string, object?> UpdateProject(string projectId, string name, string description, string status)
    {
        ProjectOrRaise(projectId);
        var cleanName = name.Trim();
        if (FindProjectByName(cleanName, excludingId: projectId) is not null)
            throw new ProjectConflictError("已有同名项目");
        _db.Execute(
            "UPDATE projects SET name=@p0,description=@p1,status=@p2,updated_at=@p3 WHERE id=@p4",
            cleanName, description.Trim(), status, Db.UtcNow(), projectId);
        return FindProject(projectId) ?? new Dictionary<string, object?>();
    }

    public Dictionary<string, object?> ProjectDeletePreview(string projectId)
    {
        var project = ProjectOrRaise(projectId);
        if (CountProjects() <= 1)
            throw new ProjectConflictError("至少要保留一个项目");
        if (HasActiveRun(projectId) || HasActiveExecution(projectId))
            throw new ProjectConflictError("项目仍在运行，请先关闭项目后再删除");
        var payload = new Dictionary<string, object?> { ["project"] = project };
        foreach (var (name, table) in new[]
                 {
                     ("taskCount", "tasks"), ("noteCount", "notes"),
                     ("moduleBindingCount", "project_modules"), ("runCount", "runs"),
                 })
        {
            var row = _db.FetchOne($"SELECT COUNT(*) AS count FROM {table} WHERE project_id=@p0", projectId);
            payload[name] = row is null ? 0L : Convert.ToInt64(row.GetValueOrDefault("count") ?? 0);
        }
        return payload;
    }

    public Dictionary<string, object?> DeleteProject(string projectId)
    {
        var preview = ProjectDeletePreview(projectId);
        // 外键级联一次删除任务、记录、模块绑定与全部运行历史
        _db.Execute("DELETE FROM projects WHERE id=@p0", projectId);
        var payload = new Dictionary<string, object?> { ["deleted"] = true, ["projectId"] = projectId };
        foreach (var (key, value) in preview) payload[key] = value;
        return payload;
    }

    /* ---------- 任务 ---------- */

    public List<Dictionary<string, object?>> ListTasks(string projectId) =>
        _db.FetchAll("SELECT * FROM tasks WHERE project_id=@p0 ORDER BY created_at, id", projectId);

    public Dictionary<string, object?> CreateTask(string projectId, string title, string? dueDate,
        string priority, string kind)
    {
        ProjectOrRaise(projectId);
        var taskId = Guid.NewGuid().ToString();
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO tasks(id,project_id,title,due_date,priority,kind,completed,created_at,updated_at) " +
            "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,0,@p6,@p7)",
            taskId, projectId, title.Trim(), dueDate, priority, kind, now, now);
        return FindTask(taskId) ?? new Dictionary<string, object?>();
    }

    public Dictionary<string, object?> UpdateTask(string taskId, string title, string? dueDate,
        string priority, string kind, bool completed)
    {
        if (FindTask(taskId) is null)
            throw new TaskMissingError("任务不存在");
        _db.Execute(
            "UPDATE tasks SET title=@p0,due_date=@p1,priority=@p2,kind=@p3,completed=@p4,updated_at=@p5 WHERE id=@p6",
            title.Trim(), dueDate, priority, kind, completed ? 1 : 0, Db.UtcNow(), taskId);
        return FindTask(taskId) ?? new Dictionary<string, object?>();
    }

    public Dictionary<string, object?> DeleteTask(string taskId)
    {
        var task = FindTask(taskId) ?? throw new TaskMissingError("任务不存在");
        _db.Execute("DELETE FROM tasks WHERE id=@p0", taskId);
        return new Dictionary<string, object?>
        {
            ["deleted"] = true, ["taskId"] = taskId, ["projectId"] = task.GetValueOrDefault("project_id"),
        };
    }

    /* ---------- 项目记录 ---------- */

    public List<Dictionary<string, object?>> ListNotes(string projectId) =>
        _db.FetchAll("SELECT * FROM notes WHERE project_id=@p0 ORDER BY pinned DESC,updated_at DESC,id", projectId)
            .Select(NotePayload).ToList();

    public Dictionary<string, object?> CreateNote(string projectId, string title, string tag, string body,
        bool pinned, List<string> links)
    {
        ProjectOrRaise(projectId);
        var noteId = Guid.NewGuid().ToString();
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) " +
            "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)",
            noteId, projectId, title.Trim(), tag, body.Trim(), pinned ? 1 : 0,
            JsonSerializer.Serialize(links, JsonOpts), now, now);
        return NotePayload(FindNote(noteId) ?? new Dictionary<string, object?>());
    }

    public Dictionary<string, object?> UpdateNote(string noteId, string title, string tag, string body,
        bool pinned, List<string> links)
    {
        if (FindNote(noteId) is null)
            throw new NoteMissingError("项目记录不存在");
        _db.Execute(
            "UPDATE notes SET title=@p0,tag=@p1,body=@p2,pinned=@p3,links_json=@p4,updated_at=@p5 WHERE id=@p6",
            title.Trim(), tag, body.Trim(), pinned ? 1 : 0,
            JsonSerializer.Serialize(links, JsonOpts), Db.UtcNow(), noteId);
        return NotePayload(FindNote(noteId) ?? new Dictionary<string, object?>());
    }

    public Dictionary<string, object?> DeleteNote(string noteId)
    {
        var note = FindNote(noteId) ?? throw new NoteMissingError("项目记录不存在");
        _db.Execute("DELETE FROM notes WHERE id=@p0", noteId);
        return new Dictionary<string, object?>
        {
            ["deleted"] = true, ["noteId"] = noteId, ["projectId"] = note.GetValueOrDefault("project_id"),
        };
    }

    /* ---------- 项目文件（Python 版在路由层直接持 SQL，这里收进同一服务） ---------- */

    public List<Dictionary<string, object?>> ListProjectFiles(string projectId)
    {
        if (FindProject(projectId) is null)
            throw new ProjectMissingError("项目不存在");
        return _db.FetchAll("SELECT * FROM project_files WHERE project_id=@p0 ORDER BY created_at,id", projectId);
    }

    public Dictionary<string, object?> RegisterProjectFile(string projectId, string path)
    {
        if (FindProject(projectId) is null)
            throw new ProjectMissingError("项目不存在");
        var storedPath = RegisteredLocalFile(path);
        if (_db.FetchOne("SELECT * FROM project_files WHERE project_id=@p0 AND path=@p1", projectId, storedPath) is not null)
            throw new ProjectConflictError("这个文件已在当前项目中");
        var fileId = "pf-" + Guid.NewGuid().ToString("N")[..12];
        var now = Db.UtcNow();
        _db.Execute(
            "INSERT INTO project_files(id,project_id,name,path,created_at,updated_at) VALUES(@p0,@p1,@p2,@p3,@p4,@p5)",
            fileId, projectId, Path.GetFileName(storedPath), storedPath, now, now);
        return _db.FetchOne("SELECT * FROM project_files WHERE id=@p0", fileId) ?? new Dictionary<string, object?>();
    }

    public Dictionary<string, object?> ProjectFileDeletePreview(string fileId)
    {
        var item = _db.FetchOne("SELECT * FROM project_files WHERE id=@p0", fileId)
            ?? throw new ProjectMissingError("项目文件不存在");
        return new Dictionary<string, object?> { ["file"] = item, ["keepsLocalFile"] = true };
    }

    public Dictionary<string, object?> DeleteProjectFile(string fileId)
    {
        var preview = ProjectFileDeletePreview(fileId);
        _db.Execute("DELETE FROM project_files WHERE id=@p0", fileId);
        var payload = new Dictionary<string, object?> { ["deleted"] = true, ["fileId"] = fileId };
        foreach (var (key, value) in preview) payload[key] = value;
        return payload;
    }

    /// <summary>「打开」只接受已登记条目的 id，由 Windows 默认程序处理（不提交任意路径）。</summary>
    public Dictionary<string, object?> OpenProjectFile(string fileId)
    {
        var item = _db.FetchOne("SELECT * FROM project_files WHERE id=@p0", fileId)
            ?? throw new ProjectMissingError("项目文件不存在");
        var filePath = (item.GetValueOrDefault("path") as string) ?? "";
        if (!File.Exists(filePath))
            throw new ProjectConflictError("这个文件已不存在或无法访问");
        try
        {
            using var proc = new Process();
            proc.StartInfo = new ProcessStartInfo { FileName = filePath, UseShellExecute = true };
            proc.Start();
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            throw new ProjectConflictError("系统无法打开这个文件");
        }
        return new Dictionary<string, object?>
        {
            ["opened"] = true, ["fileId"] = fileId, ["name"] = item.GetValueOrDefault("name"),
        };
    }

    /// <summary>registered_local_file 的三道校验（顺序与文案对齐 Python 版）。</summary>
    private static string RegisteredLocalFile(string pathValue)
    {
        var candidate = pathValue.Trim();
        if (!Path.IsPathRooted(candidate))
            throw new ProjectFileInvalidError("文件路径必须是本机绝对路径");
        string resolved;
        try
        {
            resolved = Path.GetFullPath(candidate);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            throw new ProjectFileInvalidError("文件不存在或无法访问");
        }
        if (Directory.Exists(resolved))
            throw new ProjectFileInvalidError("只能添加本机文件，不能添加文件夹");
        if (!File.Exists(resolved))
            throw new ProjectFileInvalidError("文件不存在或无法访问");
        return resolved;
    }

    /* ---------- 编辑基本资料（一次提交、同事务校验、任一条无效整批回滚） ---------- */

    public Dictionary<string, object?> SaveBasicInfo(string projectId, string module, string moduleId,
        string modulePath, List<string> files, string devStatus, string nextStep, List<string> rules,
        List<BasicInfoTaskInput> tasks, List<BasicInfoNoteInput> notes, bool dropExtras)
    {
        ProjectOrRaise(projectId);
        var now = Db.UtcNow();
        Dictionary<string, object?>? context = null;
        List<Dictionary<string, object?>>? savedTasks = null;
        List<Dictionary<string, object?>>? savedNotes = null;
        _db.WithTransaction(conn =>
        {
            var activeTasks = Db.QueryOn(conn, "SELECT * FROM tasks WHERE project_id=@p0 AND completed=0", projectId)
                .ToDictionary(row => (row.GetValueOrDefault("id") as string) ?? "", row => row);
            var requestedTasks = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in tasks)
            {
                if (item.Id is { Length: > 0 })
                {
                    if (!requestedTasks.Add(item.Id) || !activeTasks.ContainsKey(item.Id))
                        throw new BasicInfoInvalidError("基本资料包含无效或重复的任务");
                    Db.ExecOn(conn,
                        "UPDATE tasks SET title=@p0,due_date=@p1,priority=@p2,kind=@p3,updated_at=@p4 WHERE id=@p5",
                        item.Title.Trim(), item.DueDate, item.Priority, item.Kind, now, item.Id);
                }
                else
                {
                    Db.ExecOn(conn,
                        "INSERT INTO tasks(id,project_id,title,due_date,priority,kind,completed,created_at,updated_at) " +
                        "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,0,@p6,@p7)",
                        Guid.NewGuid().ToString(), projectId, item.Title.Trim(), item.DueDate, item.Priority,
                        item.Kind, now, now);
                }
            }
            if (dropExtras)
                foreach (var taskId in activeTasks.Keys.Where(id => !requestedTasks.Contains(id)).ToList())
                    Db.ExecOn(conn, "DELETE FROM tasks WHERE id=@p0", taskId);

            var activeNotes = Db.QueryOn(conn, "SELECT * FROM notes WHERE project_id=@p0", projectId)
                .ToDictionary(row => (row.GetValueOrDefault("id") as string) ?? "", row => row);
            var requestedNotes = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in notes)
            {
                if (item.Id is { Length: > 0 })
                {
                    if (!requestedNotes.Add(item.Id) || !activeNotes.ContainsKey(item.Id))
                        throw new BasicInfoInvalidError("基本资料包含无效或重复的项目记录");
                    Db.ExecOn(conn, "UPDATE notes SET title=@p0,tag=@p1,updated_at=@p2 WHERE id=@p3",
                        item.Title.Trim(), item.Tag, now, item.Id);
                }
                else
                {
                    Db.ExecOn(conn,
                        "INSERT INTO notes(id,project_id,title,tag,body,pinned,links_json,created_at,updated_at) " +
                        "VALUES(@p0,@p1,@p2,@p3,'',0,'[]',@p4,@p5)",
                        Guid.NewGuid().ToString(), projectId, item.Title.Trim(), item.Tag, now, now);
                }
            }
            if (dropExtras)
                foreach (var noteId in activeNotes.Keys.Where(id => !requestedNotes.Contains(id)).ToList())
                    Db.ExecOn(conn, "DELETE FROM notes WHERE id=@p0", noteId);

            Db.ExecOn(conn,
                "INSERT INTO project_contexts(project_id,module,module_id,module_path,files_json,dev_status,next_step,rules_json,updated_at) " +
                "VALUES(@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8) " +
                "ON CONFLICT(project_id) DO UPDATE SET module=excluded.module,module_id=excluded.module_id," +
                "module_path=excluded.module_path,files_json=excluded.files_json,dev_status=excluded.dev_status," +
                "next_step=excluded.next_step,rules_json=excluded.rules_json,updated_at=excluded.updated_at",
                projectId, module.Trim(), moduleId.Trim(), modulePath.Trim(),
                JsonSerializer.Serialize(files, JsonOpts), devStatus.Trim(), nextStep.Trim(),
                JsonSerializer.Serialize(rules, JsonOpts), now);

            savedTasks = Db.QueryOn(conn, "SELECT * FROM tasks WHERE project_id=@p0 ORDER BY created_at,id", projectId);
            savedNotes = Db.QueryOn(conn,
                    "SELECT * FROM notes WHERE project_id=@p0 ORDER BY pinned DESC,updated_at DESC,id", projectId)
                .Select(NotePayload).ToList();
            var contextRow = Db.QueryOn(conn, "SELECT * FROM project_contexts WHERE project_id=@p0", projectId)
                .FirstOrDefault() ?? new Dictionary<string, object?>();
            context = ContextPayload(contextRow);
        });
        return new Dictionary<string, object?>
        {
            ["context"] = context!, ["tasks"] = savedTasks!, ["notes"] = savedNotes!,
        };
    }

    /* ---------- payload 辅助（与 main.py / project_service 的两个 payload 对齐） ---------- */

    public static Dictionary<string, object?> NotePayload(Dictionary<string, object?> row)
    {
        var value = new Dictionary<string, object?>(row);
        value["links"] = ParseStringList(Pop(value, "links_json"));
        return value;
    }

    public static Dictionary<string, object?> ContextPayload(Dictionary<string, object?> row)
    {
        var value = new Dictionary<string, object?>(row);
        foreach (var (source, target) in new[] { ("files_json", "files"), ("rules_json", "rules") })
            value[target] = ParseStringList(Pop(value, source));
        return value;
    }

    /// <summary>Python 版是逐个过滤出 str 项（非字符串元素被丢弃，而不是整段失败）。</summary>
    private static List<string> ParseStringList(object? raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw as string ?? "[]");
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return new List<string>();
            return doc.RootElement.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString()!)
                .ToList();
        }
        catch (JsonException)
        {
            return new List<string>();
        }
    }

    /// <summary>取走并删除键（Python dict.pop(key, default) 的等价物）。</summary>
    private static object? Pop(Dictionary<string, object?> source, string key)
    {
        if (!source.TryGetValue(key, out var value)) return null;
        source.Remove(key);
        return value;
    }

    /* ---------- 内部查找 ---------- */

    private Dictionary<string, object?>? FindProject(string projectId) =>
        _db.FetchOne("SELECT * FROM projects WHERE id=@p0", projectId);

    private Dictionary<string, object?>? FindProjectByName(string name, string? excludingId = null) =>
        excludingId is null
            ? _db.FetchOne("SELECT id FROM projects WHERE name=@p0", name)
            : _db.FetchOne("SELECT id FROM projects WHERE name=@p0 AND id<>@p1", name, excludingId);

    private long CountProjects()
    {
        var row = _db.FetchOne("SELECT COUNT(*) AS count FROM projects");
        return row is null ? 0 : Convert.ToInt64(row.GetValueOrDefault("count") ?? 0);
    }

    private bool HasActiveRun(string projectId) =>
        _db.FetchOne("SELECT id FROM runs WHERE project_id=@p0 AND status IN ('queued','running') LIMIT 1",
            projectId) is not null;

    private bool HasActiveExecution(string projectId) =>
        _db.FetchOne("SELECT id FROM project_executions WHERE project_id=@p0 AND status IN ('queued','running') LIMIT 1",
            projectId) is not null;

    private Dictionary<string, object?>? FindTask(string taskId) =>
        _db.FetchOne("SELECT * FROM tasks WHERE id=@p0", taskId);

    private Dictionary<string, object?>? FindNote(string noteId) =>
        _db.FetchOne("SELECT * FROM notes WHERE id=@p0", noteId);

    private Dictionary<string, object?> ProjectOrRaise(string projectId) =>
        FindProject(projectId) ?? throw new ProjectMissingError("项目不存在");
}
