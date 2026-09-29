using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Data.Sqlite;

namespace ApexShell;

/// <summary>
/// ControlPod 的 SQLite 直读直写层。
/// 迁移 1–10 保留旧版本升级兼容，并由 SelfTest 的逐版本用例保护。
/// 注意：PRAGMA foreign_keys 是连接级设置，每次 Open 都要重设。
/// </summary>
public sealed class Db
{
    private const int LatestSchemaVersion = 10;

    private static readonly string[] SchemaStatements =
    {
        @"CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '正常',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
)",
        @"CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        due_date TEXT,
        priority TEXT NOT NULL DEFAULT '中',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
)",
        @"CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'script',
        description TEXT NOT NULL DEFAULT '',
        entry TEXT NOT NULL DEFAULT '',
        args TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
)",
        @"CREATE TABLE IF NOT EXISTS project_modules (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (project_id, module_id)
)",
        @"CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
        action TEXT NOT NULL DEFAULT 'run',
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        exit_code INTEGER,
        error TEXT,
        run_dir TEXT NOT NULL
)",
    };

    public string Path { get; }

    public Db(string path) => Path = path;

    /// <summary>与 db.py utc_now() 同格式：UTC ISO-8601，6 位小数秒 + +00:00。</summary>
    public static string UtcNow() =>
        DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.ffffff'+00:00'");

    private SqliteConnection Open()
    {
        var dir = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(Path));
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var conn = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = Path,
            Mode = SqliteOpenMode.ReadWriteCreate,
        }.ToString());
        conn.Open();
        Exec(conn, "PRAGMA journal_mode=WAL");
        Exec(conn, "PRAGMA foreign_keys=ON");
        return conn;
    }

    private static void Exec(SqliteConnection conn, string sql, params object?[] args)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        for (var i = 0; i < args.Length; i++)
            cmd.Parameters.AddWithValue($"@p{i}", args[i] ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }

    private static SqliteDataReader Query(SqliteConnection conn, string sql, params object?[] args)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        for (var i = 0; i < args.Length; i++)
            cmd.Parameters.AddWithValue($"@p{i}", args[i] ?? DBNull.Value);
        return cmd.ExecuteReader();
    }

    /// <summary>整库迁移：使用 user_version，全部包在一个 IMMEDIATE 事务里。</summary>
    public void Init()
    {
        using var conn = Open();
        var current = 0L;
        using (var reader = Query(conn, "PRAGMA user_version"))
            if (reader.Read()) current = reader.GetInt64(0);
        if (current > LatestSchemaVersion)
            throw new InvalidOperationException(
                $"数据库版本 {current} 高于当前程序支持的 {LatestSchemaVersion}，拒绝启动");

        Exec(conn, "BEGIN IMMEDIATE");
        try
        {
            for (var version = 1; version <= LatestSchemaVersion; version++)
            {
                if (version <= current) continue;
                Migrate(conn, version);
                Exec(conn, $"PRAGMA user_version = {version}");
            }
            Exec(conn, "COMMIT");
        }
        catch
        {
            try { Exec(conn, "ROLLBACK"); } catch { /* 连接已坏时尽力而为 */ }
            throw;
        }
    }

    /// <summary>按版本顺序分发迁移函数。</summary>
    private static void Migrate(SqliteConnection conn, int version)
    {
        switch (version)
        {
            case 1: M1Baseline(conn); break;
            case 2: M2TaskKind(conn); break;
            case 3: M3ProjectNotes(conn); break;
            case 4: M4ProjectContext(conn); break;
            case 5: M5Applications(conn); break;
            case 6: M6ProjectFiles(conn); break;
            case 7: M7ProjectExecutions(conn); break;
            case 8: M8ApplicationLaunchTargets(conn); break;
            case 9: M9ActivityHeartbeats(conn); break;
            case 10: M10ProjectOrder(conn); break;
        }
    }

    private static HashSet<string> Columns(SqliteConnection conn, string table)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        using var reader = Query(conn, $"PRAGMA table_info({table})");
        while (reader.Read()) set.Add(reader.GetString(1));
        return set;
    }

    /* ---- 迁移 1：基线（收编无版本号的旧库并补齐到基线） ---- */
    private static void M1Baseline(SqliteConnection conn)
    {
        foreach (var statement in SchemaStatements) Exec(conn, statement);

        if (!Columns(conn, "runs").Contains("action"))
            Exec(conn, "ALTER TABLE runs ADD COLUMN action TEXT NOT NULL DEFAULT 'run'");

        var moduleColumns = Columns(conn, "modules");
        var additions = new (string Name, string Def)[]
        {
            ("type", "TEXT NOT NULL DEFAULT 'script'"),
            ("description", "TEXT NOT NULL DEFAULT ''"),
            ("entry", "TEXT NOT NULL DEFAULT ''"),
            ("args", "TEXT NOT NULL DEFAULT ''"),
        };
        foreach (var (name, def) in additions)
            if (!moduleColumns.Contains(name))
                Exec(conn, $"ALTER TABLE modules ADD COLUMN {name} {def}");
    }

    /* ---- 迁移 2：任务保留前端内部的 todo/fix 区分 ---- */
    private static void M2TaskKind(SqliteConnection conn)
    {
        if (!Columns(conn, "tasks").Contains("kind"))
            Exec(conn,
                "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo' " +
                "CHECK(kind IN ('todo', 'fix'))");
    }

    /* ---- 迁移 3：项目笔记独立持久化 ---- */
    private static void M3ProjectNotes(SqliteConnection conn) =>
        Exec(conn, @"CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT '日常',
        body TEXT NOT NULL DEFAULT '',
        pinned INTEGER NOT NULL DEFAULT 0,
        links_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )");

    /* ---- 迁移 4：项目开发上下文 + Agent 规则 ---- */
    private static void M4ProjectContext(SqliteConnection conn) =>
        Exec(conn, @"CREATE TABLE IF NOT EXISTS project_contexts (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        module TEXT NOT NULL DEFAULT '',
        module_id TEXT NOT NULL DEFAULT '',
        module_path TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        dev_status TEXT NOT NULL DEFAULT '开发中',
        next_step TEXT NOT NULL DEFAULT '',
        rules_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
    )");

    /* ---- 迁移 5：本机应用目录 ---- */
    private static void M5Applications(SqliteConnection conn)
    {
        Exec(conn, @"CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'idea',
        favorite INTEGER NOT NULL DEFAULT 0,
        size_label TEXT NOT NULL DEFAULT '—',
        use_count INTEGER NOT NULL DEFAULT 0,
        last_opened_at TEXT,
        running INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )");
        Exec(conn, @"CREATE TABLE IF NOT EXISTS app_catalog_meta (
        id INTEGER PRIMARY KEY CHECK(id=1),
        initialized INTEGER NOT NULL DEFAULT 0
    )");
        Exec(conn, "INSERT OR IGNORE INTO app_catalog_meta(id,initialized) VALUES(1,0)");
    }

    /* ---- 迁移 6：项目本机文件登记 ---- */
    private static void M6ProjectFiles(SqliteConnection conn) =>
        Exec(conn, @"CREATE TABLE IF NOT EXISTS project_files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, path)
    )");

    /* ---- 迁移 7：项目执行与有序步骤，与原始 runs 分开存 ---- */
    private static void M7ProjectExecutions(SqliteConnection conn)
    {
        Exec(conn, @"CREATE TABLE IF NOT EXISTS project_executions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK(action IN ('run', 'stop', 'restart')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'stopped', 'interrupted')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        error TEXT
    )");
        Exec(conn, @"CREATE TABLE IF NOT EXISTS execution_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES project_executions(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        module_name TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('run', 'stop')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'stopped', 'interrupted')),
        run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
        error TEXT
    )");
        Exec(conn,
            "CREATE INDEX IF NOT EXISTS idx_project_executions_project_started " +
            "ON project_executions(project_id, started_at DESC)");
        Exec(conn,
            "CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_order " +
            "ON execution_steps(execution_id, sort_order)");
    }

    /* ---- 迁移 8：应用挂验证过的 Windows 快捷方式启动入口 ---- */
    private static void M8ApplicationLaunchTargets(SqliteConnection conn)
    {
        var columns = Columns(conn, "applications");
        if (columns.Count == 0)
        {
            M5Applications(conn);
            columns = Columns(conn, "applications");
        }
        if (!columns.Contains("launch_path"))
            Exec(conn, "ALTER TABLE applications ADD COLUMN launch_path TEXT NOT NULL DEFAULT ''");
        if (!columns.Contains("source_key"))
            Exec(conn, "ALTER TABLE applications ADD COLUMN source_key TEXT NOT NULL DEFAULT ''");
        Exec(conn,
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_source_key " +
            "ON applications(source_key) WHERE source_key<>''");
    }

    /* ---- 迁移 9：控制台在线心跳（按天分钟数） ---- */
    private static void M9ActivityHeartbeats(SqliteConnection conn) =>
        Exec(conn, @"CREATE TABLE IF NOT EXISTS activity_heartbeats (
        day TEXT PRIMARY KEY,
        minutes INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    )");

    /* ---- 迁移 10：项目卡片拖拽顺序；旧库按原展示顺序回填 ---- */
    private static void M10ProjectOrder(SqliteConnection conn)
    {
        var columns = Columns(conn, "projects");
        if (columns.Count == 0) return;
        if (!columns.Contains("sort_order"))
            Exec(conn, "ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
        var ids = new List<string>();
        using (var reader = Query(conn, "SELECT id FROM projects ORDER BY created_at, id"))
            while (reader.Read()) ids.Add(reader.GetString(0));
        for (var index = 0; index < ids.Count; index++)
            Exec(conn, "UPDATE projects SET sort_order=@p0 WHERE id=@p1", index, ids[index]);
    }

    /* ---------- 读写门面（与 db.py 的 execute/fetch_one/fetch_all/transaction 同名对齐） ---------- */

    public void Execute(string sql, params object?[] args)
    {
        using var conn = Open();
        Exec(conn, sql, args);
    }

    public Dictionary<string, object?>? FetchOne(string sql, params object?[] args)
    {
        using var conn = Open();
        using var reader = Query(conn, sql, args);
        return reader.Read() ? ReadRow(reader) : null;
    }

    public List<Dictionary<string, object?>> FetchAll(string sql, params object?[] args)
    {
        using var conn = Open();
        var rows = new List<Dictionary<string, object?>>();
        using var reader = Query(conn, sql, args);
        while (reader.Read()) rows.Add(ReadRow(reader));
        return rows;
    }

    public void Transaction((string Sql, object?[] Args)[] statements)
    {
        using var conn = Open();
        Exec(conn, "BEGIN IMMEDIATE");
        try
        {
            foreach (var (sql, args) in statements) Exec(conn, sql, args);
            Exec(conn, "COMMIT");
        }
        catch
        {
            try { Exec(conn, "ROLLBACK"); } catch { /* 尽力而为 */ }
            throw;
        }
    }

    /// <summary>交互式事务（块5 需要「读-判断-写」，固定语句清单不够用）：
    /// 回调里用 SqliteConnection 直接执行/查询，抛异常整批回滚——与 Python 版
    /// `with db.connect() as conn` 同语义（ProjectRepository.transaction）。</summary>
    public void WithTransaction(Action<SqliteConnection> work)
    {
        using var conn = Open();
        Exec(conn, "BEGIN IMMEDIATE");
        try
        {
            work(conn);
            Exec(conn, "COMMIT");
        }
        catch
        {
            try { Exec(conn, "ROLLBACK"); } catch { /* 尽力而为 */ }
            throw;
        }
    }

    /// <summary>事务连接上的执行 / 查询（供 WithTransaction 回调内使用）。</summary>
    public static void ExecOn(SqliteConnection conn, string sql, params object?[] args) =>
        Exec(conn, sql, args);

    public static List<Dictionary<string, object?>> QueryOn(SqliteConnection conn, string sql, params object?[] args)
    {
        var rows = new List<Dictionary<string, object?>>();
        using var reader = Query(conn, sql, args);
        while (reader.Read()) rows.Add(ReadRow(reader));
        return rows;
    }

    private static Dictionary<string, object?> ReadRow(SqliteDataReader reader)
    {
        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
        for (var i = 0; i < reader.FieldCount; i++)
            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
        return row;
    }
}
