//! AI client config detection and installation. See docs/desktop-plan.md Contract 2.
//!
//! The pure core (`list_clients`, `preview_install`, `install`, `uninstall`) takes an
//! explicit `Env`, so it runs against a temp directory in tests. Only `env_paths`
//! touches Tauri. Commands are wired in lib.rs by the lead, so the file allows dead code
//! until then.
#![allow(dead_code)]

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::Manager;

const SERVER_NAME: &str = "db-mcp";
const BACKUP_MARKER: &str = ".db-mcp-backup-";
const TEMP_SUFFIX: &str = ".tmp-db-mcp";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    Windows,
    Linux,
}

pub struct Env<'a> {
    pub home: &'a Path,
    /// mac: ~/Library/Application Support, win: %APPDATA% (Roaming), linux: ~/.config
    pub config_dir: &'a Path,
    pub platform: Platform,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiClient {
    pub id: String,
    pub name: String,
    pub detected: bool,
    pub configured: bool,
    pub config_path: Option<String>,
    pub auto_install: bool,
    pub snippet: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallPreview {
    pub config_path: String,
    pub before: String,
    pub after: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub config_path: String,
    pub backup_path: Option<String>,
}

/// One supported client, resolved against a concrete `Env`.
struct Target {
    id: &'static str,
    name: &'static str,
    /// Top-level JSON key that holds the server map (`mcpServers` or `servers`).
    key: &'static str,
    auto_install: bool,
    config_path: PathBuf,
    detected: bool,
}

#[derive(Clone, Copy)]
enum Op<'a> {
    Install(&'a str),
    Uninstall,
}

/// A computed edit. Nothing is written until `commit` runs.
struct Plan {
    target: Target,
    /// Content before the edit ("" when the file is missing).
    before: String,
    /// Whether the file existed before the edit.
    existed: bool,
    /// New content, or `None` when the edit changes nothing.
    after: Option<String>,
}

pub fn list_clients(env: &Env<'_>, mcp_url: &str) -> Vec<AiClient> {
    targets(env)
        .into_iter()
        .map(|t| AiClient {
            id: t.id.to_owned(),
            name: t.name.to_owned(),
            detected: t.detected,
            configured: is_configured(&t),
            config_path: Some(display(&t.config_path)),
            auto_install: t.auto_install,
            snippet: snippet(&t, mcp_url),
        })
        .collect()
}

pub fn preview_install(env: &Env<'_>, id: &str, mcp_url: &str) -> Result<InstallPreview, String> {
    let Plan {
        target,
        before,
        after,
        ..
    } = plan(env, id, Op::Install(mcp_url))?;
    let after = after.unwrap_or_else(|| before.clone());
    Ok(InstallPreview {
        config_path: display(&target.config_path),
        before,
        after,
    })
}

pub fn install(env: &Env<'_>, id: &str, mcp_url: &str) -> Result<InstallResult, String> {
    apply(plan(env, id, Op::Install(mcp_url))?)
}

pub fn uninstall(env: &Env<'_>, id: &str) -> Result<InstallResult, String> {
    apply(plan(env, id, Op::Uninstall)?)
}

/// Resolves `(home, config_dir, platform)` for the running app.
pub fn env_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, Platform), String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("Could not locate the home directory: {e}"))?;
    let (config_dir, platform) = if cfg!(target_os = "macos") {
        (
            home.join("Library").join("Application Support"),
            Platform::MacOs,
        )
    } else if cfg!(target_os = "windows") {
        let dir = non_empty_env("APPDATA").unwrap_or_else(|| home.join("AppData").join("Roaming"));
        (dir, Platform::Windows)
    } else {
        let dir = non_empty_env("XDG_CONFIG_HOME").unwrap_or_else(|| home.join(".config"));
        (dir, Platform::Linux)
    };
    Ok((home, config_dir, platform))
}

fn non_empty_env(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

// ---------------------------------------------------------------------------
// Client table
// ---------------------------------------------------------------------------

fn targets(env: &Env<'_>) -> Vec<Target> {
    let claude_app_dir = env.config_dir.join("Claude");
    let vscode_user_dir = env.config_dir.join("Code").join("User");
    let cursor_dir = env.home.join(".cursor");
    let windsurf_dir = env.home.join(".codeium").join("windsurf");
    let lm_studio_dir = env.home.join(".lmstudio");
    let claude_code_json = env.home.join(".claude.json");
    let claude_code_dir = env.home.join(".claude");

    vec![
        Target {
            id: "claude-desktop",
            name: "Claude Desktop",
            key: "mcpServers",
            auto_install: true,
            detected: claude_app_dir.exists(),
            config_path: claude_app_dir.join("claude_desktop_config.json"),
        },
        Target {
            id: "cursor",
            name: "Cursor",
            key: "mcpServers",
            auto_install: true,
            detected: cursor_dir.exists(),
            config_path: cursor_dir.join("mcp.json"),
        },
        Target {
            id: "windsurf",
            name: "Windsurf",
            key: "mcpServers",
            auto_install: true,
            detected: windsurf_dir.exists(),
            config_path: windsurf_dir.join("mcp_config.json"),
        },
        Target {
            id: "vscode",
            name: "VS Code",
            key: "servers",
            auto_install: true,
            detected: vscode_user_dir.exists(),
            config_path: vscode_user_dir.join("mcp.json"),
        },
        Target {
            id: "lm-studio",
            name: "LM Studio",
            key: "mcpServers",
            auto_install: true,
            detected: lm_studio_dir.exists(),
            config_path: lm_studio_dir.join("mcp.json"),
        },
        Target {
            id: "claude-code",
            name: "Claude Code",
            key: "mcpServers",
            auto_install: false,
            detected: claude_code_json.exists() || claude_code_dir.exists(),
            config_path: claude_code_json,
        },
    ]
}

fn find_target(env: &Env<'_>, id: &str) -> Result<Target, String> {
    targets(env)
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Unknown AI client: {id}"))
}

fn server_entry(id: &str, url: &str) -> Value {
    match id {
        "claude-desktop" => json!({ "command": "npx", "args": ["-y", "mcp-remote", url] }),
        "windsurf" => json!({ "serverUrl": url }),
        "vscode" => json!({ "type": "http", "url": url }),
        // cursor, lm-studio
        _ => json!({ "url": url }),
    }
}

fn snippet(target: &Target, mcp_url: &str) -> String {
    if !target.auto_install {
        return format!("claude mcp add --transport http {SERVER_NAME} {mcp_url}");
    }
    let entry = server_entry(target.id, mcp_url);
    let mut servers = Map::new();
    servers.insert(SERVER_NAME.to_owned(), entry);
    let mut root = Map::new();
    root.insert(target.key.to_owned(), Value::Object(servers));
    serde_json::to_string_pretty(&Value::Object(root))
        .expect("serializing a JSON value cannot fail")
}

// ---------------------------------------------------------------------------
// Reading and merging
// ---------------------------------------------------------------------------

fn is_configured(target: &Target) -> bool {
    let Ok(text) = read_text(&target.config_path) else {
        return false;
    };
    parse_root(text.as_deref(), &target.config_path).is_ok_and(|root| has_entry(&root, target.key))
}

fn has_entry(root: &Map<String, Value>, key: &str) -> bool {
    root.get(key)
        .and_then(Value::as_object)
        .is_some_and(|servers| servers.contains_key(SERVER_NAME))
}

/// `Ok(None)` when the file does not exist.
fn read_text(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

/// Missing or whitespace-only content is treated as an empty object.
fn parse_root(text: Option<&str>, path: &Path) -> Result<Map<String, Value>, String> {
    let text = text.unwrap_or("");
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    let value: Value = serde_json::from_str(text).map_err(|_| {
        format!(
            "{} is not valid JSON (it may contain comments). Add the db-mcp snippet manually. The file was not changed.",
            path.display()
        )
    })?;
    match value {
        Value::Object(map) => Ok(map),
        _ => Err(format!(
            "{} must contain a JSON object at the top level. The file was not changed.",
            path.display()
        )),
    }
}

fn not_an_object(key: &str, path: &Path) -> String {
    format!(
        "\"{key}\" in {} is not a JSON object. The file was not changed.",
        path.display()
    )
}

/// Sets `<key>.db-mcp`, keeping every other key and its position.
fn with_entry(
    mut root: Map<String, Value>,
    target: &Target,
    entry: Value,
    path: &Path,
) -> Result<Map<String, Value>, String> {
    let slot = root
        .entry(target.key)
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(servers) = slot.as_object_mut() else {
        return Err(not_an_object(target.key, path));
    };
    servers.insert(SERVER_NAME.to_owned(), entry);
    Ok(root)
}

/// Removes `<key>.db-mcp`. The `<key>` object itself is kept, even when empty.
fn without_entry(
    mut root: Map<String, Value>,
    target: &Target,
    path: &Path,
) -> Result<Map<String, Value>, String> {
    let Some(slot) = root.get(target.key) else {
        return Ok(root);
    };
    let Some(servers) = slot.as_object() else {
        return Err(not_an_object(target.key, path));
    };
    if !servers.contains_key(SERVER_NAME) {
        return Ok(root);
    }
    let remaining: Map<String, Value> = servers
        .iter()
        .filter(|(name, _)| name.as_str() != SERVER_NAME)
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect();
    root.insert(target.key.to_owned(), Value::Object(remaining));
    Ok(root)
}

fn render(value: &Value) -> String {
    let mut text =
        serde_json::to_string_pretty(value).expect("serializing a JSON value cannot fail");
    text.push('\n');
    text
}

// ---------------------------------------------------------------------------
// Planning and writing
// ---------------------------------------------------------------------------

fn plan(env: &Env<'_>, id: &str, op: Op<'_>) -> Result<Plan, String> {
    let target = find_target(env, id)?;
    if !target.detected {
        return Err(format!("{} is not installed on this computer", target.name));
    }
    if !target.auto_install {
        let hint = match op {
            Op::Install(mcp_url) => snippet(&target, mcp_url),
            Op::Uninstall => format!("claude mcp remove {SERVER_NAME}"),
        };
        return Err(format!(
            "{} is configured with its CLI: {hint}",
            target.name
        ));
    }

    let path = target.config_path.clone();
    let existing = read_text(&path)?;
    let root = parse_root(existing.as_deref(), &path)?;
    let original = Value::Object(root.clone());
    let updated = match op {
        Op::Install(mcp_url) => {
            let entry = server_entry(target.id, mcp_url);
            with_entry(root, &target, entry, &path)?
        }
        Op::Uninstall => without_entry(root, &target, &path)?,
    };
    let updated = Value::Object(updated);
    let after = (updated != original).then(|| render(&updated));

    Ok(Plan {
        existed: existing.is_some(),
        before: existing.unwrap_or_default(),
        target,
        after,
    })
}

fn apply(plan: Plan) -> Result<InstallResult, String> {
    let path = plan.target.config_path.clone();
    let backup_path = match &plan.after {
        Some(text) => write_config(&path, text, plan.existed)?,
        None => None,
    };
    Ok(InstallResult {
        config_path: display(&path),
        backup_path: backup_path.as_deref().map(display),
    })
}

/// Backs up the existing file, then atomically replaces it. Returns the backup path.
fn write_config(path: &Path, text: &str, existed: bool) -> Result<Option<PathBuf>, String> {
    let backup = if existed {
        let backup = backup_path_for(path);
        fs::copy(path, &backup).map_err(|e| {
            format!(
                "Could not back up {} before changing it: {e}. The file was not changed.",
                path.display()
            )
        })?;
        Some(backup)
    } else {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
        }
        None
    };

    write_atomic(path, text).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(backup)
}

fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    let tmp = sibling(path, TEMP_SUFFIX);
    let result = write_and_rename(&tmp, path, text);
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

fn write_and_rename(tmp: &Path, path: &Path, text: &str) -> std::io::Result<()> {
    let mut file = fs::File::create(tmp)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    drop(file);
    if let Ok(meta) = fs::metadata(path) {
        fs::set_permissions(tmp, meta.permissions())?;
    }
    fs::rename(tmp, path)
}

/// `<file>.db-mcp-backup-<unix_secs>`, with `-<n>` appended when that name is taken.
fn backup_path_for(path: &Path) -> PathBuf {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut candidate = sibling(path, &format!("{BACKUP_MARKER}{secs}"));
    let mut n = 1;
    while candidate.exists() {
        candidate = sibling(path, &format!("{BACKUP_MARKER}{secs}-{n}"));
        n += 1;
    }
    candidate
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const URL: &str = "http://127.0.0.1:4080/mcp";

    /// Temp home + config dirs, removed on drop.
    struct Sandbox {
        root: PathBuf,
        home: PathBuf,
        config: PathBuf,
    }

    impl Sandbox {
        fn new(tag: &str) -> Self {
            static COUNTER: AtomicUsize = AtomicUsize::new(0);
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let root = std::env::temp_dir().join(format!(
                "db-mcp-ai-clients-{}-{tag}-{n}-{nanos}",
                std::process::id()
            ));
            let home = root.join("home");
            let config = root.join("config");
            fs::create_dir_all(&home).expect("create home");
            fs::create_dir_all(&config).expect("create config");
            Self { root, home, config }
        }

        fn env(&self) -> Env<'_> {
            Env {
                home: &self.home,
                config_dir: &self.config,
                platform: Platform::MacOs,
            }
        }

        fn dir(&self, rel: &str) -> PathBuf {
            let dir = self.home.join(rel);
            fs::create_dir_all(&dir).expect("create dir");
            dir
        }
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn mkdir(path: PathBuf) {
        fs::create_dir_all(path).expect("create dir");
    }

    fn put(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    }

    fn parse(text: &str) -> Value {
        serde_json::from_str(text).expect("valid json")
    }

    fn keys(root: &Value, key: &str) -> Vec<String> {
        root[key]
            .as_object()
            .expect("object")
            .keys()
            .cloned()
            .collect()
    }

    fn by_id<'a>(clients: &'a [AiClient], id: &str) -> &'a AiClient {
        clients.iter().find(|c| c.id == id).expect("client present")
    }

    fn backup_count(dir: &Path) -> usize {
        fs::read_dir(dir)
            .expect("read dir")
            .filter(|entry| {
                entry
                    .as_ref()
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .contains(BACKUP_MARKER)
            })
            .count()
    }

    fn cursor_file(sb: &Sandbox) -> PathBuf {
        sb.dir(".cursor").join("mcp.json")
    }

    #[test]
    fn lists_six_clients_in_contract_order() {
        let sb = Sandbox::new("order");
        let clients = list_clients(&sb.env(), URL);
        let ids: Vec<&str> = clients.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "claude-desktop",
                "cursor",
                "windsurf",
                "vscode",
                "lm-studio",
                "claude-code"
            ]
        );
        let auto: Vec<bool> = clients.iter().map(|c| c.auto_install).collect();
        assert_eq!(auto, [true, true, true, true, true, false]);
    }

    #[test]
    fn detection_follows_directories() {
        let sb = Sandbox::new("detect");
        assert!(list_clients(&sb.env(), URL).iter().all(|c| !c.detected));

        sb.dir(".cursor");
        mkdir(sb.config.join("Claude"));

        let clients = list_clients(&sb.env(), URL);
        assert!(by_id(&clients, "cursor").detected);
        assert!(by_id(&clients, "claude-desktop").detected);
        assert!(!by_id(&clients, "windsurf").detected);
        assert!(!by_id(&clients, "vscode").detected);
    }

    #[test]
    fn claude_code_detected_from_either_home_path() {
        let sb = Sandbox::new("claude-code-detect");
        put(&sb.home.join(".claude.json"), "{}");
        assert!(by_id(&list_clients(&sb.env(), URL), "claude-code").detected);

        let sb2 = Sandbox::new("claude-code-dir");
        sb2.dir(".claude");
        assert!(by_id(&list_clients(&sb2.env(), URL), "claude-code").detected);
    }

    #[test]
    fn configured_detection_reads_our_entry() {
        let sb = Sandbox::new("configured");
        put(
            &cursor_file(&sb),
            r#"{"mcpServers":{"other":{"url":"x"},"db-mcp":{"url":"y"}}}"#,
        );
        put(
            &sb.home.join(".claude.json"),
            r#"{"mcpServers":{"db-mcp":{"type":"http","url":"z"}}}"#,
        );
        let clients = list_clients(&sb.env(), URL);
        assert!(by_id(&clients, "cursor").configured);
        assert!(by_id(&clients, "claude-code").configured);
        assert!(!by_id(&clients, "windsurf").configured);
    }

    #[test]
    fn configured_is_false_for_other_servers_only_and_invalid_json() {
        let sb = Sandbox::new("configured-negative");
        put(&cursor_file(&sb), r#"{"mcpServers":{"other":{}}}"#);
        put(&sb.home.join(".claude.json"), "// not json");
        let clients = list_clients(&sb.env(), URL);
        assert!(!by_id(&clients, "cursor").configured);
        assert!(!by_id(&clients, "claude-code").configured);
    }

    #[test]
    fn vscode_uses_servers_key() {
        let sb = Sandbox::new("vscode");
        mkdir(sb.config.join("Code").join("User"));
        let result = install(&sb.env(), "vscode", URL).expect("install");
        let root = parse(&fs::read_to_string(&result.config_path).expect("read"));
        assert_eq!(
            root["servers"]["db-mcp"],
            json!({"type": "http", "url": URL})
        );
        assert!(root.get("mcpServers").is_none());
    }

    #[test]
    fn claude_desktop_path_is_under_config_dir() {
        let sb = Sandbox::new("claude-desktop-path");
        mkdir(sb.config.join("Claude"));
        let clients = list_clients(&sb.env(), URL);
        let expected = sb.config.join("Claude").join("claude_desktop_config.json");
        assert_eq!(
            by_id(&clients, "claude-desktop").config_path.as_deref(),
            Some(display(&expected).as_str())
        );
    }

    #[test]
    fn snippets_match_each_client_format() {
        let sb = Sandbox::new("snippets");
        let clients = list_clients(&sb.env(), URL);
        assert_eq!(
            parse(&by_id(&clients, "cursor").snippet),
            json!({"mcpServers": {"db-mcp": {"url": URL}}})
        );
        assert_eq!(
            parse(&by_id(&clients, "vscode").snippet),
            json!({"servers": {"db-mcp": {"type": "http", "url": URL}}})
        );
        assert_eq!(
            parse(&by_id(&clients, "claude-desktop").snippet),
            json!({"mcpServers": {"db-mcp": {"command": "npx", "args": ["-y", "mcp-remote", URL]}}})
        );
        assert_eq!(
            by_id(&clients, "claude-code").snippet,
            format!("claude mcp add --transport http db-mcp {URL}")
        );
    }

    #[test]
    fn install_into_missing_file_creates_it() {
        let sb = Sandbox::new("missing");
        sb.dir(".codeium/windsurf");
        let path = sb
            .home
            .join(".codeium")
            .join("windsurf")
            .join("mcp_config.json");
        assert!(!path.exists());

        let result = install(&sb.env(), "windsurf", URL).expect("install");
        assert_eq!(result.config_path, display(&path));
        assert_eq!(result.backup_path, None);

        let text = fs::read_to_string(&path).expect("read");
        assert!(text.ends_with('\n'));
        assert_eq!(
            parse(&text),
            json!({"mcpServers": {"db-mcp": {"serverUrl": URL}}})
        );
    }

    #[test]
    fn install_into_missing_file_in_detected_dir() {
        let sb = Sandbox::new("missing-parent");
        mkdir(sb.config.join("Claude"));
        let result = install(&sb.env(), "claude-desktop", URL).expect("install");
        let path = PathBuf::from(&result.config_path);
        assert!(path.exists());
        assert_eq!(result.backup_path, None);
    }

    #[test]
    fn install_preserves_other_servers_and_key_order() {
        let sb = Sandbox::new("preserve");
        let path = cursor_file(&sb);
        put(
            &path,
            r#"{"zeta":1,"mcpServers":{"other":{"url":"o"},"second":{"url":"s"}},"alpha":true}"#,
        );

        install(&sb.env(), "cursor", URL).expect("install");

        let text = fs::read_to_string(&path).expect("read");
        let root = parse(&text);
        assert_eq!(keys(&root, "mcpServers"), ["other", "second", "db-mcp"]);
        assert_eq!(root["mcpServers"]["other"], json!({"url": "o"}));
        assert_eq!(root["zeta"], json!(1));
        assert_eq!(root["alpha"], json!(true));
        assert_eq!(
            root.as_object().expect("object").keys().collect::<Vec<_>>(),
            ["zeta", "mcpServers", "alpha"]
        );
    }

    #[test]
    fn install_replaces_existing_entry_in_place() {
        let sb = Sandbox::new("replace");
        let path = cursor_file(&sb);
        put(
            &path,
            r#"{"mcpServers":{"a":{"url":"a"},"db-mcp":{"url":"old"},"b":{"url":"b"}}}"#,
        );

        install(&sb.env(), "cursor", URL).expect("install");

        let root = parse(&fs::read_to_string(&path).expect("read"));
        assert_eq!(keys(&root, "mcpServers"), ["a", "db-mcp", "b"]);
        assert_eq!(root["mcpServers"]["db-mcp"], json!({"url": URL}));
    }

    #[test]
    fn identical_reinstall_is_a_noop() {
        let sb = Sandbox::new("noop");
        let path = cursor_file(&sb);
        install(&sb.env(), "cursor", URL).expect("first install");
        let after_first = fs::read_to_string(&path).expect("read");

        let second = install(&sb.env(), "cursor", URL).expect("second install");

        assert_eq!(second.backup_path, None);
        assert_eq!(fs::read_to_string(&path).expect("read"), after_first);
        assert_eq!(backup_count(path.parent().expect("parent")), 0);
    }

    #[test]
    fn invalid_json_is_refused_and_untouched() {
        let sb = Sandbox::new("invalid");
        let path = cursor_file(&sb);
        let original = "// comment\n{\"mcpServers\": {}}\n";
        put(&path, original);

        let err = install(&sb.env(), "cursor", URL).unwrap_err();
        assert!(err.contains("not valid JSON"), "{err}");
        assert!(err.contains("Add the db-mcp snippet manually"), "{err}");
        assert_eq!(fs::read_to_string(&path).expect("read"), original);
        assert_eq!(backup_count(path.parent().expect("parent")), 0);
    }

    #[test]
    fn non_object_root_and_key_are_refused() {
        let sb = Sandbox::new("non-object");
        let path = cursor_file(&sb);

        put(&path, "[1, 2]");
        assert!(install(&sb.env(), "cursor", URL).is_err());
        assert_eq!(fs::read_to_string(&path).expect("read"), "[1, 2]");

        put(&path, r#"{"mcpServers": []}"#);
        let err = install(&sb.env(), "cursor", URL).unwrap_err();
        assert!(err.contains("mcpServers"), "{err}");
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            r#"{"mcpServers": []}"#
        );
    }

    #[test]
    fn empty_file_is_treated_as_empty_object() {
        let sb = Sandbox::new("empty");
        let path = cursor_file(&sb);
        put(&path, "  \n");
        let result = install(&sb.env(), "cursor", URL).expect("install");
        assert!(result.backup_path.is_some());
        assert_eq!(
            parse(&fs::read_to_string(&path).expect("read")),
            json!({"mcpServers": {"db-mcp": {"url": URL}}})
        );
    }

    #[test]
    fn backup_contains_original_content() {
        let sb = Sandbox::new("backup");
        let path = cursor_file(&sb);
        let original = r#"{"mcpServers":{"x":{"url":"x"}}}"#;
        put(&path, original);

        let result = install(&sb.env(), "cursor", URL).expect("install");

        let backup = PathBuf::from(result.backup_path.expect("backup path"));
        assert!(backup
            .file_name()
            .expect("name")
            .to_string_lossy()
            .starts_with("mcp.json.db-mcp-backup-"));
        assert_eq!(fs::read_to_string(&backup).expect("read backup"), original);
    }

    #[test]
    fn backup_names_do_not_collide() {
        let sb = Sandbox::new("backup-collide");
        let path = cursor_file(&sb);
        put(&path, r#"{"mcpServers":{}}"#);

        let first = install(&sb.env(), "cursor", URL).expect("install");
        let second = uninstall(&sb.env(), "cursor").expect("uninstall");

        let first_backup = PathBuf::from(first.backup_path.expect("first backup"));
        let second_backup = PathBuf::from(second.backup_path.expect("second backup"));
        assert_ne!(first_backup, second_backup);
        assert_eq!(
            fs::read_to_string(&first_backup).expect("read"),
            r#"{"mcpServers":{}}"#
        );
        assert!(fs::read_to_string(&second_backup)
            .expect("read")
            .contains(URL));
    }

    #[test]
    fn uninstall_removes_only_our_entry() {
        let sb = Sandbox::new("uninstall");
        let path = cursor_file(&sb);
        put(
            &path,
            r#"{"extra":1,"mcpServers":{"other":{"command":"x"},"db-mcp":{"url":"u"},"last":{}}}"#,
        );

        let result = uninstall(&sb.env(), "cursor").expect("uninstall");
        assert!(result.backup_path.is_some());

        let root = parse(&fs::read_to_string(&path).expect("read"));
        assert_eq!(keys(&root, "mcpServers"), ["other", "last"]);
        assert_eq!(root["extra"], json!(1));
    }

    #[test]
    fn uninstall_keeps_empty_server_object() {
        let sb = Sandbox::new("uninstall-empty");
        let path = cursor_file(&sb);
        put(&path, r#"{"mcpServers":{"db-mcp":{"url":"u"}}}"#);

        uninstall(&sb.env(), "cursor").expect("uninstall");

        assert_eq!(
            parse(&fs::read_to_string(&path).expect("read")),
            json!({"mcpServers": {}})
        );
    }

    #[test]
    fn uninstall_when_absent_is_a_noop() {
        let sb = Sandbox::new("uninstall-absent");
        let path = cursor_file(&sb);

        let result = uninstall(&sb.env(), "cursor").expect("uninstall missing");
        assert_eq!(result.backup_path, None);
        assert!(!path.exists());

        put(&path, r#"{"mcpServers":{"other":{}}}"#);
        let result = uninstall(&sb.env(), "cursor").expect("uninstall unconfigured");
        assert_eq!(result.backup_path, None);
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            r#"{"mcpServers":{"other":{}}}"#
        );
        assert_eq!(backup_count(path.parent().expect("parent")), 0);
    }

    #[test]
    fn claude_code_never_installs_or_uninstalls() {
        let sb = Sandbox::new("claude-code");
        let path = sb.home.join(".claude.json");
        let original = r#"{"mcpServers":{}}"#;
        put(&path, original);
        let expected = format!(
            "Claude Code is configured with its CLI: claude mcp add --transport http db-mcp {URL}"
        );

        assert_eq!(
            install(&sb.env(), "claude-code", URL).unwrap_err(),
            expected
        );
        assert_eq!(
            preview_install(&sb.env(), "claude-code", URL).unwrap_err(),
            expected
        );
        let err = uninstall(&sb.env(), "claude-code").unwrap_err();
        assert!(
            err.starts_with("Claude Code is configured with its CLI"),
            "{err}"
        );

        assert_eq!(fs::read_to_string(&path).expect("read"), original);
        assert_eq!(backup_count(&sb.home), 0);
    }

    #[test]
    fn preview_does_not_write_and_reports_before_after() {
        let sb = Sandbox::new("preview");
        let path = cursor_file(&sb);
        let original = r#"{"mcpServers":{"other":{"url":"o"}}}"#;
        put(&path, original);

        let preview = preview_install(&sb.env(), "cursor", URL).expect("preview");

        assert_eq!(preview.config_path, display(&path));
        assert_eq!(preview.before, original);
        assert_eq!(
            parse(&preview.after),
            json!({"mcpServers": {"other": {"url": "o"}, "db-mcp": {"url": URL}}})
        );
        assert_eq!(fs::read_to_string(&path).expect("read"), original);
        assert_eq!(backup_count(path.parent().expect("parent")), 0);
    }

    #[test]
    fn preview_for_missing_file_writes_nothing() {
        let sb = Sandbox::new("preview-missing");
        let path = cursor_file(&sb);

        let preview = preview_install(&sb.env(), "cursor", URL).expect("preview");

        assert_eq!(preview.before, "");
        assert!(preview.after.contains(URL));
        assert!(!path.exists());
    }

    #[test]
    fn preview_of_already_configured_shows_no_change() {
        let sb = Sandbox::new("preview-noop");
        sb.dir(".cursor");
        install(&sb.env(), "cursor", URL).expect("install");
        let preview = preview_install(&sb.env(), "cursor", URL).expect("preview");
        assert_eq!(preview.before, preview.after);
    }

    #[test]
    fn unknown_id_is_rejected() {
        let sb = Sandbox::new("unknown");
        let env = sb.env();
        assert_eq!(
            install(&env, "nope", URL).unwrap_err(),
            "Unknown AI client: nope"
        );
        assert_eq!(
            preview_install(&env, "nope", URL).unwrap_err(),
            "Unknown AI client: nope"
        );
        assert_eq!(
            uninstall(&env, "nope").unwrap_err(),
            "Unknown AI client: nope"
        );
    }

    #[test]
    fn not_detected_client_is_rejected() {
        let sb = Sandbox::new("not-detected");
        assert_eq!(
            install(&sb.env(), "cursor", URL).unwrap_err(),
            "Cursor is not installed on this computer"
        );
        assert_eq!(
            uninstall(&sb.env(), "lm-studio").unwrap_err(),
            "LM Studio is not installed on this computer"
        );
    }

    #[cfg(unix)]
    #[test]
    fn install_preserves_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let sb = Sandbox::new("perms");
        let path = cursor_file(&sb);
        put(&path, r#"{"mcpServers":{}}"#);
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).expect("chmod");

        install(&sb.env(), "cursor", URL).expect("install");

        let mode = fs::metadata(&path).expect("meta").permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert!(!sibling(&path, TEMP_SUFFIX).exists());
    }
}
