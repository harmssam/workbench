use super::get_db_path;
use chrono::Utc;
use rusqlite::Connection;
use std::fs;
use std::path::Path;

pub fn export_db(conn: &Connection, dest_path: &str) -> Result<(), String> {
    let dest = Path::new(dest_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create export directory: {e}"))?;
        }
    }

    let src_path = get_db_path()?;
    fs::copy(&src_path, dest).map_err(|e| format!("Failed to export database: {e}"))?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('last_backup_at', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [&now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn restore_db(backup_path: &str) -> Result<(), String> {
    let backup = Path::new(backup_path);
    if !backup.exists() {
        return Err(format!("Backup file not found: {backup_path}"));
    }

    let db_path = get_db_path()?;
    let safety_copy = db_path.with_extension("db.pre-restore");

    if db_path.exists() {
        fs::copy(&db_path, &safety_copy)
            .map_err(|e| format!("Failed to create safety copy: {e}"))?;
    }

    fs::copy(backup, &db_path).map_err(|e| {
        if safety_copy.exists() {
            let _ = fs::copy(&safety_copy, &db_path);
        }
        format!("Failed to restore database: {e}")
    })?;

    Ok(())
}