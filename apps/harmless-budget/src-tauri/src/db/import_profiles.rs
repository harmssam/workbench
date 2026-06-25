use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportProfile {
    pub id: i64,
    pub account_id: i64,
    pub name: String,
    pub preset_id: Option<String>,
    pub mapping_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveImportProfileInput {
    pub account_id: i64,
    pub name: String,
    pub preset_id: Option<String>,
    pub mapping_json: String,
}

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImportProfile> {
    Ok(ImportProfile {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        preset_id: row.get(3)?,
        mapping_json: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn list_for_account(conn: &Connection, account_id: i64) -> Result<Vec<ImportProfile>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, name, preset_id, mapping_json, created_at, updated_at
             FROM import_profiles
             WHERE account_id = ?1
             ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([account_id], row_to_profile)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn get_default(conn: &Connection, account_id: i64) -> Result<Option<ImportProfile>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, name, preset_id, mapping_json, created_at, updated_at
             FROM import_profiles
             WHERE account_id = ?1
             ORDER BY updated_at DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([account_id], row_to_profile)
        .optional()
        .map_err(|e| e.to_string())
}

pub fn save(conn: &Connection, input: &SaveImportProfileInput) -> Result<ImportProfile, String> {
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO import_profiles (account_id, name, preset_id, mapping_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(account_id, name) DO UPDATE SET
             preset_id = excluded.preset_id,
             mapping_json = excluded.mapping_json,
             updated_at = excluded.updated_at",
        params![
            input.account_id,
            input.name,
            input.preset_id,
            input.mapping_json,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_by_account_and_name(conn, input.account_id, &input.name)?
        .ok_or_else(|| "Failed to load saved import profile".to_string())
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM import_profiles WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Import profile {id} not found"));
    }

    Ok(())
}

fn get_by_account_and_name(
    conn: &Connection,
    account_id: i64,
    name: &str,
) -> Result<Option<ImportProfile>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, name, preset_id, mapping_json, created_at, updated_at
             FROM import_profiles
             WHERE account_id = ?1 AND name = ?2",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row(params![account_id, name], row_to_profile)
        .optional()
        .map_err(|e| e.to_string())
}