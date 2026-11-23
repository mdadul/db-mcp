use std::sync::{atomic::AtomicBool, Arc, Mutex};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::{
    commands,
    supervisor::{ServerInfo, ServerState},
};

const OPEN: &str = "open";
const RESTART: &str = "restart";
const LOGS: &str = "logs";
const QUIT: &str = "quit";
static STATUS_MENU_ITEM: Mutex<Option<MenuItem<tauri::Wry>>> = Mutex::new(None);

pub fn install(
    app: &tauri::App,
    shutdown_requested: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let status = MenuItem::with_id(app, "status", "● Server starting", false, None::<&str>)?;
    *STATUS_MENU_ITEM
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(status.clone());
    let open = MenuItem::with_id(app, OPEN, "Open DB MCP", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, RESTART, "Restart server", true, None::<&str>)?;
    let logs = MenuItem::with_id(app, LOGS, "Open logs", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit DB MCP", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &open,
            &restart,
            &logs,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("DB MCP")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            OPEN => show_main(app),
            RESTART => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let Some(state) = app.try_state::<commands::SupervisorState>() else {
                        log::error!("Backend supervisor is unavailable");
                        return;
                    };
                    let Some(settings) = app.try_state::<crate::settings::SettingsStore>() else {
                        log::error!("Settings are unavailable");
                        return;
                    };
                    let mut supervisor = state.lock().await;
                    if let Some(supervisor) = supervisor.as_mut() {
                        if let Err(error) = supervisor.restart(settings.get().port).await {
                            log::error!("Could not restart server from tray: {error}");
                        }
                    }
                });
            }
            LOGS => {
                if let Err(error) = commands::open_logs_dir(app.clone()) {
                    log::error!("Could not open logs folder: {error}");
                }
            }
            QUIT => {
                crate::begin_shutdown(app, Arc::clone(&shutdown_requested));
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                show_main(tray.app_handle());
                #[cfg(not(any(target_os = "windows", target_os = "linux")))]
                let _ = tray;
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn update_status(app: &AppHandle, info: &ServerInfo) {
    let status = match info.state {
        ServerState::Healthy if info.mode == crate::supervisor::ServerMode::Background => {
            format!("● Background server — 127.0.0.1:{}", info.port)
        }
        ServerState::Healthy => format!("● Server running — 127.0.0.1:{}", info.port),
        ServerState::Starting => format!("● Server starting — 127.0.0.1:{}", info.port),
        ServerState::Unhealthy => format!("● Server unhealthy — 127.0.0.1:{}", info.port),
        ServerState::Restarting => format!("● Server restarting — 127.0.0.1:{}", info.port),
        ServerState::Stopped => "● Server stopped".to_owned(),
        ServerState::Failed => "● Server failed".to_owned(),
        ServerState::PortInUse => format!("● Port {} already in use", info.port),
    };
    let app = app.clone();
    let update_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = update_app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(&status));
            let menu_item = STATUS_MENU_ITEM.lock().ok().and_then(|item| item.clone());
            if let Some(item) = menu_item {
                let _ = item.set_text(status);
            }
        }
    });
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
