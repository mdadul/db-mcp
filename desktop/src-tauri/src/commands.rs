use std::sync::Arc;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

use crate::{
    ai_clients,
    settings::{AppSettings, SettingsPatch, SettingsStore},
    supervisor::{ServerInfo, Supervisor},
};

pub(crate) type SupervisorState = Arc<Mutex<Option<Supervisor>>>;

#[tauri::command]
pub async fn get_server_info(state: State<'_, SupervisorState>) -> Result<ServerInfo, String> {
    let supervisor = state.lock().await;
    let supervisor = supervisor
        .as_ref()
        .ok_or_else(|| "Backend supervisor is not initialized".to_owned())?;
    Ok(supervisor.info().await)
}

#[tauri::command]
pub async fn restart_server(
    state: State<'_, SupervisorState>,
    settings: State<'_, SettingsStore>,
) -> Result<ServerInfo, String> {
    let port = settings.get().port;
    let mut supervisor = state.lock().await;
    supervisor
        .as_mut()
        .ok_or_else(|| "Backend supervisor is not initialized".to_owned())?
        .restart(port)
        .await
}

#[tauri::command]
pub async fn read_server_logs(
    lines: usize,
    state: State<'_, SupervisorState>,
) -> Result<Vec<String>, String> {
    let supervisor = state.lock().await;
    let supervisor = supervisor
        .as_ref()
        .ok_or_else(|| "Backend supervisor is not initialized".to_owned())?;
    Ok(supervisor.logs(lines).await)
}

#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| format!("Could not open logs folder: {error}"))
}

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    Ok(settings.get())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    patch: SettingsPatch,
    settings: State<'_, SettingsStore>,
    state: State<'_, SupervisorState>,
) -> Result<AppSettings, String> {
    if let Some(port) = patch.port {
        crate::supervisor::validate_port(port)?;
    }
    let old = settings.get();
    let restart = patch.port.is_some_and(|port| port != old.port);
    let autostart_change = patch.launch_at_login;
    let updated = settings.update(patch)?;
    if let Some(enabled) = autostart_change {
        let autostart = app.autolaunch();
        let result = if enabled {
            autostart.enable()
        } else {
            autostart.disable()
        };
        result.map_err(|error| format!("Could not update launch-at-login setting: {error}"))?;
    }
    if restart {
        let mut supervisor = state.lock().await;
        supervisor
            .as_mut()
            .ok_or_else(|| "Backend supervisor is not initialized".to_owned())?
            .restart(updated.port)
            .await?;
    }
    Ok(updated)
}

#[tauri::command]
pub fn get_app_info() -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        platform: if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else {
            "linux"
        }
        .to_owned(),
    })
}

#[tauri::command]
pub async fn reset_all_data(
    state: State<'_, SupervisorState>,
    settings: State<'_, SettingsStore>,
) -> Result<(), String> {
    let mut supervisor = state.lock().await;
    supervisor
        .as_mut()
        .ok_or_else(|| "Backend supervisor is not initialized".to_owned())?
        .reset(settings.get().port)
        .await?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    platform: String,
}

/// Runs an AI-client operation against the current user's config locations,
/// using the MCP URL for the configured port. File I/O runs off the async
/// runtime's worker threads.
async fn with_ai_client_env<T, F>(
    app: AppHandle,
    settings: &SettingsStore,
    op: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&ai_clients::Env<'_>, &str) -> Result<T, String> + Send + 'static,
{
    let mcp_url = format!("http://127.0.0.1:{}/mcp", settings.get().port);
    let (home, config_dir) = ai_clients::env_paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let env = ai_clients::Env {
            home: &home,
            config_dir: &config_dir,
        };
        op(&env, &mcp_url)
    })
    .await
    .map_err(|error| format!("AI client task failed: {error}"))?
}

#[tauri::command]
pub async fn list_ai_clients(
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<Vec<ai_clients::AiClient>, String> {
    with_ai_client_env(app, &settings, |env, url| {
        Ok(ai_clients::list_clients(env, url))
    })
    .await
}

#[tauri::command]
pub async fn preview_ai_client_install(
    id: String,
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<ai_clients::InstallPreview, String> {
    with_ai_client_env(app, &settings, move |env, url| {
        ai_clients::preview_install(env, &id, url)
    })
    .await
}

#[tauri::command]
pub async fn install_ai_client(
    id: String,
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<ai_clients::InstallResult, String> {
    with_ai_client_env(app, &settings, move |env, url| {
        ai_clients::install(env, &id, url)
    })
    .await
}

#[tauri::command]
pub async fn uninstall_ai_client(
    id: String,
    app: AppHandle,
    settings: State<'_, SettingsStore>,
) -> Result<ai_clients::InstallResult, String> {
    with_ai_client_env(app, &settings, move |env, _url| {
        ai_clients::uninstall(env, &id)
    })
    .await
}
