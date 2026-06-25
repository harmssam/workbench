use super::{import_history, rules};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub account_id: i64,
    pub date: String,
    pub amount_cents: i64,
    pub memo: Option<String>,
    pub payee: Option<String>,
    pub transaction_type: String,
    pub category_id: Option<i64>,
    pub import_hash: Option<String>,
    pub import_batch_id: Option<i64>,
    pub applied_rule_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TransactionFilters {
    pub account_id: Option<i64>,
    pub month: Option<String>,
    pub uncategorized: Option<bool>,
    pub transaction_type: Option<String>,
    pub exclude_transfer_categories: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportTransactionInput {
    pub date: String,
    pub amount_cents: i64,
    pub memo: Option<String>,
    pub payee: Option<String>,
    #[serde(rename = "type")]
    pub transaction_type: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub inserted: i64,
    pub skipped: i64,
    pub staged: i64,
    pub import_batch_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct StagedRow {
    pub id: i64,
    pub row_index: i64,
    pub raw_json: String,
    pub normalized_json: String,
    pub import_hash: String,
    pub conflict_status: String,
    pub resolution: Option<String>,
}

fn row_to_transaction(row: &rusqlite::Row<'_>) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        account_id: row.get(1)?,
        date: row.get(2)?,
        amount_cents: row.get(3)?,
        memo: row.get(4)?,
        payee: row.get(5)?,
        transaction_type: row.get(6)?,
        category_id: row.get(7)?,
        import_hash: row.get(8)?,
        import_batch_id: row.get(9)?,
        applied_rule_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub fn list(conn: &Connection, filters: &TransactionFilters) -> Result<Vec<Transaction>, String> {
    let mut sql = String::from(
        "SELECT id, account_id, date, amount_cents, memo, payee, type,
                category_id, import_hash, import_batch_id, applied_rule_id,
                created_at, updated_at
         FROM transactions WHERE 1=1",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(account_id) = filters.account_id {
        sql.push_str(" AND account_id = ?");
        params_vec.push(Box::new(account_id));
    }

    if let Some(ref month) = filters.month {
        sql.push_str(" AND date LIKE ?");
        params_vec.push(Box::new(format!("{month}%")));
    }

    if filters.uncategorized.unwrap_or(false) {
        sql.push_str(" AND category_id IS NULL");
    }

    if let Some(ref transaction_type) = filters.transaction_type {
        sql.push_str(" AND type = ?");
        params_vec.push(Box::new(transaction_type.clone()));
    }

    if filters.exclude_transfer_categories.unwrap_or(false) {
        sql.push_str(" AND type != 'transfer'");
        sql.push_str(
            " AND (category_id IS NULL OR category_id NOT IN \
             (SELECT id FROM categories WHERE type = 'transfer'))",
        );
    }

    sql.push_str(" ORDER BY date DESC, id DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), row_to_transaction)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[derive(Debug, Serialize)]
pub struct BulkUpdateResult {
    pub updated: i64,
}

fn transaction_type_for_category(
    conn: &Connection,
    category_id: Option<i64>,
) -> Result<Option<String>, String> {
    let Some(category_id) = category_id else {
        return Ok(None);
    };

    let cat_type: String = conn
        .query_row(
            "SELECT type FROM categories WHERE id = ?1",
            [category_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(Some(cat_type))
}

pub fn bulk_update_categories(
    conn: &Connection,
    transaction_ids: &[i64],
    category_id: Option<i64>,
) -> Result<BulkUpdateResult, String> {
    if transaction_ids.is_empty() {
        return Ok(BulkUpdateResult { updated: 0 });
    }

    let txn_type = transaction_type_for_category(conn, category_id)?;
    let now = Utc::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut updated = 0i64;

    for id in transaction_ids {
        let changed = if let Some(ref txn_type) = txn_type {
            tx.execute(
                "UPDATE transactions
                 SET category_id = ?1, type = ?2, applied_rule_id = NULL, updated_at = ?3
                 WHERE id = ?4",
                params![category_id, txn_type, now, id],
            )
            .map_err(|e| e.to_string())?
        } else {
            tx.execute(
                "UPDATE transactions
                 SET category_id = ?1, applied_rule_id = NULL, updated_at = ?2
                 WHERE id = ?3",
                params![category_id, now, id],
            )
            .map_err(|e| e.to_string())?
        };
        updated += changed as i64;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(BulkUpdateResult { updated })
}

pub fn update_category(
    conn: &Connection,
    transaction_id: i64,
    category_id: Option<i64>,
) -> Result<Transaction, String> {
    let txn_type = transaction_type_for_category(conn, category_id)?;
    let now = Utc::now().to_rfc3339();
    let changed = if let Some(ref txn_type) = txn_type {
        conn.execute(
            "UPDATE transactions
             SET category_id = ?1, type = ?2, applied_rule_id = NULL, updated_at = ?3
             WHERE id = ?4",
            params![category_id, txn_type, now, transaction_id],
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.execute(
            "UPDATE transactions
             SET category_id = ?1, applied_rule_id = NULL, updated_at = ?2
             WHERE id = ?3",
            params![category_id, now, transaction_id],
        )
        .map_err(|e| e.to_string())?
    };

    if changed == 0 {
        return Err(format!("Transaction {transaction_id} not found"));
    }

    get_by_id(conn, transaction_id)?.ok_or_else(|| format!("Transaction {transaction_id} not found"))
}

pub fn delete(conn: &Connection, transaction_id: i64) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM transactions WHERE id = ?1", [transaction_id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Transaction {transaction_id} not found"));
    }

    Ok(())
}

pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Transaction>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, date, amount_cents, memo, payee, type,
                    category_id, import_hash, import_batch_id, applied_rule_id,
                    created_at, updated_at
             FROM transactions WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([id], row_to_transaction)
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub fn list_import_hashes(conn: &Connection, account_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT import_hash FROM transactions
             WHERE account_id = ?1 AND import_hash IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([account_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub fn hash_exists(conn: &Connection, import_hash: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE import_hash = ?1",
            [import_hash],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count > 0)
}

pub fn compute_import_hash(
    account_id: i64,
    date: &str,
    amount_cents: i64,
    memo: &str,
) -> String {
    let normalized = format!(
        "{}|{}|{}|{}",
        account_id,
        date,
        amount_cents,
        normalize_field(memo)
    );
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hex::encode(hasher.finalize())
}

fn normalize_field(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalized_json(account_id: i64, input: &ImportTransactionInput) -> Result<String, String> {
    Ok(serde_json::json!({
        "account_id": account_id,
        "date": input.date,
        "amount_cents": input.amount_cents,
        "payee": input.payee,
        "memo": input.memo,
        "type": input.transaction_type,
    })
    .to_string())
}

pub fn bulk_insert(
    conn: &Connection,
    account_id: i64,
    transactions: &[ImportTransactionInput],
    dedup_mode: &str,
    filename: Option<&str>,
) -> Result<ImportResult, String> {
    match dedup_mode {
        "skip" => bulk_insert_skip(conn, account_id, transactions, filename),
        "all" => bulk_insert_all(conn, account_id, transactions),
        "review" => bulk_insert_review(conn, account_id, transactions),
        other => Err(format!("Invalid dedup_mode: {other}. Expected skip, all, or review")),
    }
}

fn bulk_insert_skip(
    conn: &Connection,
    account_id: i64,
    transactions: &[ImportTransactionInput],
    filename: Option<&str>,
) -> Result<ImportResult, String> {
    let now = Utc::now().to_rfc3339();
    let mut inserted = 0i64;
    let mut skipped = 0i64;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for input in transactions {
        validate_import_input(input)?;

        let memo = input.memo.as_deref().unwrap_or("");
        let import_hash = compute_import_hash(account_id, &input.date, input.amount_cents, memo);

        if hash_exists(&tx, &import_hash)? {
            skipped += 1;
            continue;
        }

        let (category_id, applied_rule_id) =
            rules::match_transaction(&tx, Some(memo), input.payee.as_deref())?;

        tx.execute(
            "INSERT INTO transactions
             (account_id, date, amount_cents, memo, payee, type, category_id,
              import_hash, applied_rule_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                account_id,
                input.date,
                input.amount_cents,
                input.memo,
                input.payee,
                input.transaction_type,
                category_id,
                import_hash,
                applied_rule_id,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        inserted += 1;
    }

    let import_batch_id = if inserted > 0 {
        Some(import_history::record_commit(
            &tx,
            account_id,
            filename,
            inserted,
        )?)
    } else {
        None
    };

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        inserted,
        skipped,
        staged: 0,
        import_batch_id,
    })
}

fn bulk_insert_all(
    conn: &Connection,
    account_id: i64,
    transactions: &[ImportTransactionInput],
) -> Result<ImportResult, String> {
    let now = Utc::now().to_rfc3339();
    let mut inserted = 0i64;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for input in transactions {
        validate_import_input(input)?;

        let memo = input.memo.as_deref().unwrap_or("");
        let (category_id, applied_rule_id) =
            rules::match_transaction(&tx, Some(memo), input.payee.as_deref())?;

        tx.execute(
            "INSERT INTO transactions
             (account_id, date, amount_cents, memo, payee, type, category_id,
              import_hash, applied_rule_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10)",
            params![
                account_id,
                input.date,
                input.amount_cents,
                input.memo,
                input.payee,
                input.transaction_type,
                category_id,
                applied_rule_id,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        inserted += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        inserted,
        skipped: 0,
        staged: 0,
        import_batch_id: None,
    })
}

fn bulk_insert_review(
    conn: &Connection,
    account_id: i64,
    transactions: &[ImportTransactionInput],
) -> Result<ImportResult, String> {
    let now = Utc::now().to_rfc3339();
    let row_count = transactions.len() as i64;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO import_batches (filename, source, imported_at, row_count, status)
         VALUES (NULL, 'json', ?1, ?2, 'staging')",
        params![now, row_count],
    )
    .map_err(|e| e.to_string())?;

    let batch_id = tx.last_insert_rowid();
    let mut staged = 0i64;

    for (idx, input) in transactions.iter().enumerate() {
        validate_import_input(input)?;

        let memo = input.memo.as_deref().unwrap_or("");
        let import_hash = compute_import_hash(account_id, &input.date, input.amount_cents, memo);
        let norm = normalized_json(account_id, input)?;
        let raw = serde_json::to_string(input).map_err(|e| e.to_string())?;

        let conflict_status = if hash_exists(&tx, &import_hash)? {
            "duplicate"
        } else {
            "new"
        };

        tx.execute(
            "INSERT INTO import_staging
             (import_batch_id, row_index, raw_json, normalized_json, import_hash,
              conflict_status, resolution)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending')",
            params![batch_id, idx as i64, raw, norm, import_hash, conflict_status],
        )
        .map_err(|e| e.to_string())?;

        staged += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportResult {
        inserted: 0,
        skipped: 0,
        staged,
        import_batch_id: Some(batch_id),
    })
}

fn validate_import_input(input: &ImportTransactionInput) -> Result<(), String> {
    if !matches!(
        input.transaction_type.as_str(),
        "expense" | "income" | "transfer"
    ) {
        return Err(format!(
            "Invalid transaction type: {}",
            input.transaction_type
        ));
    }
    Ok(())
}

pub fn get_staging_for_batch(conn: &Connection, batch_id: i64) -> Result<Vec<StagedRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, row_index, raw_json, normalized_json, import_hash,
                    conflict_status, resolution
             FROM import_staging
             WHERE import_batch_id = ?1
             ORDER BY row_index",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([batch_id], |row| {
            Ok(StagedRow {
                id: row.get(0)?,
                row_index: row.get(1)?,
                raw_json: row.get(2)?,
                normalized_json: row.get(3)?,
                import_hash: row.get(4)?,
                conflict_status: row.get(5)?,
                resolution: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}