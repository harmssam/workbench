use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub include_in_budget: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountInput {
    pub name: String,
    pub include_in_budget: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountInput {
    pub id: i64,
    pub name: String,
    pub include_in_budget: bool,
}

pub fn list(conn: &Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, include_in_budget FROM accounts ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                include_in_budget: row.get::<_, i64>(2)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn create(conn: &Connection, input: &CreateAccountInput) -> Result<Account, String> {
    let include = input.include_in_budget.unwrap_or(true);
    conn.execute(
        "INSERT INTO accounts (name, include_in_budget) VALUES (?1, ?2)",
        params![input.name, include as i64],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    Ok(Account {
        id,
        name: input.name.clone(),
        include_in_budget: include,
    })
}

pub fn update(conn: &Connection, input: &UpdateAccountInput) -> Result<Account, String> {
    let changed = conn
        .execute(
            "UPDATE accounts SET name = ?1, include_in_budget = ?2 WHERE id = ?3",
            params![input.name, input.include_in_budget as i64, input.id],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Account {} not found", input.id));
    }

    Ok(Account {
        id: input.id,
        name: input.name.clone(),
        include_in_budget: input.include_in_budget,
    })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    let tx_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if tx_count > 0 {
        return Err("Cannot delete account with existing transactions".to_string());
    }

    let changed = conn
        .execute("DELETE FROM accounts WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Account {id} not found"));
    }

    Ok(())
}