use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
const LABEL: &str = "dev.dbmcp.desktop.server";
#[cfg(target_os = "windows")]
const TASK_NAME: &str = "DB MCP server";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundServerStatus {
    pub enabled: bool,
    pub installed: bool,
    pub running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

pub fn permanent_executable() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Could not resolve DB MCP executable: {error}"))?
        .canonicalize()
        .map_err(|error| format!("Could not resolve DB MCP executable: {error}"))?;
    if !uses_permanent_location(&executable) {
        return Err(
            "Move DB MCP to Applications first, then enable the background server.".to_owned(),
        );
    }
    Ok(executable)
}

pub fn uses_permanent_location(path: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        path.ancestors().any(|ancestor| {
            ancestor
                .extension()
                .is_some_and(|extension| extension == "app")
        }) && path.ancestors().any(|ancestor| {
            ancestor.starts_with("/Applications")
                || dirs_home()
                    .ok()
                    .is_some_and(|home| ancestor.starts_with(home.join("Applications")))
        }) && !is_translocated_path(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        true
    }
}

#[cfg(any(target_os = "macos", test))]
pub fn is_translocated_path(path: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        path.components()
            .any(|component| component.as_os_str() == "Volumes")
            || path.to_string_lossy().contains("/AppTranslocation/")
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        false
    }
}

pub fn acquire_server_lock(app_data_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    let path = app_data_dir.join("server.lock");
    for _ in 0..2 {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&path) {
            Ok(mut file) => {
                use std::io::Write;
                writeln!(file, "{}", std::process::id())
                    .map_err(|error| format!("Could not write background server lock: {error}"))?;
                file.sync_all()
                    .map_err(|error| format!("Could not sync background server lock: {error}"))?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let stale = fs::read_to_string(&path)
                    .ok()
                    .and_then(|contents| contents.trim().parse::<u32>().ok())
                    .is_some_and(|pid| pid != std::process::id() && !process_is_running(pid));
                if stale {
                    let _ = fs::remove_file(&path);
                    continue;
                }
                return Err("The DB MCP background server is already running.".to_owned());
            }
            Err(error) => return Err(format!("Could not create background server lock: {error}")),
        }
    }
    Err("Could not acquire the background server lock".to_owned())
}

fn process_is_running(pid: u32) -> bool {
    #[cfg(unix)]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .is_ok_and(|status| status.success())
    }
    #[cfg(windows)]
    {
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}")])
            .output()
            .is_ok_and(|output| String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()))
    }
}

pub fn service_path(home: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        home.join("Library/LaunchAgents/dev.dbmcp.desktop.server.plist")
    }
    #[cfg(target_os = "linux")]
    {
        home.join(".config/systemd/user/db-mcp-server.service")
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = home;
        PathBuf::new()
    }
    #[cfg(target_os = "windows")]
    {
        home.join("AppData/Local/DB MCP/db-mcp-server.xml")
    }
}

pub fn render_service(executable: &Path, log_dir: &Path) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(render_macos_plist(executable, log_dir))
    }
    #[cfg(target_os = "linux")]
    {
        let _ = log_dir;
        let exe = executable.to_string_lossy();
        Ok(format!("[Unit]\nDescription=DB MCP background server\n\n[Service]\nType=simple\nExecStart={} --server\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n", systemd_quote(&exe)))
    }
    #[cfg(target_os = "windows")]
    {
        let _ = log_dir;
        let exe = executable.to_string_lossy();
        Ok(format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
<Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>Limited</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><RestartOnFailure><Interval>PT2M</Interval><Count>3</Count></RestartOnFailure><Enabled>true</Enabled></Settings>
<Actions Context="Author"><Exec><Command>{}</Command><Arguments>--server</Arguments><WorkingDirectory>{}</WorkingDirectory></Exec></Actions>
</Task>"#,
            xml_escape(&exe),
            xml_escape(
                &executable
                    .parent()
                    .unwrap_or(Path::new("."))
                    .to_string_lossy()
            )
        ))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = (executable, log_dir);
        Err("Background server services are not supported on this platform".to_owned())
    }
}

pub fn install(log_dir: &Path) -> Result<(), String> {
    let executable = permanent_executable()?;
    let home = dirs_home()?;
    let path = service_path(&home);
    let definition = render_service(&executable, log_dir)?;
    fs::create_dir_all(log_dir)
        .map_err(|error| format!("Could not create app log directory: {error}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| "Service path has no parent directory".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create service folder: {error}"))?;
    fs::write(&path, definition)
        .map_err(|error| format!("Could not write background service: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Could not protect background service definition: {error}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        launch_macos_service(&path, &uid)?;
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "daemon-reload"],
            "systemd --user is unavailable; enable a user systemd session first",
        )?;
        run_command(
            "systemctl",
            &["--user", "enable", "--now", "db-mcp-server.service"],
            "Could not start background server service",
        )?;
    }
    #[cfg(target_os = "windows")]
    {
        run_command(
            "schtasks",
            &[
                "/Create",
                "/TN",
                TASK_NAME,
                "/XML",
                path.to_string_lossy().as_ref(),
                "/F",
            ],
            "Could not create scheduled task",
        )?;
        run_command(
            "schtasks",
            &["/Run", "/TN", TASK_NAME],
            "Could not start background server",
        )?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_macos_service(path: &Path, uid: &str) -> Result<(), String> {
    let domain = format!("gui/{uid}");
    let target = format!("{domain}/{LABEL}");
    let _ = Command::new("launchctl").args(["enable", &target]).status();
    let result = Command::new("launchctl")
        .args(["bootstrap", &domain, path.to_string_lossy().as_ref()])
        .status();
    if result.is_ok_and(|status| status.success()) {
        return Ok(());
    }
    let loaded = Command::new("launchctl")
        .args(["print", &format!("{domain}/{LABEL}")])
        .status()
        .is_ok_and(|status| status.success());
    if loaded {
        let _ = Command::new("launchctl")
            .args(["bootout", &format!("{domain}/{LABEL}")])
            .status();
        let status = Command::new("launchctl")
            .args(["bootstrap", &domain, path.to_string_lossy().as_ref()])
            .status()
            .map_err(|error| format!("Could not load background server service: {error}"))?;
        if status.success() {
            return Ok(());
        }
    }
    run_command(
        "launchctl",
        &["load", "-w", path.to_string_lossy().as_ref()],
        "Could not load background server service",
    )
}

pub fn restart() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        run_command(
            "launchctl",
            &["kickstart", "-k", &format!("gui/{uid}/{LABEL}")],
            "Could not restart background server",
        )
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "restart", "db-mcp-server.service"],
            "Could not restart background server",
        )
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("schtasks")
            .args(["/End", "/TN", TASK_NAME])
            .status();
        run_command(
            "schtasks",
            &["/Run", "/TN", TASK_NAME],
            "Could not restart background server",
        )
    }
}

pub fn start() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        let path = service_path(&dirs_home()?);
        let result = Command::new("launchctl")
            .args([
                "bootstrap",
                &format!("gui/{uid}"),
                path.to_string_lossy().as_ref(),
            ])
            .status();
        if result.is_ok_and(|status| status.success()) {
            Ok(())
        } else {
            run_command(
                "launchctl",
                &["load", "-w", path.to_string_lossy().as_ref()],
                "Could not start background server",
            )
        }
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "start", "db-mcp-server.service"],
            "Could not start background server",
        )
    }
    #[cfg(target_os = "windows")]
    {
        run_command(
            "schtasks",
            &["/Run", "/TN", TASK_NAME],
            "Could not start background server",
        )
    }
}

pub fn stop() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        run_command(
            "launchctl",
            &["bootout", &format!("gui/{uid}/{LABEL}")],
            "Could not stop background server",
        )
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "stop", "db-mcp-server.service"],
            "Could not stop background server",
        )
    }
    #[cfg(target_os = "windows")]
    {
        run_command(
            "schtasks",
            &["/End", "/TN", TASK_NAME],
            "Could not stop background server",
        )
    }
}

pub fn disable_service() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        let target = format!("gui/{uid}/{LABEL}");
        run_command(
            "launchctl",
            &["bootout", &target],
            "Could not stop background server",
        )?;
        let _ = Command::new("launchctl")
            .args(["disable", &target])
            .status();
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "disable", "--now", "db-mcp-server.service"],
            "Could not disable background server",
        )?;
        let _ = Command::new("systemctl")
            .args(["--user", "daemon-reload"])
            .status();
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("schtasks")
            .args(["/End", "/TN", TASK_NAME])
            .status();
        run_command(
            "schtasks",
            &["/Delete", "/TN", TASK_NAME, "/F"],
            "Could not disable background server",
        )?;
        Ok(())
    }
}

pub fn unregister() -> Result<(), String> {
    let _ = disable_service();
    remove_service_file()
}

pub fn remove_service_file() -> Result<(), String> {
    let path = service_path(&dirs_home()?);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove background service definition: {error}"
        )),
    }
}

#[cfg(target_os = "macos")]
pub fn render_macos_plist(executable: &Path, log_dir: &Path) -> String {
    let exe = xml_escape(&executable.to_string_lossy());
    let logs = xml_escape(&log_dir.to_string_lossy());
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{LABEL}</string>
<key>ProgramArguments</key><array><string>{exe}</string><string>--server</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>{logs}/background-server.out.log</string><key>StandardErrorPath</key><string>{logs}/background-server.out.log</string>
</dict></plist>"#
    )
}

pub fn enable_installed_service() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let uid = current_uid()?;
        let path = service_path(&dirs_home()?);
        launch_macos_service(&path, &uid)
    }
    #[cfg(target_os = "linux")]
    {
        run_command(
            "systemctl",
            &["--user", "enable", "--now", "db-mcp-server.service"],
            "Could not enable background server",
        )
    }
    #[cfg(target_os = "windows")]
    {
        let path = service_path(&dirs_home()?);
        run_command(
            "schtasks",
            &[
                "/Create",
                "/TN",
                TASK_NAME,
                "/XML",
                path.to_string_lossy().as_ref(),
                "/F",
            ],
            "Could not enable background server",
        )?;
        run_command(
            "schtasks",
            &["/Run", "/TN", TASK_NAME],
            "Could not start background server",
        )
    }
}

pub fn installed() -> bool {
    dirs_home()
        .ok()
        .is_some_and(|home| service_path(&home).is_file())
}

pub fn service_enabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        current_uid().ok().is_some_and(|uid| {
            Command::new("launchctl")
                .args(["print-disabled", &format!("gui/{uid}")])
                .output()
                .is_ok_and(|output| {
                    output.status.success()
                        && String::from_utf8_lossy(&output.stdout)
                            .contains(&format!("{LABEL} => enabled"))
                })
        })
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("systemctl")
            .args(["--user", "is-enabled", "--quiet", "db-mcp-server.service"])
            .status()
            .is_ok_and(|status| status.success())
    }
    #[cfg(target_os = "windows")]
    {
        installed()
    }
}

pub fn running() -> bool {
    #[cfg(target_os = "macos")]
    {
        current_uid().ok().is_some_and(|uid| {
            Command::new("launchctl")
                .args(["print", &format!("gui/{uid}/{LABEL}")])
                .status()
                .is_ok_and(|status| status.success())
        })
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("systemctl")
            .args(["--user", "is-active", "--quiet", "db-mcp-server.service"])
            .status()
            .is_ok_and(|status| status.success())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("schtasks")
            .args(["/Query", "/TN", TASK_NAME, "/FO", "LIST"])
            .output()
            .is_ok_and(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).contains("Running")
            })
    }
}

fn dirs_home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "Could not locate the current user's home directory".to_owned())
}

fn run_command(program: &str, args: &[&str], message: &str) -> Result<(), String> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|error| format!("{message}: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{message} (exit status {status})"))
    }
}

#[cfg(target_os = "macos")]
fn current_uid() -> Result<String, String> {
    Command::new("id")
        .arg("-u")
        .output()
        .map_err(|error| format!("Could not read user id: {error}"))
        .and_then(|output| String::from_utf8(output.stdout).map_err(|error| error.to_string()))
        .map(|uid| uid.trim().to_owned())
}

#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(any(target_os = "linux", test))]
fn systemd_quote(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('%', "%%")
            .replace('$', "\\$")
            .replace('`', "\\`")
            .replace(' ', "\\s")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_definitions_escape_executable_paths_with_spaces() {
        let executable = Path::new("/Applications/DB MCP.app/Contents/MacOS/db-mcp-desktop");
        let definition = render_service(executable, Path::new("/Users/test/Library/Logs/DB MCP"))
            .expect("render service");
        assert!(definition.contains("DB MCP.app"));
        #[cfg(target_os = "linux")]
        assert!(definition.contains(
            "ExecStart=\"/Applications/DB\\sMCP.app/Contents/MacOS/db-mcp-desktop\" --server"
        ));
        #[cfg(target_os = "windows")]
        assert!(definition.contains("<Arguments>--server</Arguments>"));
        #[cfg(target_os = "macos")]
        {
            let plist =
                render_macos_plist(executable, Path::new("/Users/test/Library/Logs/DB MCP"));
            assert!(plist.contains("<key>RunAtLoad</key><true/>"));
            assert!(plist.contains("<key>SuccessfulExit</key><false/>"));
            assert!(plist.contains("DB MCP.app"));
        }
        #[cfg(target_os = "windows")]
        assert!(definition.contains("<RestartOnFailure>"));
        #[cfg(target_os = "linux")]
        assert!(definition.contains("Restart=on-failure\nRestartSec=2"));
        #[cfg(target_os = "macos")]
        assert!(definition.contains("ProgramArguments</key><array><string>/Applications/DB MCP.app/Contents/MacOS/db-mcp-desktop</string>"));
    }

    #[test]
    fn xml_values_are_escaped() {
        assert_eq!(xml_escape("a&b<c>\"d\""), "a&amp;b&lt;c&gt;&quot;d&quot;");
    }

    #[test]
    fn systemd_escapes_spaces_and_percent_specifiers() {
        assert_eq!(
            systemd_quote("/home/user/DB MCP%"),
            "\"/home/user/DB\\sMCP%%\""
        );
    }

    #[test]
    fn translocated_and_mounted_volume_paths_are_detected() {
        assert!(!is_translocated_path(Path::new(
            "/Applications/DB MCP.app/bin/db-mcp"
        )));
        #[cfg(target_os = "macos")]
        {
            assert!(is_translocated_path(Path::new(
                "/Volumes/Installer/DB MCP.app/bin/db-mcp"
            )));
            assert!(is_translocated_path(Path::new(
                "/private/var/folders/AppTranslocation/ABC/DB MCP.app/bin/db-mcp"
            )));
            assert!(!uses_permanent_location(Path::new(
                "/Users/test/Downloads/DB MCP Dev Test.app/Contents/MacOS/db-mcp"
            )));
            assert!(uses_permanent_location(Path::new(
                "/Applications/DB MCP.app/Contents/MacOS/db-mcp"
            )));
        }
    }

    #[test]
    fn server_lock_rejects_a_second_owner() {
        let directory = std::env::temp_dir().join(format!("db-mcp-lock-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        let lock = acquire_server_lock(&directory).expect("first process acquires lock");
        assert!(acquire_server_lock(&directory).is_err());
        fs::remove_file(lock).expect("remove lock");
        fs::remove_dir_all(directory).expect("remove lock directory");
    }
}
