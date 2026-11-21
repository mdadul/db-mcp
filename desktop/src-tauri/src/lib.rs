mod ai_clients;


use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use log::{error, info};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

type SidecarChild = Arc<Mutex<Option<CommandChild>>>;

pub fn run() {
    let child: SidecarChild = Arc::new(Mutex::new(None));
    let setup_child = Arc::clone(&child);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(move |app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let encryption_key = encryption_key(&app_data_dir)?;
            let database_path = app_data_dir.join("db-mcp.sqlite");
            #[cfg(debug_assertions)]
            let server_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("server").join("index.mjs");
            #[cfg(not(debug_assertions))]
            let server_path = app.path().resource_dir()?.join("server").join("index.mjs");
            let server_path = server_path.to_string_lossy().into_owned();
            let database_path = database_path.to_string_lossy().into_owned();

            let (mut events, sidecar) = app
                .shell()
                .sidecar("node")?
                .args([server_path])
                .env("HOST", "127.0.0.1")
                .env("PORT", "4080")
                .env("DATABASE_PATH", database_path)
                .env("ENCRYPTION_KEY", encryption_key)
                .spawn()?;

            *setup_child
                .lock()
                .map_err(|_| std::io::Error::other("sidecar child lock poisoned"))? = Some(sidecar);

            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            info!("sidecar stdout: {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        CommandEvent::Stderr(bytes) => {
                            info!("sidecar stderr: {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        CommandEvent::Error(message) => error!("sidecar error: {message}"),
                        CommandEvent::Terminated(payload) => {
                            info!("sidecar terminated: {payload:?}");
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DB MCP Desktop");

    app.run(move |_app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            if let Ok(mut child) = child.lock() {
                if let Some(child) = child.take() {
                    if let Err(error) = child.kill() {
                        error!("failed to stop sidecar: {error}");
                    }
                }
            }
        }
    });
}

fn encryption_key(app_data_dir: &PathBuf) -> Result<String, Box<dyn std::error::Error>> {
    if let Ok(key) = std::env::var("DB_MCP_DEV_ENCRYPTION_KEY") {
        return Ok(key);
    }

    // TODO(phase 2b): move this development fallback into the OS keychain.
    let key_path = app_data_dir.join("dev-encryption.key");
    match fs::read_to_string(&key_path) {
        Ok(key) => return Ok(key.trim().to_owned()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    let mut random_bytes = [0_u8; 32];
    getrandom::fill(&mut random_bytes)
        .map_err(|error| std::io::Error::other(format!("could not generate encryption key: {error}")))?;
    let key = random_bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(&key_path) {
        Ok(mut file) => {
            file.write_all(key.as_bytes())?;
            file.sync_all()?;
            set_private_permissions(&key_path)?;
            Ok(key)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            Ok(fs::read_to_string(key_path)?.trim().to_owned())
        }
        Err(error) => Err(error.into()),
    }
}

#[cfg(unix)]
fn set_private_permissions(path: &PathBuf) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &PathBuf) -> std::io::Result<()> {
    Ok(())
}
