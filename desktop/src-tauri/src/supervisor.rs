use std::{
    collections::VecDeque,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, ChildStderr, ChildStdout, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::{Arc, Mutex as StdMutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use log::warn;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{sync::Mutex, time::sleep};

use crate::{secrets, settings::SettingsStore, tray};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const HEALTH_INTERVAL: Duration = Duration::from_secs(1);
const LOG_LIMIT_BYTES: u64 = 5 * 1024 * 1024;
const LOG_KEEP: usize = 3;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ServerState {
    Starting,
    Healthy,
    Unhealthy,
    Restarting,
    Stopped,
    Failed,
    PortInUse,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub state: ServerState,
    pub port: u16,
    pub base_url: String,
    pub mcp_url: String,
    pub session_token: String,
    pub version: Option<String>,
    pub last_error: Option<String>,
    pub restarts: u32,
    pub mode: ServerMode,
    pub attached: bool,
    pub pid: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ServerMode {
    Embedded,
    Background,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRecord {
    pub pid: u32,
    pub port: u16,
    pub session_token: String,
    pub version: String,
    pub started_at: u64,
}

impl PartialEq for ServerRecord {
    fn eq(&self, other: &Self) -> bool {
        self.pid == other.pid
            && self.port == other.port
            && self.session_token == other.session_token
            && self.version == other.version
            && self.started_at == other.started_at
    }
}

#[derive(Clone)]
struct LogBuffer {
    path: PathBuf,
    lines: Arc<StdMutex<VecDeque<String>>>,
    file_lock: Arc<StdMutex<()>>,
}

pub struct Supervisor {
    app: AppHandle,
    info: Arc<Mutex<ServerInfo>>,
    child: Arc<Mutex<Option<Child>>>,
    stopping: Arc<AtomicBool>,
    log: LogBuffer,
    encryption_key: String,
    database_path: PathBuf,
    app_data_dir: PathBuf,
    mode: ServerMode,
    attached: Arc<AtomicBool>,
}

impl Supervisor {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let log_dir = app
            .path()
            .app_log_dir()
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&app_data_dir)
            .map_err(|error| format!("Could not create app data directory: {error}"))?;
        fs::create_dir_all(&log_dir)
            .map_err(|error| format!("Could not create app log directory: {error}"))?;
        let encryption_key = secrets::encryption_key(&app_data_dir)?;
        let port = app.state::<SettingsStore>().get().port;
        Ok(Self {
            app,
            info: Arc::new(Mutex::new(make_server_info(
                port,
                String::new(),
                ServerState::Stopped,
                None,
                None,
                0,
                ServerMode::Embedded,
                false,
                None,
            ))),
            child: Arc::new(Mutex::new(None)),
            stopping: Arc::new(AtomicBool::new(false)),
            log: LogBuffer::new(log_dir.join("server.log"))?,
            encryption_key,
            database_path: app_data_dir.join("db-mcp.sqlite"),
            app_data_dir,
            mode: ServerMode::Embedded,
            attached: Arc::new(AtomicBool::new(false)),
        })
    }

    pub async fn info(&self) -> ServerInfo {
        self.info.lock().await.clone()
    }

    pub fn is_attached(&self) -> bool {
        self.attached.load(Ordering::SeqCst)
    }

    pub async fn logs(&self, count: usize) -> Vec<String> {
        self.log.last(count).await
    }

    pub async fn start(&mut self, port: u16) -> Result<ServerInfo, String> {
        self.mode = ServerMode::Embedded;
        self.attached.store(false, Ordering::SeqCst);
        self.start_inner(port).await
    }

    pub async fn start_background(&mut self, port: u16) -> Result<ServerInfo, String> {
        self.mode = ServerMode::Background;
        self.attached.store(false, Ordering::SeqCst);
        self.start_inner(port).await
    }

    async fn start_inner(&mut self, port: u16) -> Result<ServerInfo, String> {
        validate_port(port)?;
        if self.child.lock().await.is_some() {
            self.stop().await?;
        }
        self.stopping = Arc::new(AtomicBool::new(false));
        let token = random_token()?;
        self.set_state(port, token.clone(), ServerState::Starting, None, None)
            .await;

        if let Some((pid, _version)) = probe_db_mcp(port).await {
            let message = format!("Another DB MCP server is already running on this port (pid {pid}). Quit it or change the port.");
            self.set_state(
                port,
                token,
                ServerState::PortInUse,
                Some(message.clone()),
                None,
            )
            .await;
            return Ok(self.info().await);
        }
        if is_port_bound(port) {
            let message = format!(
                "Port {port} is already in use by another process. Quit it or change the port."
            );
            self.set_state(
                port,
                token,
                ServerState::PortInUse,
                Some(message.clone()),
                None,
            )
            .await;
            return Ok(self.info().await);
        }

        let mut crash_times = VecDeque::new();
        let (child, server_pid, mut version, restarts) = loop {
            let mut child = match self.spawn_child(port, &token) {
                Ok(child) => child,
                Err(error) => {
                    if record_crash(&mut crash_times, Instant::now()) {
                        self.set_state(port, token, ServerState::Failed, Some(error.clone()), None)
                            .await;
                        return Err(error);
                    }
                    let restarts = crash_times.len() as u32;
                    self.set_state(
                        port,
                        token.clone(),
                        ServerState::Restarting,
                        Some(error),
                        None,
                    )
                    .await;
                    sleep(backoff_delay(restarts)).await;
                    continue;
                }
            };
            self.attach_output(child.stdout.take(), child.stderr.take());
            let startup_started = Instant::now();
            let startup_result = loop {
                if let Some((pid, version)) = probe_db_mcp(port).await {
                    break Ok((pid, version));
                }
                if let Some(status) = child
                    .try_wait()
                    .map_err(|error| format!("Could not monitor backend: {error}"))?
                {
                    break Err(format!(
                        "Backend exited during startup ({status}). {}",
                        self.log.last_stderr(20).await.join(" | ")
                    ));
                }
                if startup_started.elapsed() >= STARTUP_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err("Backend did not become healthy within 15 seconds".to_owned());
                }
                sleep(HEALTH_INTERVAL).await;
            };
            match startup_result {
                Ok((pid, version)) => break (child, pid, Some(version), crash_times.len() as u32),
                Err(error) => {
                    if record_crash(&mut crash_times, Instant::now()) {
                        self.set_state(port, token, ServerState::Failed, Some(error.clone()), None)
                            .await;
                        return Err(error);
                    }
                    let restarts = crash_times.len() as u32;
                    self.set_state(
                        port,
                        token.clone(),
                        ServerState::Restarting,
                        Some(error),
                        None,
                    )
                    .await;
                    sleep(backoff_delay(restarts)).await;
                }
            }
        };
        *self.child.lock().await = Some(child);
        self.info.lock().await.restarts = restarts;
        self.set_state(
            port,
            token.clone(),
            ServerState::Healthy,
            None,
            version.take(),
        )
        .await;
        self.info.lock().await.pid = Some(server_pid);
        let version = self.info.lock().await.version.clone();
        self.write_server_record(server_pid, port, &token, version.as_deref())?;
        self.start_monitor(port, token);
        Ok(self.info().await)
    }

    pub async fn stop(&mut self) -> Result<ServerInfo, String> {
        self.attached.store(false, Ordering::SeqCst);
        self.stop_inner(true).await
    }

    pub async fn stop_for_exit(&mut self) -> Result<ServerInfo, String> {
        self.attached.store(false, Ordering::SeqCst);
        self.stop_inner(false).await
    }

    pub async fn attach(&mut self, record: ServerRecord) -> Result<ServerInfo, String> {
        self.stop().await?;
        self.mode = ServerMode::Background;
        self.attached.store(true, Ordering::SeqCst);
        let health = probe_db_mcp(record.port)
            .await
            .filter(|(pid, _)| *pid == record.pid)
            .ok_or_else(|| "Background server is no longer available".to_owned())?;
        *self.info.lock().await = make_server_info(
            record.port,
            record.session_token.clone(),
            ServerState::Healthy,
            None,
            Some(health.1),
            0,
            ServerMode::Background,
            true,
            Some(record.pid),
        );
        self.emit().await;
        self.start_attached_monitor(record.port);
        Ok(self.info().await)
    }

    pub(crate) fn kill_now(&mut self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut child) = self.child.try_lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
            }
        }
    }

    async fn stop_inner(&mut self, notify_ui: bool) -> Result<ServerInfo, String> {
        self.stopping.store(true, Ordering::SeqCst);
        let owned_process = self.child.lock().await.is_some();
        let mut info = self.info.lock().await;
        info.state = ServerState::Stopped;
        info.version = None;
        let port = info.port;
        let token = info.session_token.clone();
        drop(info);
        if notify_ui {
            self.emit().await;
        }
        if let Some(mut child) = self.child.lock().await.take() {
            drop(child.stdin.take());
            let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
            loop {
                if child
                    .try_wait()
                    .map_err(|error| format!("Could not wait for backend shutdown: {error}"))?
                    .is_some()
                {
                    break;
                }
                if Instant::now() >= deadline {
                    child.kill().map_err(|error| {
                        format!("Could not kill backend after timeout: {error}")
                    })?;
                    let _ = child.wait();
                    break;
                }
                sleep(Duration::from_millis(100)).await;
            }
        }
        // Only the process that owns the backend child (the headless server)
        // removes server.json. A UI attached to a background server must leave
        // it in place, or the next launch can no longer find that server.
        if self.mode == ServerMode::Background && owned_process {
            let _ = fs::remove_file(self.app_data_dir.join("server.json"));
        }
        if notify_ui {
            self.set_state(port, token, ServerState::Stopped, None, None)
                .await;
        }
        Ok(self.info().await)
    }

    pub async fn restart(&mut self, port: u16) -> Result<ServerInfo, String> {
        self.stop().await?;
        self.start(port).await
    }

    pub async fn reset(&mut self, port: u16) -> Result<ServerInfo, String> {
        self.stop().await?;
        self.reset_data()?;
        self.start(port).await
    }

    pub fn reset_data(&mut self) -> Result<(), String> {
        for suffix in ["", "-wal", "-shm"] {
            let mut file_name = self.database_path.as_os_str().to_os_string();
            file_name.push(suffix);
            let path = PathBuf::from(file_name);
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("Could not delete database file: {error}")),
            }
        }
        secrets::delete_encryption_key(&self.app_data_dir)?;
        self.encryption_key = secrets::encryption_key(&self.app_data_dir)?;
        Ok(())
    }

    fn spawn_child(&self, port: u16, token: &str) -> Result<Child, String> {
        let node_path = node_binary_path(&self.app)?;
        let server_path = server_bundle_path(&self.app)?;
        let mut command = Command::new(node_path);
        command
            .arg(server_path)
            .env("HOST", "127.0.0.1")
            .env("PORT", port.to_string())
            .env("DATABASE_PATH", &self.database_path)
            .env("ENCRYPTION_KEY", &self.encryption_key)
            .env("APP_SESSION_TOKEN", token)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(debug_assertions)]
        command.env("ALLOWED_ORIGINS", "http://localhost:5173");
        command
            .spawn()
            .map_err(|error| format!("Could not start bundled backend: {error}"))
    }

    fn attach_output(&self, stdout: Option<ChildStdout>, stderr: Option<ChildStderr>) {
        let log = self.log.clone();
        if let Some(stdout) = stdout {
            let log = log.clone();
            thread::spawn(move || consume_lines(BufReader::new(stdout), log, "stdout"));
        }
        if let Some(stderr) = stderr {
            thread::spawn(move || consume_lines(BufReader::new(stderr), log, "stderr"));
        }
    }

    fn start_monitor(&self, port: u16, token: String) {
        let app = self.app.clone();
        let info = Arc::clone(&self.info);
        let child = Arc::clone(&self.child);
        let stopping = Arc::clone(&self.stopping);
        let encryption_key = self.encryption_key.clone();
        let database_path = self.database_path.clone();
        let log = self.log.clone();
        let app_data_dir = self.app_data_dir.clone();
        let mode = self.mode.clone();
        tauri::async_runtime::spawn(async move {
            let mut consecutive_failures = 0_u8;
            let mut crash_times = VecDeque::new();
            loop {
                if stopping.load(Ordering::SeqCst) {
                    break;
                }
                sleep(HEALTH_INTERVAL).await;
                let health = probe_db_mcp(port).await;
                let mut child_guard = child.lock().await;
                let Some(process) = child_guard.as_mut() else {
                    break;
                };
                match process.try_wait() {
                    Ok(Some(status)) => {
                        child_guard.take();
                        if mode == ServerMode::Background {
                            let _ = fs::remove_file(app_data_dir.join("server.json"));
                        }
                        if mode == ServerMode::Background {
                            let _ = fs::remove_file(app_data_dir.join("server.json"));
                        }
                        let stop_retrying = record_crash(&mut crash_times, Instant::now());
                        let current = info.lock().await.clone();
                        let count = current.restarts + 1;
                        let last_error = format!(
                            "Backend exited ({status}). {}",
                            log.last_stderr(20).await.join(" | ")
                        );
                        if stop_retrying {
                            update_info(
                                &app,
                                &info,
                                port,
                                token.clone(),
                                ServerState::Failed,
                                Some(last_error),
                                current.version.clone(),
                                count,
                            )
                            .await;
                            break;
                        }
                        update_info(
                            &app,
                            &info,
                            port,
                            token.clone(),
                            ServerState::Restarting,
                            Some(last_error),
                            None,
                            count,
                        )
                        .await;
                        let delay = backoff_delay(crash_times.len() as u32);
                        drop(child_guard);
                        sleep(delay).await;
                        if stopping.load(Ordering::SeqCst) {
                            break;
                        }
                        match spawn_for_restart(
                            &app,
                            port,
                            &token,
                            &encryption_key,
                            &database_path,
                            &log,
                        ) {
                            Ok(restarted) => {
                                let pid = loop {
                                    if let Some((pid, _)) = probe_db_mcp(port).await {
                                        break pid;
                                    }
                                    if stopping.load(Ordering::SeqCst) {
                                        break restarted.id();
                                    }
                                    sleep(HEALTH_INTERVAL).await;
                                };
                                info.lock().await.pid = Some(pid);
                                if mode == ServerMode::Background {
                                    let record = ServerRecord {
                                        pid,
                                        port,
                                        session_token: token.clone(),
                                        version: env!("CARGO_PKG_VERSION").to_owned(),
                                        started_at: SystemTime::now()
                                            .duration_since(UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs(),
                                    };
                                    if let Err(error) = write_server_record(
                                        &app_data_dir.join("server.json"),
                                        &record,
                                    ) {
                                        warn!("Could not update background server record: {error}");
                                    }
                                }
                                *child.lock().await = Some(restarted);
                                consecutive_failures = 0;
                                update_info(
                                    &app,
                                    &info,
                                    port,
                                    token.clone(),
                                    ServerState::Starting,
                                    None,
                                    None,
                                    count,
                                )
                                .await;
                            }
                            Err(error) => {
                                update_info(
                                    &app,
                                    &info,
                                    port,
                                    token.clone(),
                                    ServerState::Failed,
                                    Some(error),
                                    None,
                                    count,
                                )
                                .await;
                                break;
                            }
                        }
                    }
                    Ok(None) => {
                        drop(child_guard);
                        if health.is_some() {
                            consecutive_failures = 0;
                            let current = info.lock().await.clone();
                            if current.state != ServerState::Healthy {
                                update_info(
                                    &app,
                                    &info,
                                    port,
                                    token.clone(),
                                    ServerState::Healthy,
                                    None,
                                    health.map(|item| item.1),
                                    current.restarts,
                                )
                                .await;
                            }
                        } else {
                            consecutive_failures = consecutive_failures.saturating_add(1);
                            if consecutive_failures >= 3 {
                                let current = info.lock().await.clone();
                                if current.state != ServerState::Unhealthy {
                                    update_info(
                                        &app,
                                        &info,
                                        port,
                                        token.clone(),
                                        ServerState::Unhealthy,
                                        Some("Backend health check failed three times".to_owned()),
                                        current.version,
                                        current.restarts,
                                    )
                                    .await;
                                }
                            }
                        }
                    }
                    Err(error) => {
                        warn!("Could not poll backend process: {error}");
                        break;
                    }
                }
            }
        });
    }

    async fn set_state(
        &self,
        port: u16,
        token: String,
        state: ServerState,
        error: Option<String>,
        version: Option<String>,
    ) {
        let pid = self
            .child
            .lock()
            .await
            .as_ref()
            .map(Child::id)
            .or(self.info.lock().await.pid);
        let mut info = self.info.lock().await;
        let restarts = info.restarts;
        let attached = self.attached.load(Ordering::SeqCst);
        *info = make_server_info(
            port,
            token,
            state,
            error,
            version,
            restarts,
            self.mode.clone(),
            attached,
            pid,
        );
        drop(info);
        self.emit().await;
    }

    fn write_server_record(
        &self,
        pid: u32,
        port: u16,
        token: &str,
        version: Option<&str>,
    ) -> Result<(), String> {
        if self.mode != ServerMode::Background {
            return Ok(());
        }
        let record = ServerRecord {
            pid,
            port,
            session_token: token.to_owned(),
            version: version.unwrap_or(env!("CARGO_PKG_VERSION")).to_owned(),
            started_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };
        write_server_record(&self.app_data_dir.join("server.json"), &record)
    }

    fn start_attached_monitor(&self, port: u16) {
        let app = self.app.clone();
        let info = Arc::clone(&self.info);
        let attached = Arc::clone(&self.attached);
        let server_file = self.app_data_dir.join("server.json");
        tauri::async_runtime::spawn(async move {
            let mut failed = 0_u8;
            while attached.load(Ordering::SeqCst) {
                sleep(HEALTH_INTERVAL).await;
                let current = info.lock().await.clone();
                let health = probe_db_mcp(current.port).await;
                if health
                    .as_ref()
                    .is_some_and(|(pid, _)| Some(*pid) == current.pid)
                {
                    failed = 0;
                    continue;
                }
                failed = failed.saturating_add(1);
                if failed == 1 {
                    update_attached_info(
                        &app,
                        &info,
                        ServerState::Restarting,
                        Some("Background server is restarting".to_owned()),
                        None,
                    )
                    .await;
                }
                if let Ok(Some(record)) = read_server_record(&server_file) {
                    if let Some((pid, version)) = probe_db_mcp(record.port)
                        .await
                        .filter(|(pid, _)| *pid == record.pid)
                    {
                        *info.lock().await = make_server_info(
                            record.port,
                            record.session_token,
                            ServerState::Healthy,
                            None,
                            Some(version),
                            0,
                            ServerMode::Background,
                            true,
                            Some(pid),
                        );
                        let updated = info.lock().await.clone();
                        let _ = app.emit("server://state", updated.clone());
                        tray::update_status(&app, &updated);
                        failed = 0;
                    }
                } else if failed > 5 {
                    update_attached_info(
                        &app,
                        &info,
                        ServerState::Failed,
                        Some("Background server stopped".to_owned()),
                        None,
                    )
                    .await;
                }
                let _ = port;
            }
        });
    }

    async fn emit(&self) {
        let info = self.info().await;
        let _ = self.app.emit("server://state", info.clone());
        tray::update_status(&self.app, &info);
    }
}

impl LogBuffer {
    fn new(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create logs directory: {error}"))?;
        }
        Ok(Self {
            path,
            lines: Arc::new(StdMutex::new(VecDeque::with_capacity(500))),
            file_lock: Arc::new(StdMutex::new(())),
        })
    }

    fn push(&self, line: String) {
        let mut lines = self
            .lines
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if lines.len() == 500 {
            lines.pop_front();
        }
        lines.push_back(line.clone());
        drop(lines);
        let _file_lock = self
            .file_lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Err(error) = append_rotating(&self.path, &line) {
            warn!("Could not append backend log: {error}");
        }
    }

    async fn last(&self, count: usize) -> Vec<String> {
        let lines = self
            .lines
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let start = lines.len().saturating_sub(count.min(500));
        lines.iter().skip(start).cloned().collect()
    }

    async fn last_stderr(&self, count: usize) -> Vec<String> {
        self.last(500)
            .await
            .into_iter()
            .filter(|line| line.starts_with("stderr: "))
            .rev()
            .take(count)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }
}

fn consume_lines<R: BufRead>(reader: R, log: LogBuffer, stream: &str) {
    for line in reader.lines() {
        match line {
            Ok(line) => log.push(format!("{stream}: {line}")),
            Err(error) => {
                warn!("Could not read backend {stream}: {error}");
                break;
            }
        }
    }
}

fn append_rotating(path: &Path, line: &str) -> std::io::Result<()> {
    if path
        .metadata()
        .map(|metadata| metadata.len() >= LOG_LIMIT_BYTES)
        .unwrap_or(false)
    {
        for index in (1..=LOG_KEEP).rev() {
            let source = if index == 1 {
                path.to_path_buf()
            } else {
                rotated_path(path, index - 1)
            };
            let destination = rotated_path(path, index);
            if source.exists() {
                let _ = fs::remove_file(&destination);
                fs::rename(source, destination)?;
            }
        }
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{line}")
}

fn rotated_path(path: &Path, index: usize) -> PathBuf {
    PathBuf::from(format!("{}.{}", path.display(), index))
}

pub(crate) fn validate_port(port: u16) -> Result<(), String> {
    if (1024..=65535).contains(&port) {
        Ok(())
    } else {
        Err("Port must be between 1024 and 65535".to_owned())
    }
}

fn backoff_delay(crashes: u32) -> Duration {
    Duration::from_secs(
        1_u64
            .checked_shl(crashes.saturating_sub(1).min(5))
            .unwrap_or(30)
            .min(30),
    )
}

fn record_crash(crash_times: &mut VecDeque<Instant>, now: Instant) -> bool {
    crash_times.push_back(now);
    while crash_times
        .front()
        .is_some_and(|time| now.duration_since(*time) > Duration::from_secs(120))
    {
        crash_times.pop_front();
    }
    crash_times.len() >= 5
}

#[allow(clippy::too_many_arguments)]
fn make_server_info(
    port: u16,
    token: String,
    state: ServerState,
    last_error: Option<String>,
    version: Option<String>,
    restarts: u32,
    mode: ServerMode,
    attached: bool,
    pid: Option<u32>,
) -> ServerInfo {
    ServerInfo {
        state,
        port,
        base_url: format!("http://127.0.0.1:{port}"),
        mcp_url: format!("http://127.0.0.1:{port}/mcp"),
        session_token: token,
        version,
        last_error,
        restarts,
        mode,
        attached,
        pid,
    }
}

fn random_token() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Could not generate session token: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

async fn probe_db_mcp(port: u16) -> Option<(u32, String)> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .ok()?;
    let response = client
        .get(format!("http://127.0.0.1:{port}/api/health"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let value: serde_json::Value = response.json().await.ok()?;
    if value.get("app")?.as_str()? != "db-mcp" {
        return None;
    }
    Some((
        value.get("pid")?.as_u64()? as u32,
        value.get("version")?.as_str()?.to_owned(),
    ))
}

fn is_port_bound(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(150)).is_ok()
}

pub fn read_server_record(path: &Path) -> Result<Option<ServerRecord>, String> {
    let content = match fs::read(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Could not read background server record: {error}")),
    };
    let record: ServerRecord = serde_json::from_slice(&content)
        .map_err(|error| format!("Background server record is invalid: {error}"))?;
    Ok(Some(record))
}

fn write_server_record(path: &Path, record: &ServerRecord) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Background server record has no parent directory".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec(record)
        .map_err(|error| format!("Could not encode background server record: {error}"))?;
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| format!("Could not write background server record: {error}"))?;
    file.write_all(&contents)
        .map_err(|error| format!("Could not write background server record: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not sync background server record: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Could not publish background server record: {error}"))
}

async fn update_attached_info(
    app: &AppHandle,
    target: &Arc<Mutex<ServerInfo>>,
    state: ServerState,
    error: Option<String>,
    version: Option<String>,
) {
    let current = target.lock().await.clone();
    *target.lock().await = make_server_info(
        current.port,
        current.session_token,
        state,
        error,
        version,
        current.restarts,
        ServerMode::Background,
        true,
        current.pid,
    );
    let info = target.lock().await.clone();
    let _ = app.emit("server://state", info.clone());
    tray::update_status(app, &info);
}

fn node_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(target_os = "windows") {
        "node-x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "node-aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") {
        "node-x86_64-apple-darwin"
    } else if cfg!(target_arch = "aarch64") {
        "node-aarch64-unknown-linux-gnu"
    } else {
        "node-x86_64-unknown-linux-gnu"
    };
    let mut candidates = Vec::new();
    let bundled = is_running_from_bundle();
    if !bundled {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(name),
        );
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.join(if cfg!(target_os = "windows") {
                "node.exe"
            } else {
                "node"
            }));
            candidates.push(parent.join(name));
            candidates.push(parent.join("binaries").join(name));
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(name));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| format!("Bundled Node runtime was not found ({name})"))
}

fn server_bundle_path(app: &AppHandle) -> Result<PathBuf, String> {
    if !is_running_from_bundle() {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/server/index.mjs"));
    }
    app.path()
        .resource_dir()
        .map(|path| path.join("server/index.mjs"))
        .map_err(|error| error.to_string())
}

fn is_running_from_bundle() -> bool {
    let Ok(executable) = std::env::current_exe() else {
        return false;
    };
    #[cfg(target_os = "macos")]
    {
        executable.ancestors().any(|ancestor| {
            ancestor.file_name().is_some_and(|name| name == "MacOS")
                && ancestor
                    .parent()
                    .is_some_and(|parent| parent.file_name().is_some_and(|name| name == "Contents"))
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        !tauri::is_dev()
    }
}

fn spawn_for_restart(
    app: &AppHandle,
    port: u16,
    token: &str,
    encryption_key: &str,
    database_path: &Path,
    log: &LogBuffer,
) -> Result<Child, String> {
    let node_path = node_binary_path(app)?;
    let server_path = server_bundle_path(app)?;
    let mut command = Command::new(node_path);
    command
        .arg(server_path)
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("DATABASE_PATH", database_path)
        .env("ENCRYPTION_KEY", encryption_key)
        .env("APP_SESSION_TOKEN", token)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(debug_assertions)]
    command.env("ALLOWED_ORIGINS", "http://localhost:5173");
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not restart bundled backend: {error}"))?;
    let output_log = log.clone();
    if let Some(stdout) = child.stdout.take() {
        let log = output_log.clone();
        thread::spawn(move || consume_lines(BufReader::new(stdout), log, "stdout"));
    }
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || consume_lines(BufReader::new(stderr), output_log, "stderr"));
    }
    Ok(child)
}

#[allow(clippy::too_many_arguments)]
async fn update_info(
    app: &AppHandle,
    target: &Arc<Mutex<ServerInfo>>,
    port: u16,
    token: String,
    state: ServerState,
    error: Option<String>,
    version: Option<String>,
    restarts: u32,
) {
    let current = target.lock().await.clone();
    *target.lock().await = make_server_info(
        port,
        token,
        state,
        error,
        version,
        restarts,
        current.mode,
        current.attached,
        current.pid,
    );
    let info = target.lock().await.clone();
    let _ = app.emit("server://state", info.clone());
    tray::update_status(app, &info);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_schedule_caps_at_thirty_seconds() {
        assert_eq!(backoff_delay(1), Duration::from_secs(1));
        assert_eq!(backoff_delay(2), Duration::from_secs(2));
        assert_eq!(backoff_delay(3), Duration::from_secs(4));
        assert_eq!(backoff_delay(6), Duration::from_secs(30));
        assert_eq!(backoff_delay(10), Duration::from_secs(30));
    }

    #[test]
    fn port_validation_enforces_contract_range() {
        assert!(validate_port(1024).is_ok());
        assert!(validate_port(65535).is_ok());
        assert!(validate_port(1023).is_err());
    }

    #[test]
    fn crash_window_stops_after_five_crashes_within_two_minutes() {
        let start = Instant::now();
        let mut crashes = VecDeque::new();
        for offset in 0..4 {
            assert!(!record_crash(
                &mut crashes,
                start + Duration::from_secs(offset * 10)
            ));
        }
        assert!(record_crash(&mut crashes, start + Duration::from_secs(40)));
        assert!(!record_crash(
            &mut VecDeque::new(),
            start + Duration::from_secs(121)
        ));
    }

    #[test]
    fn log_rotation_keeps_three_archives() {
        let path = std::env::temp_dir().join(format!("db-mcp-rotation-{}.log", std::process::id()));
        let _ = fs::remove_file(&path);
        fs::write(&path, vec![b'x'; LOG_LIMIT_BYTES as usize]).expect("create full log");
        append_rotating(&path, "new line").expect("rotate log");
        assert_eq!(
            fs::read(rotated_path(&path, 1)).expect("archive").len(),
            LOG_LIMIT_BYTES as usize
        );
        assert!(fs::read_to_string(&path)
            .expect("new log")
            .contains("new line"));
        for index in 0..=LOG_KEEP {
            let candidate = if index == 0 {
                path.clone()
            } else {
                rotated_path(&path, index)
            };
            let _ = fs::remove_file(candidate);
        }
    }

    #[test]
    fn server_record_round_trips_and_missing_records_are_stale() {
        let path =
            std::env::temp_dir().join(format!("db-mcp-server-record-{}.json", std::process::id()));
        let record = ServerRecord {
            pid: 123,
            port: 4321,
            session_token: "secret-token".to_owned(),
            version: "0.1.0".to_owned(),
            started_at: 42,
        };
        write_server_record(&path, &record).expect("write record");
        assert_eq!(
            read_server_record(&path).expect("read record"),
            Some(record)
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path)
                    .expect("record metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        fs::remove_file(&path).expect("remove record");
        assert_eq!(
            read_server_record(&path).expect("missing record is stale"),
            None
        );
    }

    #[test]
    fn writes_replace_a_preexisting_record_without_changing_private_mode() {
        let path = std::env::temp_dir().join(format!(
            "db-mcp-server-record-replace-{}.json",
            std::process::id()
        ));
        fs::write(&path, "old record").expect("create prior record");
        let record = ServerRecord {
            pid: 321,
            port: 4322,
            session_token: "new-token".to_owned(),
            version: "0.1.1".to_owned(),
            started_at: 43,
        };
        write_server_record(&path, &record).expect("replace record");
        assert_eq!(
            read_server_record(&path).expect("read replacement"),
            Some(record)
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path)
                    .expect("record metadata")
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        fs::remove_file(path).expect("remove record");
    }
}
