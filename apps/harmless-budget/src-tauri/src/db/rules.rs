use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: i64,
    pub name: String,
    pub match_type: String,
    pub match_value: String,
    pub category_id: i64,
    pub priority: i32,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateRuleInput {
    pub name: String,
    pub match_type: String,
    pub match_value: String,
    pub category_id: i64,
    pub priority: Option<i32>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyRulesFilters {
    pub month: Option<String>,
    pub account_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ApplyRulesResult {
    pub updated: i64,
}

#[derive(Debug, Serialize)]
pub struct RulePreviewItem {
    pub rule_id: i64,
    pub rule_name: String,
    pub match_count: i64,
}

#[derive(Debug, Serialize)]
pub struct PreviewApplyResult {
    pub uncategorized_count: i64,
    pub rules: Vec<RulePreviewItem>,
    pub would_update: i64,
}

fn row_to_rule(row: &rusqlite::Row<'_>) -> rusqlite::Result<Rule> {
    Ok(Rule {
        id: row.get(0)?,
        name: row.get(1)?,
        match_type: row.get(2)?,
        match_value: row.get(3)?,
        category_id: row.get(4)?,
        priority: row.get(5)?,
        enabled: row.get::<_, i64>(6)? != 0,
    })
}

pub fn list(conn: &Connection) -> Result<Vec<Rule>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, match_type, match_value, category_id, priority, enabled
             FROM rules
             ORDER BY priority ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], row_to_rule)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

fn next_priority(conn: &Connection) -> Result<i32, String> {
    let max_priority: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(priority), -1) FROM rules",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(max_priority + 1)
}

pub fn create(conn: &Connection, input: &CreateRuleInput) -> Result<Rule, String> {
    validate_match_type(&input.match_type)?;

    let priority = match input.priority {
        Some(p) => p,
        None => next_priority(conn)?,
    };
    let enabled = input.enabled.unwrap_or(true);

    conn.execute(
        "INSERT INTO rules (name, match_type, match_value, category_id, priority, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.name,
            input.match_type,
            input.match_value,
            input.category_id,
            priority,
            enabled as i64,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    Ok(Rule {
        id,
        name: input.name.clone(),
        match_type: input.match_type.clone(),
        match_value: input.match_value.clone(),
        category_id: input.category_id,
        priority,
        enabled,
    })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM rules WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Rule {id} not found"));
    }

    Ok(())
}

pub fn reorder(conn: &Connection, rule_ids: &[i64]) -> Result<Vec<Rule>, String> {
    let existing = list(conn)?;
    if rule_ids.len() != existing.len() {
        return Err("Rule order must include every rule exactly once".to_string());
    }

    let existing_ids: std::collections::HashSet<i64> = existing.iter().map(|r| r.id).collect();
    for id in rule_ids {
        if !existing_ids.contains(id) {
            return Err(format!("Unknown rule id: {id}"));
        }
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (index, id) in rule_ids.iter().enumerate() {
        tx.execute(
            "UPDATE rules SET priority = ?1 WHERE id = ?2",
            params![index as i32, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    list(conn)
}

pub fn set_enabled(conn: &Connection, id: i64, enabled: bool) -> Result<Rule, String> {
    let changed = conn
        .execute(
            "UPDATE rules SET enabled = ?1 WHERE id = ?2",
            params![enabled as i64, id],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Rule {id} not found"));
    }

    get_by_id(conn, id)?.ok_or_else(|| format!("Rule {id} not found"))
}

fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Rule>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, match_type, match_value, category_id, priority, enabled
             FROM rules WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([id], row_to_rule)
        .optional()
        .map_err(|e| e.to_string())
}

pub fn apply_to_uncategorized(
    conn: &Connection,
    filters: &ApplyRulesFilters,
) -> Result<ApplyRulesResult, String> {
    let rules = list(conn)?;
    let enabled_rules: Vec<_> = rules.into_iter().filter(|r| r.enabled).collect();
    let uncategorized = fetch_uncategorized(conn, filters)?;

    let now = Utc::now().to_rfc3339();
    let mut updated = 0i64;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for (transaction_id, memo, payee) in uncategorized {
        if let Some(rule) = find_matching_rule(&enabled_rules, memo.as_deref(), payee.as_deref()) {
            tx.execute(
                "UPDATE transactions
                 SET category_id = ?1,
                     type = (SELECT type FROM categories WHERE id = ?1),
                     applied_rule_id = ?2,
                     updated_at = ?3
                 WHERE id = ?4",
                params![rule.category_id, rule.id, now, transaction_id],
            )
            .map_err(|e| e.to_string())?;
            updated += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(ApplyRulesResult { updated })
}

pub fn preview_apply(
    conn: &Connection,
    filters: &ApplyRulesFilters,
) -> Result<PreviewApplyResult, String> {
    let rules = list(conn)?;
    let enabled_rules: Vec<_> = rules.into_iter().filter(|r| r.enabled).collect();
    let uncategorized = fetch_uncategorized(conn, filters)?;
    let uncategorized_count = uncategorized.len() as i64;

    let mut rule_counts: Vec<(i64, String, i64)> = enabled_rules
        .iter()
        .map(|rule| (rule.id, rule.name.clone(), 0))
        .collect();

    let mut matched_ids = std::collections::HashSet::new();

    for (transaction_id, memo, payee) in &uncategorized {
        if let Some(rule) = find_matching_rule(&enabled_rules, memo.as_deref(), payee.as_deref()) {
            if let Some(entry) = rule_counts.iter_mut().find(|(id, _, _)| *id == rule.id) {
                entry.2 += 1;
            }
            matched_ids.insert(*transaction_id);
        }
    }

    let rules_preview = rule_counts
        .into_iter()
        .filter(|(_, _, count)| *count > 0)
        .map(|(rule_id, rule_name, match_count)| RulePreviewItem {
            rule_id,
            rule_name,
            match_count,
        })
        .collect();

    Ok(PreviewApplyResult {
        uncategorized_count,
        would_update: matched_ids.len() as i64,
        rules: rules_preview,
    })
}

pub fn match_transaction(
    conn: &Connection,
    memo: Option<&str>,
    payee: Option<&str>,
) -> Result<(Option<i64>, Option<i64>), String> {
    let rules = list(conn)?;
    let enabled_rules: Vec<_> = rules.into_iter().filter(|r| r.enabled).collect();

    if let Some(rule) = find_matching_rule(&enabled_rules, memo, payee) {
        Ok((Some(rule.category_id), Some(rule.id)))
    } else {
        Ok((None, None))
    }
}

fn fetch_uncategorized(
    conn: &Connection,
    filters: &ApplyRulesFilters,
) -> Result<Vec<(i64, Option<String>, Option<String>)>, String> {
    let mut sql = String::from(
        "SELECT id, memo, payee FROM transactions WHERE category_id IS NULL",
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

    sql.push_str(" ORDER BY date DESC, id DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn find_matching_rule<'a>(
    rules: &'a [Rule],
    memo: Option<&str>,
    payee: Option<&str>,
) -> Option<&'a Rule> {
    let haystack = match_text(memo, payee);
    if haystack.is_empty() {
        return None;
    }

    for rule in rules {
        let normalized_value = normalize_memo(&rule.match_value);
        if normalized_value.is_empty() {
            continue;
        }

        let matches = match rule.match_type.as_str() {
            "CONTAINS" => haystack.contains(&normalized_value),
            "EXACT" => haystack == normalized_value,
            _ => false,
        };
        if matches {
            return Some(rule);
        }
    }
    None
}

pub fn match_text(memo: Option<&str>, payee: Option<&str>) -> String {
    let parts: Vec<String> = [payee, memo]
        .into_iter()
        .flatten()
        .map(normalize_memo)
        .filter(|s| !s.is_empty())
        .collect();

    parts.join(" ")
}

fn normalize_memo(value: &str) -> String {
    value.trim().to_lowercase()
}

fn validate_match_type(match_type: &str) -> Result<(), String> {
    if matches!(match_type, "CONTAINS" | "EXACT") {
        Ok(())
    } else {
        Err(format!("Invalid match_type: {match_type}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_text_combines_payee_and_memo() {
        assert_eq!(
            match_text(Some("GROCERY"), Some("WHOLE FOODS")),
            "whole foods grocery"
        );
    }

    #[test]
    fn contains_rule_matches_payee() {
        let rules = vec![Rule {
            id: 1,
            name: "Groceries".into(),
            match_type: "CONTAINS".into(),
            match_value: "whole foods".into(),
            category_id: 1,
            priority: 0,
            enabled: true,
        }];
        assert!(find_matching_rule(&rules, None, Some("WHOLE FOODS #123")).is_some());
    }
}