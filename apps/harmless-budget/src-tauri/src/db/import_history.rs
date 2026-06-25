use chrono::Utc;
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ImportHistoryEntry {
    pub id: i64,
    pub account_id: Option<i64>,
    pub account_name: Option<String>,
    pub filename: Option<String>,
    pub source: Option<String>,
    pub imported_at: String,
    pub row_count: i64,
    pub status: String,
}

pub fn list(conn: &Connection, limit: i64) -> Result<Vec<ImportHistoryEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.account_id, a.name, b.filename, b.source,
                    b.imported_at, b.row_count, b.status
             FROM import_batches b
             LEFT JOIN accounts a ON a.id = b.account_id
             WHERE b.status = 'committed'
             ORDER BY b.imported_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([limit], |row| {
            Ok(ImportHistoryEntry {
                id: row.get(0)?,
                account_id: row.get(1)?,
                account_name: row.get(2)?,
                filename: row.get(3)?,
                source: row.get(4)?,
                imported_at: row.get(5)?,
                row_count: row.get(6)?,
                status: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn record_commit(
    conn: &Connection,
    account_id: i64,
    filename: Option<&str>,
    inserted_count: i64,
) -> Result<i64, String> {
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO import_batches (account_id, filename, source, imported_at, row_count, status)
         VALUES (?1, ?2, 'csv', ?3, ?4, 'committed')",
        params![account_id, filename, now, inserted_count],
    )
    .map_err(|e| e.to_string())?;

    let batch_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('last_import_at', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [now],
    )
    .map_err(|e| e.to_string())?;

    Ok(batch_id)
}