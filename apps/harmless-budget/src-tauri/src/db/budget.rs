use super::categories;
use super::spending::SPENDING_INCOME_FILTER;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetTarget {
    pub id: i64,
    pub category_id: i64,
    pub month: String,
    pub target_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetCategoryRow {
    pub category_id: i64,
    pub category_name: String,
    pub parent_id: Option<i64>,
    pub cat_type: String,
    pub target_cents: i64,
    pub actual_cents: i64,
    pub remaining_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct BudgetMonth {
    pub month: String,
    pub income_cents: i64,
    pub allocated_cents: i64,
    pub to_budget_cents: i64,
    pub actual_income_cents: i64,
    pub total_spent_cents: i64,
    pub categories: Vec<BudgetCategoryRow>,
}

#[derive(Debug, Deserialize)]
pub struct SetBudgetTargetInput {
    pub category_id: i64,
    pub month: String,
    pub target_cents: i64,
}

#[derive(Debug, Deserialize)]
pub struct SetBudgetMonthIncomeInput {
    pub month: String,
    pub income_cents: i64,
}

pub fn get_month(conn: &Connection, month: &str) -> Result<BudgetMonth, String> {
    let leaves = categories::get_leaves(conn)?;
    let expense_leaves: Vec<_> = leaves
        .into_iter()
        .filter(|c| c.cat_type == "expense")
        .collect();

    let income_cents = get_month_income(conn, month)?;
    let actual_income_cents = get_actual_income(conn, month)?;

    let mut rows = Vec::new();
    let mut allocated_cents = 0i64;
    let mut total_spent_cents = 0i64;

    for leaf in expense_leaves {
        let target_cents = get_target_for_category(conn, leaf.id, month)?;
        let actual_cents = get_actual_for_category(conn, leaf.id, month)?;
        let spent_cents = actual_cents.abs();
        let remaining_cents = target_cents - spent_cents;

        allocated_cents += target_cents;
        total_spent_cents += spent_cents;

        rows.push(BudgetCategoryRow {
            category_id: leaf.id,
            category_name: leaf.name,
            parent_id: leaf.parent_id,
            cat_type: leaf.cat_type,
            target_cents,
            actual_cents,
            remaining_cents,
        });
    }

    Ok(BudgetMonth {
        month: month.to_string(),
        income_cents,
        allocated_cents,
        to_budget_cents: income_cents - allocated_cents,
        actual_income_cents,
        total_spent_cents,
        categories: rows,
    })
}

pub fn set_month_income(
    conn: &Connection,
    input: &SetBudgetMonthIncomeInput,
) -> Result<(), String> {
    if input.income_cents < 0 {
        return Err("Income cannot be negative".to_string());
    }

    conn.execute(
        "INSERT INTO budget_months (month, income_cents)
         VALUES (?1, ?2)
         ON CONFLICT(month) DO UPDATE SET income_cents = excluded.income_cents",
        params![input.month, input.income_cents],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn get_month_income(conn: &Connection, month: &str) -> Result<i64, String> {
    let result: Option<i64> = conn
        .query_row(
            "SELECT income_cents FROM budget_months WHERE month = ?1",
            params![month],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result.unwrap_or(0))
}

fn get_actual_income(conn: &Connection, month: &str) -> Result<i64, String> {
    let month_prefix = format!("{month}%");
    let income_sql = format!(
        "SELECT COALESCE(SUM(t.amount_cents), 0)
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE {SPENDING_INCOME_FILTER}
           AND t.date LIKE ?1"
    );

    conn.query_row(&income_sql, params![month_prefix], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn get_target_for_category(conn: &Connection, category_id: i64, month: &str) -> Result<i64, String> {
    let result: Option<i64> = conn
        .query_row(
            "SELECT target_cents FROM budget_targets
             WHERE category_id = ?1 AND month = ?2",
            params![category_id, month],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result.unwrap_or(0))
}

fn get_actual_for_category(conn: &Connection, category_id: i64, month: &str) -> Result<i64, String> {
    let month_prefix = format!("{month}%");
    let sum: Option<i64> = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_cents), 0)
             FROM transactions
             WHERE category_id = ?1 AND date LIKE ?2",
            params![category_id, month_prefix],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(sum.unwrap_or(0))
}

pub fn set_target(conn: &Connection, input: &SetBudgetTargetInput) -> Result<BudgetTarget, String> {
    if input.target_cents < 0 {
        return Err("Budget amount cannot be negative".to_string());
    }

    if !categories::is_leaf(conn, input.category_id)? {
        return Err("Budget targets can only be set on leaf categories".to_string());
    }

    conn.execute(
        "INSERT INTO budget_targets (category_id, month, target_cents)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(category_id, month) DO UPDATE SET target_cents = excluded.target_cents",
        params![input.category_id, input.month, input.target_cents],
    )
    .map_err(|e| e.to_string())?;

    let id: i64 = conn
        .query_row(
            "SELECT id FROM budget_targets WHERE category_id = ?1 AND month = ?2",
            params![input.category_id, input.month],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(BudgetTarget {
        id,
        category_id: input.category_id,
        month: input.month.clone(),
        target_cents: input.target_cents,
    })
}

pub fn get_allocated_cents(conn: &Connection, month: &str) -> Result<i64, String> {
    let allocated: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(bt.target_cents), 0)
             FROM budget_targets bt
             JOIN categories c ON c.id = bt.category_id
             WHERE bt.month = ?1 AND c.type = 'expense'",
            params![month],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(allocated)
}