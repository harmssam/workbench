use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::budget;
use super::spending::{SPENDING_EXPENSE_FILTER, SPENDING_INCOME_FILTER};

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

    let income_sql = format!(
        "SELECT COALESCE(SUM(t.amount_cents), 0)
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE {SPENDING_INCOME_FILTER}
           AND t.date LIKE ?1"
    );
    let income_cents: i64 = conn
        .query_row(&income_sql, params![month_prefix], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let expense_sql = format!(
        "SELECT COALESCE(SUM(t.amount_cents), 0)
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE {SPENDING_EXPENSE_FILTER}
           AND t.date LIKE ?1"
    );
    let expense_cents: i64 = conn
        .query_row(&expense_sql, params![month_prefix], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let allocated_cents = budget::get_allocated_cents(conn, month)?;
    let budget_income_cents: i64 = conn
        .query_row(
            "SELECT COALESCE(income_cents, 0) FROM budget_months WHERE month = ?1",
            params![month],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);

    let budget_target_cents = if budget_income_cents > 0 {
        budget_income_cents
    } else {
        allocated_cents
    };

    let budget_actual_cents = allocated_cents;

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