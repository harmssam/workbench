use chrono::{Datelike, NaiveDate};
use rusqlite::Connection;
use serde::Serialize;

/// Spending totals exclude internal transfers (type or transfer category).
const SPENDING_EXPENSE_FILTER: &str =
    "t.type = 'expense' AND (c.id IS NULL OR c.type != 'transfer')";
const SPENDING_INCOME_FILTER: &str =
    "t.type = 'income' AND (c.id IS NULL OR c.type != 'transfer')";

#[derive(Debug, Serialize)]
pub struct MonthTrend {
    pub month: String,
    pub label: String,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub net_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct SpendingTrends {
    pub months: Vec<MonthTrend>,
}

#[derive(Debug, Serialize)]
pub struct CategoryBreakdownItem {
    pub category_id: Option<i64>,
    pub category_name: String,
    pub amount_cents: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize)]
pub struct CategoryBreakdown {
    pub month: String,
    pub total_cents: i64,
    pub categories: Vec<CategoryBreakdownItem>,
}

#[derive(Debug, Serialize)]
pub struct TopPayee {
    pub payee: String,
    pub amount_cents: i64,
    pub transaction_count: i64,
}

#[derive(Debug, Serialize)]
pub struct TopPayees {
    pub month: String,
    pub payees: Vec<TopPayee>,
}

fn parse_month_start(month: &str) -> Result<NaiveDate, String> {
    if month.len() != 7 || !month.contains('-') {
        return Err(format!("Invalid month key: {month}"));
    }
    let parts: Vec<&str> = month.split('-').collect();
    let year: i32 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid year in month: {month}"))?;
    let month_num: u32 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid month in month: {month}"))?;
    NaiveDate::from_ymd_opt(year, month_num, 1)
        .ok_or_else(|| format!("Invalid month date: {month}"))
}

fn month_label(month: &str) -> String {
    parse_month_start(month)
        .map(|date| {
            let month_name = match date.month() {
                1 => "Jan",
                2 => "Feb",
                3 => "Mar",
                4 => "Apr",
                5 => "May",
                6 => "Jun",
                7 => "Jul",
                8 => "Aug",
                9 => "Sep",
                10 => "Oct",
                11 => "Nov",
                12 => "Dec",
                _ => "???",
            };
            format!("{month_name} {}", date.year())
        })
        .unwrap_or_else(|_| month.to_string())
}

fn month_keys_ending_at(end_month: &str, count: i32) -> Result<Vec<String>, String> {
    let mut cursor = parse_month_start(end_month)?;
    let mut keys = Vec::with_capacity(count as usize);

    for _ in 0..count {
        keys.push(format!("{}-{:02}", cursor.year(), cursor.month()));
        cursor = if cursor.month() == 1 {
            NaiveDate::from_ymd_opt(cursor.year() - 1, 12, 1)
        } else {
            NaiveDate::from_ymd_opt(cursor.year(), cursor.month() - 1, 1)
        }
        .ok_or_else(|| "Month underflow".to_string())?;
    }

    keys.reverse();
    Ok(keys)
}

pub fn get_spending_trends(
    conn: &Connection,
    months: i32,
    end_month: &str,
    account_id: Option<i64>,
) -> Result<SpendingTrends, String> {
    let month_keys = month_keys_ending_at(end_month, months.max(1).min(24))?;
    let start_month = month_keys
        .first()
        .cloned()
        .ok_or_else(|| "No months in range".to_string())?;

    let mut sql = String::from(
        "SELECT substr(t.date, 1, 7) AS month_key,
                COALESCE(SUM(CASE WHEN ",
    );
    sql.push_str(SPENDING_INCOME_FILTER);
    sql.push_str(" THEN t.amount_cents ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN ");
    sql.push_str(SPENDING_EXPENSE_FILTER);
    sql.push_str(
        " THEN t.amount_cents ELSE 0 END), 0)
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE substr(t.date, 1, 7) >= ?1 AND substr(t.date, 1, 7) <= ?2",
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> =
        vec![Box::new(start_month), Box::new(end_month.to_string())];

    if let Some(account_id) = account_id {
        sql.push_str(" AND account_id = ?");
        params_vec.push(Box::new(account_id));
    }

    sql.push_str(" GROUP BY month_key");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut totals: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (key, income, expense) = row.map_err(|e| e.to_string())?;
        totals.insert(key, (income, expense));
    }

    let months_out = month_keys
        .into_iter()
        .map(|key| {
            let (income, expense) = totals.get(&key).copied().unwrap_or((0, 0));
            MonthTrend {
                label: month_label(&key),
                month: key,
                income_cents: income,
                expense_cents: expense,
                net_cents: income + expense,
            }
        })
        .collect();

    Ok(SpendingTrends {
        months: months_out,
    })
}

pub fn get_category_breakdown(
    conn: &Connection,
    month: &str,
    account_id: Option<i64>,
) -> Result<CategoryBreakdown, String> {
    let month_prefix = format!("{month}%");

    let mut sql = String::from(
        "SELECT MIN(t.category_id) AS category_id,
                CASE
                    WHEN t.category_id IS NULL
                         OR COALESCE(c.name, 'Uncategorized') = 'Uncategorized'
                    THEN 'Uncategorized'
                    ELSE c.name
                END AS category_name,
                COALESCE(SUM(ABS(t.amount_cents)), 0) AS total_cents
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ",
    );
    sql.push_str(SPENDING_EXPENSE_FILTER);
    sql.push_str(" AND t.date LIKE ?1");
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month_prefix)];

    if let Some(account_id) = account_id {
        sql.push_str(" AND t.account_id = ?");
        params_vec.push(Box::new(account_id));
    }

    sql.push_str(" GROUP BY category_name ORDER BY total_cents DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows: Vec<(Option<i64>, String, i64)> = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let total_cents: i64 = rows.iter().map(|(_, _, amount)| *amount).sum();

    let categories = rows
        .into_iter()
        .map(|(category_id, category_name, amount_cents)| {
            let percentage = if total_cents > 0 {
                (amount_cents as f64 / total_cents as f64) * 100.0
            } else {
                0.0
            };
            CategoryBreakdownItem {
                category_id,
                category_name,
                amount_cents,
                percentage,
            }
        })
        .collect();

    Ok(CategoryBreakdown {
        month: month.to_string(),
        total_cents,
        categories,
    })
}

pub fn get_top_payees(
    conn: &Connection,
    month: &str,
    limit: i64,
    account_id: Option<i64>,
) -> Result<TopPayees, String> {
    let month_prefix = format!("{month}%");
    let limit = limit.clamp(1, 50);

    let mut sql = String::from(
        "SELECT COALESCE(NULLIF(TRIM(t.payee), ''), NULLIF(TRIM(t.memo), ''), 'Unknown') AS label,
                COALESCE(SUM(ABS(t.amount_cents)), 0) AS total_cents,
                COUNT(*) AS txn_count
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ",
    );
    sql.push_str(SPENDING_EXPENSE_FILTER);
    sql.push_str(" AND t.date LIKE ?1");
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month_prefix)];

    if let Some(account_id) = account_id {
        sql.push_str(" AND account_id = ?");
        params_vec.push(Box::new(account_id));
    }

    sql.push_str(" GROUP BY label ORDER BY total_cents DESC LIMIT ?");
    params_vec.push(Box::new(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let payees = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(TopPayee {
                payee: row.get(0)?,
                amount_cents: row.get(1)?,
                transaction_count: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(TopPayees {
        month: month.to_string(),
        payees,
    })
}