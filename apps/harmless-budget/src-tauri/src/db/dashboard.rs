use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct DashboardSummary {
    pub month: String,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub net_cents: i64,
    pub budget_target_cents: i64,
    pub budget_actual_cents: i64,
    pub budget_remaining_cents: i64,
    pub uncategorized_count: i64,
    pub transaction_count: i64,
}

pub fn get_summary(conn: &Connection, month: &str) -> Result<DashboardSummary, String> {
    let month_prefix = format!("{month}%");

    let income_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(t.amount_cents), 0)
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
             WHERE t.type = 'income'
               AND t.date LIKE ?1
               AND (c.id IS NULL OR c.type != 'transfer')",
            params![month_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let expense_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(t.amount_cents), 0)
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
             WHERE t.type = 'expense'
               AND t.date LIKE ?1
               AND (c.id IS NULL OR c.type != 'transfer')",
            params![month_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let budget_target_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(bt.target_cents), 0)
             FROM budget_targets bt
             JOIN categories c ON c.id = bt.category_id
             WHERE bt.month = ?1 AND c.type = 'expense'",
            params![month],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let budget_actual_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(t.amount_cents), 0)
             FROM transactions t
             JOIN categories c ON c.id = t.category_id
             JOIN accounts a ON a.id = t.account_id
             WHERE t.date LIKE ?1
               AND c.type = 'expense'
               AND a.include_in_budget = 1",
            params![month_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let uncategorized_count: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM transactions
             WHERE category_id IS NULL AND date LIKE ?1",
            params![month_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let transaction_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE date LIKE ?1",
            params![month_prefix],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(DashboardSummary {
        month: month.to_string(),
        income_cents,
        expense_cents,
        net_cents: income_cents + expense_cents,
        budget_target_cents,
        budget_actual_cents,
        budget_remaining_cents: budget_target_cents - budget_actual_cents,
        uncategorized_count,
        transaction_count,
    })
}