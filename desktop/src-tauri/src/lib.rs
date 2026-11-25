mod ai_clients;
mod background;
mod commands;
mod secrets;
mod settings;
mod supervisor;
mod tray;

use std::{
    panic,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use log::error;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_autostart::MacosLauncher;
use tokio::sync::Mutex;

pub fn run() {
    panic::set_hook(Box::new(|panic_info| {
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            })
            .unwrap_or("non-string panic payload");
        let location = panic_info
            .location()
            .map(|location| {
                format!(
                    "{}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                )
            })
            .unwrap_or_else(|| "unknown location".to_owned());
        error!("panic at {location}: {message}");
        eprintln!("DB MCP panic at {location}: {message}");
    }));

    let mut context = tauri::generate_context!();
    if std::env::args().any(|arg| arg == "--server") {
        context.config_mut().app.windows.clear();
        run_background_server(context);
        return;
    }

    let shutdown_requested = Arc::new(AtomicBool::new(false));
    let window_shutdown = Arc::clone(&shutdown_requested);
    let run_shutdown = Arc::clone(&shutdown_requested);
    let app = tauri::Builder::default()
        // The single-instance plugin must be first to avoid racing setup.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(log_plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(updater_plugin())
        .manage(Arc::new(Mutex::new(None::<supervisor::Supervisor>)))
        .manage(Arc::clone(&shutdown_requested))
        .invoke_handler(tauri::generate_handler![
            commands::get_server_info,
            commands::restart_server,
            commands::read_server_logs,
            commands::open_logs_dir,
            commands::list_custom_themes,
            commands::install_custom_theme,
            commands::delete_custom_theme,
            commands::get_settings,
            commands::update_settings,
            commands::get_app_info,
            commands::reset_all_data,
            commands::list_ai_clients,
            commands::reveal_ai_client_config,
            commands::preview_ai_client_install,
            commands::install_ai_client,
            commands::uninstall_ai_client,
            commands::get_background_server,
            commands::set_background_server,
            commands::restart_background_server,
            commands::stop_background_server,
            commands::prepare_app_update,
            commands::resume_app_after_update,
        ])
        .setup(move |app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let settings = settings::SettingsStore::load(settings_path);
            app.manage(settings);

            let settings = app.state::<settings::SettingsStore>().get();
            let server_port = settings.port;
            let hidden = settings.start_hidden && std::env::args().any(|arg| arg == "--hidden");
            if !hidden {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                }
            }

            let supervisor = supervisor::Supervisor::new(app.handle().clone())?;
            let supervisor_state = Arc::clone(
                app.state::<Arc<Mutex<Option<supervisor::Supervisor>>>>()
                    .inner(),
            );
            tray::install(app, Arc::clone(&shutdown_requested))?;
            supervisor_state
                .try_lock()
                .map_err(|_| {
                    std::io::Error::other("Backend supervisor state is busy during setup")
                })?
                .replace(supervisor);
            let app_data_dir = app.path().app_data_dir()?;
            if let Ok(Some(record)) =
                supervisor::read_server_record(&app_data_dir.join("server.json"))
            {
                    // The record is trusted only after the health endpoint reports the same process id.
                let state = Arc::clone(&supervisor_state);
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(supervisor) = state.lock().await.as_mut() {
                        if let Err(error) = supervisor.attach(record).await {
                            log::warn!("Could not attach to background server: {error}");
                            if let Err(start_error) = supervisor.start(server_port).await {
                                log::error!("Could not start embedded backend after stale background record: {start_error}");
                            }
                            let info = supervisor.info().await;
                            let _ = app_handle.emit("server://state", info);
                        }
                    }
                });
            } else if settings.background_server {
                if background::start().is_ok() {
                    let state = Arc::clone(&supervisor_state);
                    let app_handle = app.handle().clone();
                    let record_path = app_data_dir.join("server.json");
                    tauri::async_runtime::spawn(async move {
                        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
                        loop {
                            if let Ok(Some(record)) = supervisor::read_server_record(&record_path) {
                                let mut supervisor_guard = state.lock().await;
                                if let Some(supervisor) = supervisor_guard.as_mut() {
                                    if supervisor.attach(record).await.is_ok() {
                                        let info = supervisor.info().await;
                                        let _ = app_handle.emit("server://state", info);
                                        return;
                                    }
                                }
                            }
                            if tokio::time::Instant::now() >= deadline {
                                break;
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                        }
                        let mut supervisor_guard = state.lock().await;
                        if let Some(supervisor) = supervisor_guard.as_mut() {
                            if let Err(error) = supervisor.start(server_port).await {
                                log::error!("Could not start backend: {error}");
                            }
                            let info = supervisor.info().await;
                            let _ = app_handle.emit("server://state", info);
                        }
                    });
                } else {
                    start_embedded(&supervisor_state, server_port, app.handle().clone());
                }
            } else {
                start_embedded(&supervisor_state, server_port, app.handle().clone());
            }
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let Some(settings) = window.app_handle().try_state::<settings::SettingsStore>()
                else {
                    api.prevent_close();
                    begin_shutdown(window.app_handle(), Arc::clone(&window_shutdown));
                    return;
                };
                let settings = settings.get();
                let background_attached = settings.background_server
                    || window.app_handle().path().app_data_dir().ok().is_some_and(|path| path.join("server.json").exists());
                if background_attached && !settings.close_to_tray {
                    api.prevent_close();
                    let app = window.app_handle().clone();
                    begin_shutdown(&app, Arc::clone(&window_shutdown));
                } else if settings.close_to_tray || background_attached {
                    api.prevent_close();
                    let _ = window.hide();
                    #[cfg(target_os = "macos")]
                    let _ = window.app_handle().hide();
                } else {
                    api.prevent_close();
                    let app = window.app_handle().clone();
                    begin_shutdown(&app, Arc::clone(&window_shutdown));
                }
            }
        })
        .build(context)
        .expect("error while building DB MCP Desktop");

    app.run(move |app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if run_shutdown
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                api.prevent_exit();
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    stop_supervisor(&handle).await;
                    handle.exit(0);
                });
            }
        }
        RunEvent::Exit => {
            if let Some(state) = app.try_state::<Arc<Mutex<Option<supervisor::Supervisor>>>>() {
                if let Ok(mut supervisor_state) = state.try_lock() {
                    if let Some(supervisor) = supervisor_state.as_mut() {
                        supervisor.kill_now();
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    });
}

fn run_background_server(context: tauri::Context<tauri::Wry>) {
    let shutdown_requested = Arc::new(AtomicBool::new(false));
    let run_shutdown = Arc::clone(&shutdown_requested);
    let server = tauri::Builder::default()
        .plugin(log_plugin())
        .manage(Arc::new(Mutex::new(None::<supervisor::Supervisor>)))
        .manage(shutdown_requested)
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            app.manage(settings::SettingsStore::load(settings_path));
            let app_data_dir = app.path().app_data_dir()?;
            let server_lock =
                background::acquire_server_lock(&app_data_dir).map_err(std::io::Error::other)?;
            app.manage(BackgroundServerLock(server_lock));
            app.manage(app_data_dir.clone());
            let supervisor = supervisor::Supervisor::new(app.handle().clone())?;
            let supervisor_state = Arc::clone(
                app.state::<Arc<Mutex<Option<supervisor::Supervisor>>>>()
                    .inner(),
            );
            supervisor_state
                .try_lock()
                .map_err(|_| {
                    std::io::Error::other("Background supervisor state is busy during setup")
                })?
                .replace(supervisor);
            let port = app.state::<settings::SettingsStore>().get().port;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(supervisor) = supervisor_state.lock().await.as_mut() {
                    if let Err(error) = supervisor.start_background(port).await {
                        log::error!("Could not start background backend: {error}");
                        handle.exit(1);
                    }
                }
            });
            #[cfg(unix)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tokio::signal::unix::{signal, SignalKind};
                    let Ok(mut term) = signal(SignalKind::terminate()) else {
                        return;
                    };
                    let Ok(mut interrupt) = signal(SignalKind::interrupt()) else {
                        return;
                    };
                    tokio::select! { _ = term.recv() => {}, _ = interrupt.recv() => {} }
                    handle.exit(0);
                });
            }
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if tokio::signal::ctrl_c().await.is_ok() {
                        handle.exit(0);
                    }
                });
            }
            Ok(())
        })
        .build(context)
        .expect("could not initialize background server");
    server.run(move |app, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if run_shutdown
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                api.prevent_exit();
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    stop_supervisor(&handle).await;
                    if let Some(data_dir) = handle.try_state::<std::path::PathBuf>() {
                        let _ = std::fs::remove_file(data_dir.join("server.json"));
                    }
                    if let Some(lock) = handle.try_state::<BackgroundServerLock>() {
                        let _ = std::fs::remove_file(&lock.0);
                    }
                    handle.exit(0);
                });
            }
        }
    });
}

struct BackgroundServerLock(std::path::PathBuf);

fn start_embedded(
    state: &Arc<Mutex<Option<supervisor::Supervisor>>>,
    port: u16,
    app: tauri::AppHandle,
) {
    let state = Arc::clone(state);
    tauri::async_runtime::spawn(async move {
        let mut supervisor_guard = state.lock().await;
        let Some(supervisor) = supervisor_guard.as_mut() else {
            error!("Backend supervisor state was unexpectedly empty");
            return;
        };
        if let Err(start_error) = supervisor.start(port).await {
            error!("Could not start backend: {start_error}");
        }
        let info = supervisor.info().await;
        let _ = app.emit("server://state", info);
    });
}

fn updater_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    tauri_plugin_updater::Builder::new().build()
}

fn log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let builder = tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("hyper", log::LevelFilter::Warn)
        .level_for("keyring", log::LevelFilter::Warn);
    #[cfg(debug_assertions)]
    let builder = builder.level_for("db_mcp_desktop_lib", log::LevelFilter::Debug);
    builder.build()
}

async fn stop_supervisor(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<Arc<Mutex<Option<supervisor::Supervisor>>>>() else {
        return;
    };
    let mut supervisor = state.lock().await;
    if let Some(supervisor) = supervisor.as_mut() {
        if let Err(stop_error) = supervisor.stop_for_exit().await {
            error!("Could not stop backend: {stop_error}");
        }
    }
    supervisor.take();
}

pub(crate) fn begin_shutdown(app: &tauri::AppHandle, shutdown_requested: Arc<AtomicBool>) {
    if shutdown_requested
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        stop_supervisor(&app).await;
        app.exit(0);
    });
}
