use std::{fs, path::Path};

use keyring::Entry;
use log::warn;

const SERVICE: &str = "dev.dbmcp.desktop";
const USER: &str = "encryption-key";
const FALLBACK_FILE: &str = "encryption.key";
/// Key file written by the early desktop prototype.
const LEGACY_FILE: &str = "dev-encryption.key";

pub fn encryption_key(app_data_dir: &Path) -> Result<String, String> {
    #[cfg(debug_assertions)]
    if let Ok(key) = std::env::var("DB_MCP_DEV_ENCRYPTION_KEY") {
        return validate_key(key);
    }

    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    // The key must come from one stable place, or stored credentials become
    // unreadable. Once a key file exists it is authoritative, so a keychain
    // that fails intermittently can never swap in a different key.
    if app_data_dir.join(FALLBACK_FILE).exists() {
        return fallback_key(app_data_dir);
    }

    // Debug bundles are re-signed on every build, so macOS treats each one as
    // a new app and prompts for keychain access. Use the private key file.
    if cfg!(debug_assertions) {
        return fallback_key(app_data_dir);
    }

    let entry = match Entry::new(SERVICE, USER) {
        Ok(entry) => entry,
        Err(error) => {
            warn!("OS keychain unavailable ({error}); using a private local key file");
            return fallback_key(app_data_dir);
        }
    };
    match entry.get_password() {
        Ok(key) => validate_key(key),
        Err(keyring::Error::NoEntry) => migrate_or_create(&entry, app_data_dir),
        Err(error) => {
            warn!("OS keychain unavailable ({error}); using a private local key file");
            fallback_key(app_data_dir)
        }
    }
}

pub fn delete_encryption_key(app_data_dir: &Path) -> Result<(), String> {
    if let Ok(entry) = Entry::new(SERVICE, USER) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => warn!("Could not delete keychain credential: {error}"),
        }
    }
    for name in [FALLBACK_FILE, LEGACY_FILE] {
        let path = app_data_dir.join(name);
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not delete encryption-key fallback: {error}")),
        }
    }
    Ok(())
}

fn migrate_or_create(entry: &Entry, app_data_dir: &Path) -> Result<String, String> {
    let legacy_path = app_data_dir.join(LEGACY_FILE);
    if let Ok(key) = fs::read_to_string(&legacy_path) {
        let key = validate_key(key.trim().to_owned())?;
        if entry.set_password(&key).is_ok() {
            fs::remove_file(legacy_path)
                .map_err(|error| format!("Could not remove migrated key file: {error}"))?;
            return Ok(key);
        }
        warn!("Could not migrate key to OS keychain; retaining the protected fallback file");
        write_fallback(app_data_dir, &key)?;
        fs::remove_file(legacy_path)
            .map_err(|error| format!("Could not remove migrated key file: {error}"))?;
        return Ok(key);
    }

    let key = random_key()?;
    match entry.set_password(&key) {
        Ok(()) => Ok(key),
        Err(error) => {
            warn!("Could not store key in OS keychain ({error}); using a private local key file");
            write_fallback(app_data_dir, &key)?;
            Ok(key)
        }
    }
}

fn fallback_key(app_data_dir: &Path) -> Result<String, String> {
    let path = app_data_dir.join(FALLBACK_FILE);
    match fs::read_to_string(&path) {
        Ok(key) => validate_key(key.trim().to_owned()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let legacy_path = app_data_dir.join(LEGACY_FILE);
            let key = match fs::read_to_string(&legacy_path) {
                Ok(legacy) => validate_key(legacy.trim().to_owned())?,
                Err(_) => random_key()?,
            };
            write_fallback(app_data_dir, &key)?;
            let _ = fs::remove_file(legacy_path);
            Ok(key)
        }
        Err(error) => Err(format!("Could not read encryption-key fallback: {error}")),
    }
}

fn write_fallback(app_data_dir: &Path, key: &str) -> Result<(), String> {
    let path = app_data_dir.join(FALLBACK_FILE);
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
            file.write_all(key.as_bytes())
                .map_err(|error| format!("Could not write encryption-key fallback: {error}"))?;
            file.sync_all()
                .map_err(|error| format!("Could not sync encryption-key fallback: {error}"))?;
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing = fs::read_to_string(path).map_err(|read_error| {
                format!("Could not read existing encryption-key fallback: {read_error}")
            })?;
            if existing.trim() == key {
                Ok(())
            } else {
                Err(
                    "Encryption-key fallback was concurrently created with a different key"
                        .to_owned(),
                )
            }
        }
        Err(error) => Err(format!("Could not create encryption-key fallback: {error}")),
    }
}

fn random_key() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Could not generate encryption key: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_key(key: String) -> Result<String, String> {
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("The encryption key must be 64 hexadecimal characters".to_owned());
    }
    Ok(key)
}
