use std::{fs, path::PathBuf, sync::RwLock};

use log::warn;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub launch_at_login: bool,
    #[serde(default = "default_true")]
    pub start_hidden: bool,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub onboarding_completed: bool,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            port: default_port(),
            launch_at_login: false,
            start_hidden: true,
            close_to_tray: true,
            theme: Theme::System,
            onboarding_completed: false,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub port: Option<u16>,
    pub launch_at_login: Option<bool>,
    pub start_hidden: Option<bool>,
    pub close_to_tray: Option<bool>,
    pub theme: Option<Theme>,
    pub onboarding_completed: Option<bool>,
}

impl AppSettings {
    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(port) = patch.port {
            self.port = port;
        }
        if let Some(value) = patch.launch_at_login {
            self.launch_at_login = value;
        }
        if let Some(value) = patch.start_hidden {
            self.start_hidden = value;
        }
        if let Some(value) = patch.close_to_tray {
            self.close_to_tray = value;
        }
        if let Some(theme) = patch.theme {
            self.theme = theme;
        }
        if let Some(value) = patch.onboarding_completed {
            self.onboarding_completed = value;
        }
    }
}

pub struct SettingsStore {
    path: Option<PathBuf>,
    current: RwLock<AppSettings>,
}

impl Default for SettingsStore {
    fn default() -> Self {
        Self {
            path: None,
            current: RwLock::new(AppSettings::default()),
        }
    }
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let current = match fs::read(&path) {
            Ok(contents) => serde_json::from_slice(&contents).unwrap_or_else(|error| {
                warn!("Could not parse settings at {}: {error}", path.display());
                AppSettings::default()
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppSettings::default(),
            Err(error) => {
                warn!("Could not read settings at {}: {error}", path.display());
                AppSettings::default()
            }
        };
        Self {
            path: Some(path),
            current: RwLock::new(current),
        }
    }

    pub fn get(&self) -> AppSettings {
        self.current.read().expect("settings lock poisoned").clone()
    }

    pub fn update(&self, patch: SettingsPatch) -> Result<AppSettings, String> {
        let mut current = self
            .current
            .write()
            .map_err(|_| "Settings lock is unavailable".to_owned())?;
        let mut updated = current.clone();
        updated.apply(patch);
        if let Some(path) = self.path.as_ref() {
            write_atomic(path, &updated)?;
        }
        *current = updated.clone();
        Ok(updated)
    }
}

fn write_atomic(path: &PathBuf, settings: &AppSettings) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Settings path has no parent directory".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create settings directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Could not encode settings: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not write settings: {error}"))?;
    fs::rename(&temporary, path).map_err(|error| format!("Could not replace settings: {error}"))
}

const fn default_port() -> u16 {
    4080
}

const fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_contract() {
        assert_eq!(AppSettings::default().port, 4080);
        assert!(!AppSettings::default().launch_at_login);
        assert!(AppSettings::default().start_hidden);
        assert!(AppSettings::default().close_to_tray);
        assert_eq!(AppSettings::default().theme, Theme::System);
        assert!(!AppSettings::default().onboarding_completed);
    }

    #[test]
    fn partial_patch_preserves_unspecified_fields() {
        let mut settings = AppSettings::default();
        settings.apply(SettingsPatch {
            port: Some(4321),
            theme: Some(Theme::Dark),
            ..SettingsPatch::default()
        });
        assert_eq!(settings.port, 4321);
        assert_eq!(settings.theme, Theme::Dark);
        assert!(settings.close_to_tray);
    }

    #[test]
    fn corrupt_settings_load_defaults() {
        let path =
            std::env::temp_dir().join(format!("db-mcp-settings-{}.json", std::process::id()));
        fs::write(&path, "{").expect("write corrupt settings");
        assert_eq!(
            SettingsStore::load(path.clone()).get(),
            AppSettings::default()
        );
        fs::remove_file(path).expect("remove test settings");
    }
}
