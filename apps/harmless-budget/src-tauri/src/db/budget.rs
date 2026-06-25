use super::categories;
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
    pub categories: Vec<BudgetCategoryRow>,
    pub total_target_cents: i64,
    pub total_actual_cents: i64,
    pub total_remaining_cents: i64,
}

#[derive(Debug, Deserialize)]
pub struct SetBudgetTargetInput {
    pub category_id: i64,
    pub month: String,
    pub target_cents: i64,
}

pub fn get_month(conn: &Connection, month: &str) -> Result<BudgetMonth, String> {
    let leaves = categories::get_leaves(conn)?;
    let expense_leaves: Vec<_> = leaves
        .into_iter()
        .filter(|c| c.cat_type == "expense")
        .collect();

    let mut rows = Vec::new();
    let mut total_target = 0i64;
    let mut total_actual = 0i64;

    for leaf in expense_leaves {
        let target_cents = get_target_for_category(conn, leaf.id, month)?;
        let actual_cents = get_actual_for_category(conn, leaf.id, month)?;
        let remaining_cents = target_cents - actual_cents;

        total_target += target_cents;
        total_actual += actual_cents;

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
        categories: rows,
        total_target_cents: total_target,
        total_actual_cents: total_actual,
        total_remaining_cents: total_target - total_actual,
    })
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