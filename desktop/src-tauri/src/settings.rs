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
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
    #[serde(default)]
    pub accent: Accent,
    #[serde(default)]
    pub density: Density,
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default)]
    pub background_server: bool,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    #[default]
    Blue,
    Violet,
    Green,
    Orange,
    Pink,
    Graphite,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    #[default]
    Default,
    Comfortable,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            port: default_port(),
            launch_at_login: false,
            start_hidden: true,
            close_to_tray: true,
            theme: Theme::System,
            theme_id: default_theme_id(),
            accent: Accent::Blue,
            density: Density::Default,
            font_size: default_font_size(),
            onboarding_completed: false,
            background_server: false,
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
    pub theme_id: Option<String>,
    pub accent: Option<Accent>,
    pub density: Option<Density>,
    pub font_size: Option<u8>,
    pub onboarding_completed: Option<bool>,
    pub background_server: Option<bool>,
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
        if let Some(theme_id) = patch.theme_id {
            self.theme_id = theme_id;
        }
        if let Some(accent) = patch.accent {
            self.accent = accent;
        }
        if let Some(density) = patch.density {
            self.density = density;
        }
        if let Some(font_size) = patch.font_size {
            self.font_size = font_size;
        }
        if let Some(value) = patch.onboarding_completed {
            self.onboarding_completed = value;
        }
        if let Some(value) = patch.background_server {
            self.background_server = value;
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
        if !(12..=14).contains(&updated.font_size) {
            return Err("Interface font size must be 12, 13, or 14".to_owned());
        }
        if updated.theme_id.is_empty()
            || updated.theme_id.len() > 40
            || !updated
                .theme_id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        {
            return Err("Theme id must match ^[a-z0-9-]{1,40}$".to_owned());
        }
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

fn default_theme_id() -> String {
    "default".to_owned()
}

const fn default_font_size() -> u8 {
    13
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
        assert_eq!(AppSettings::default().accent, Accent::Blue);
        assert_eq!(AppSettings::default().theme_id, "default");
        assert_eq!(AppSettings::default().density, Density::Default);
        assert_eq!(AppSettings::default().font_size, 13);
        assert!(!AppSettings::default().onboarding_completed);
        assert!(!AppSettings::default().background_server);
    }

    #[test]
    fn partial_patch_preserves_unspecified_fields() {
        let mut settings = AppSettings::default();
        settings.apply(SettingsPatch {
            port: Some(4321),
            theme: Some(Theme::Dark),
            theme_id: Some("nord".to_owned()),
            accent: Some(Accent::Violet),
            density: Some(Density::Comfortable),
            font_size: Some(14),
            ..SettingsPatch::default()
        });
        assert_eq!(settings.port, 4321);
        assert_eq!(settings.theme, Theme::Dark);
        assert_eq!(settings.accent, Accent::Violet);
        assert_eq!(settings.theme_id, "nord");
        assert_eq!(settings.density, Density::Comfortable);
        assert_eq!(settings.font_size, 14);
        assert!(settings.close_to_tray);
        assert!(!settings.background_server);
    }

    #[test]
    fn accent_serializes_as_lowercase_and_defaults_when_missing() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"port":4080}"#).expect("deserialize old settings");
        assert_eq!(settings.accent, Accent::Blue);
        assert_eq!(settings.theme_id, "default");
        assert_eq!(settings.font_size, 13);
        assert_eq!(
            serde_json::to_string(&Accent::Graphite).expect("serialize accent"),
            "\"graphite\""
        );
    }

    #[test]
    fn new_theme_fields_default_when_loading_existing_settings() {
        let settings: AppSettings = serde_json::from_str(
            r#"{"port":4080,"launchAtLogin":false,"startHidden":true,"closeToTray":true,"theme":"system","accent":"blue","onboardingCompleted":false}"#,
        )
        .expect("deserialize settings written before theme fields existed");
        assert_eq!(settings.theme_id, "default");
        assert_eq!(settings.density, Density::Default);
        assert_eq!(settings.font_size, 13);
        assert!(!settings.background_server);
    }

    #[test]
    fn background_server_setting_patches_and_round_trips() {
        let mut settings = AppSettings::default();
        settings.apply(SettingsPatch {
            background_server: Some(true),
            ..SettingsPatch::default()
        });
        assert!(settings.background_server);
        let json = serde_json::to_string(&settings).expect("serialize settings");
        let restored: AppSettings = serde_json::from_str(&json).expect("deserialize settings");
        assert!(restored.background_server);
    }

    #[test]
    fn invalid_theme_preferences_are_rejected() {
        let store = SettingsStore::default();
        assert!(store
            .update(SettingsPatch {
                theme_id: Some("../bad".to_owned()),
                ..SettingsPatch::default()
            })
            .is_err());
        assert!(store
            .update(SettingsPatch {
                font_size: Some(15),
                ..SettingsPatch::default()
            })
            .is_err());
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
