pub mod accounts;
pub mod analytics;
pub mod backup;
pub mod budget;
pub mod categories;
pub mod dashboard;
pub mod import_history;
pub mod import_profiles;
pub mod rules;
pub mod spending;
pub mod transactions;

use chrono::Utc;
use rusqlite::{Connection, Result as SqliteResult};
use std::fs;
use std::path::PathBuf;

const SCHEMA_VERSION: i32 = 5;

pub fn get_db_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "Could not resolve data directory".to_string())?;
    Ok(base.join("com.harmless.budget").join("data.db"))
}

pub fn open_db() -> Result<Connection, String> {
    let path = get_db_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data directory: {e}"))?;
    }

    let conn = Connection::open(&path).map_err(|e| format!("Failed to open database: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| format!("Failed to configure database: {e}"))?;

    Ok(conn)
}

pub fn quick_check(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA quick_check")
        .map_err(|e| format!("Failed to run quick_check: {e}"))?;
    let results: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Failed to read quick_check: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect quick_check: {e}"))?;

    if results.len() == 1 && results[0] == "ok" {
        Ok(())
    } else {
        Err(format!(
            "Database integrity check failed: {}",
            results.join(", ")
        ))
    }
}

pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {e}"))?;

    if version < 1 {
        migrate_v1(conn)?;
    }
    if version < 2 {
        migrate_v2(conn)?;
    }
    if version < 3 {
        migrate_v3(conn)?;
    }
    if version < 4 {
        migrate_v4(conn)?;
    }
    if version < 5 {
        migrate_v5(conn)?;
    }

    if version < SCHEMA_VERSION {
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(|e| format!("Failed to set user_version: {e}"))?;
    }

    Ok(())
}

fn migrate_v1(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS categories (
            id            INTEGER PRIMARY KEY,
            parent_id     INTEGER REFERENCES categories(id),
            name          TEXT NOT NULL,
            type          TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
            is_system     INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            archived_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id                INTEGER PRIMARY KEY,
            name              TEXT NOT NULL UNIQUE,
            include_in_budget INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS import_batches (
            id           INTEGER PRIMARY KEY,
            filename     TEXT,
            source       TEXT,
            imported_at  TEXT NOT NULL,
            row_count    INTEGER NOT NULL,
            status       TEXT NOT NULL CHECK (status IN ('staging','committed','cancelled'))
        );

        CREATE TABLE IF NOT EXISTS rules (
            id           INTEGER PRIMARY KEY,
            name         TEXT NOT NULL,
            match_type   TEXT NOT NULL CHECK (match_type IN ('CONTAINS','EXACT')),
            match_value  TEXT NOT NULL,
            category_id  INTEGER NOT NULL REFERENCES categories(id),
            priority     INTEGER NOT NULL DEFAULT 0,
            enabled      INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id               INTEGER PRIMARY KEY,
            account_id       INTEGER NOT NULL REFERENCES accounts(id),
            date             TEXT NOT NULL,
            amount_cents     INTEGER NOT NULL,
            memo             TEXT,
            payee            TEXT,
            type             TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
            category_id      INTEGER REFERENCES categories(id),
            import_hash      TEXT,
            import_batch_id  INTEGER REFERENCES import_batches(id),
            applied_rule_id  INTEGER REFERENCES rules(id),
            created_at       TEXT NOT NULL,
            updated_at       TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_hash
            ON transactions(import_hash) WHERE import_hash IS NOT NULL;

        CREATE TABLE IF NOT EXISTS import_staging (
            id              INTEGER PRIMARY KEY,
            import_batch_id INTEGER NOT NULL REFERENCES import_batches(id),
            row_index       INTEGER NOT NULL,
            raw_json        TEXT NOT NULL,
            normalized_json TEXT NOT NULL,
            import_hash     TEXT NOT NULL,
            conflict_status TEXT NOT NULL CHECK (conflict_status IN ('new','duplicate','conflict')),
            resolution      TEXT CHECK (resolution IN ('skip','import','pending'))
        );

        CREATE TABLE IF NOT EXISTS budget_targets (
            id           INTEGER PRIMARY KEY,
            category_id  INTEGER NOT NULL REFERENCES categories(id),
            month        TEXT NOT NULL,
            target_cents INTEGER NOT NULL,
            UNIQUE (category_id, month)
        );

        CREATE TABLE IF NOT EXISTS app_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Failed to run migration v1: {e}"))?;

    seed_system_categories(conn)?;
    seed_app_meta(conn)?;

    Ok(())
}

fn migrate_v2(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS import_profiles (
            id           INTEGER PRIMARY KEY,
            account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            preset_id    TEXT,
            mapping_json TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            UNIQUE(account_id, name)
        );
        ",
    )
    .map_err(|e| format!("Failed to run migration v2: {e}"))?;

    if !table_has_column(conn, "import_batches", "account_id")? {
        conn.execute(
            "ALTER TABLE import_batches ADD COLUMN account_id INTEGER REFERENCES accounts(id)",
            [],
        )
        .map_err(|e| format!("Failed to add account_id to import_batches: {e}"))?;
    }

    conn.execute(
        "UPDATE app_meta SET value = '2' WHERE key = 'schema_version'",
        [],
    )
    .map_err(|e| format!("Failed to update schema_version in app_meta: {e}"))?;

    Ok(())
}

fn migrate_v3(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE transactions
         SET type = (
           SELECT c.type FROM categories c WHERE c.id = transactions.category_id
         )
         WHERE category_id IS NOT NULL
           AND type != (
             SELECT c.type FROM categories c WHERE c.id = transactions.category_id
           )",
        [],
    )
    .map_err(|e| format!("Failed to sync transaction types from categories: {e}"))?;

    conn.execute(
        "UPDATE app_meta SET value = '3' WHERE key = 'schema_version'",
        [],
    )
    .map_err(|e| format!("Failed to update schema_version in app_meta: {e}"))?;

    Ok(())
}

fn migrate_v4(conn: &Connection) -> Result<(), String> {
    use spending::INTERNAL_TRANSFER_PAYEE_SQL;

    let now = Utc::now().to_rfc3339();
    let sql = format!(
        "UPDATE transactions
         SET type = 'transfer',
             category_id = (
               SELECT id FROM categories
               WHERE type = 'transfer' AND parent_id IS NULL
               ORDER BY sort_order, id
               LIMIT 1
             ),
             updated_at = ?1
         WHERE type IN ('expense', 'income')
           AND ({INTERNAL_TRANSFER_PAYEE_SQL})"
    );

    conn.execute(&sql, [&now])
        .map_err(|e| format!("Failed to reclassify internal transfers: {e}"))?;

    conn.execute(
        "UPDATE app_meta SET value = '4' WHERE key = 'schema_version'",
        [],
    )
    .map_err(|e| format!("Failed to update schema_version in app_meta: {e}"))?;

    Ok(())
}

fn migrate_v5(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS budget_months (
            month         TEXT PRIMARY KEY,
            income_cents  INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .map_err(|e| format!("Failed to run migration v5: {e}"))?;

    conn.execute(
        "UPDATE app_meta SET value = '5' WHERE key = 'schema_version'",
        [],
    )
    .map_err(|e| format!("Failed to update schema_version in app_meta: {e}"))?;

    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to inspect table {table}: {e}"))?;

    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to read columns for {table}: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect columns for {table}: {e}"))?;

    Ok(columns.iter().any(|name| name == column))
}

fn seed_app_meta(conn: &Connection) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let entries = [
        ("schema_version", "1"),
        ("locale", "en-US"),
        ("currency", "USD"),
        ("first_run_at", now.as_str()),
        ("last_backup_at", ""),
        ("last_import_at", ""),
    ];

    for (key, value) in entries {
        conn.execute(
            "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?1, ?2)",
            [key, value],
        )
        .map_err(|e| format!("Failed to seed app_meta: {e}"))?;
    }

    Ok(())
}

fn seed_system_categories(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count categories: {e}"))?;

    if count > 0 {
        return Ok(());
    }

    struct SeedCat {
        name: &'static str,
        cat_type: &'static str,
        sort_order: i32,
        children: &'static [&'static str],
    }

    let seeds = [
        SeedCat {
            name: "Uncategorized",
            cat_type: "expense",
            sort_order: 0,
            children: &[],
        },
        SeedCat {
            name: "Food",
            cat_type: "expense",
            sort_order: 10,
            children: &["Groceries", "Restaurants", "Coffee & Snacks"],
        },
        SeedCat {
            name: "Housing",
            cat_type: "expense",
            sort_order: 20,
            children: &["Rent / Mortgage", "Utilities", "Maintenance"],
        },
        SeedCat {
            name: "Transportation",
            cat_type: "expense",
            sort_order: 30,
            children: &["Gas & Fuel", "Public Transit", "Ride Share", "Parking"],
        },
        SeedCat {
            name: "Healthcare",
            cat_type: "expense",
            sort_order: 40,
            children: &["Medical", "Pharmacy", "Insurance"],
        },
        SeedCat {
            name: "Entertainment",
            cat_type: "expense",
            sort_order: 50,
            children: &["Movies & Events", "Hobbies", "Subscriptions"],
        },
        SeedCat {
            name: "Shopping",
            cat_type: "expense",
            sort_order: 60,
            children: &["Clothing", "Electronics", "Home & Garden"],
        },
        SeedCat {
            name: "Personal",
            cat_type: "expense",
            sort_order: 70,
            children: &["Hair & Beauty", "Fitness", "Education"],
        },
        SeedCat {
            name: "Bills & Fees",
            cat_type: "expense",
            sort_order: 80,
            children: &["Phone", "Internet", "Bank Fees"],
        },
        SeedCat {
            name: "Income",
            cat_type: "income",
            sort_order: 100,
            children: &["Salary", "Interest", "Refunds", "Other Income"],
        },
        SeedCat {
            name: "Transfers",
            cat_type: "transfer",
            sort_order: 110,
            children: &[],
        },
    ];

    for seed in seeds {
        conn.execute(
            "INSERT INTO categories (parent_id, name, type, is_system, sort_order)
             VALUES (NULL, ?1, ?2, 1, ?3)",
            (seed.name, seed.cat_type, seed.sort_order),
        )
        .map_err(|e| format!("Failed to seed category {}: {e}", seed.name))?;

        let parent_id = conn.last_insert_rowid();

        for (idx, child) in seed.children.iter().enumerate() {
            conn.execute(
                "INSERT INTO categories (parent_id, name, type, is_system, sort_order)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                (parent_id, child, seed.cat_type, idx as i32),
            )
            .map_err(|e| format!("Failed to seed child category {child}: {e}"))?;
        }
    }

    Ok(())
}

pub fn init_db() -> Result<(), String> {
    let conn = open_db()?;
    quick_check(&conn)?;
    run_migrations(&conn)?;
    Ok(())
}