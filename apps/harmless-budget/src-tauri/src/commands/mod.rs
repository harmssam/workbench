use crate::db::{
    self, accounts, analytics, backup, budget, categories, dashboard, import_history,
    import_profiles, rules, transactions,
};
use std::fs;
use tauri_plugin_opener::OpenerExt;

fn with_db<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
{
    let conn = db::open_db()?;
    db::run_migrations(&conn)?;
    f(&conn)
}

#[tauri::command]
pub fn get_data_path() -> Result<String, String> {
    let path = db::get_db_path()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_accounts() -> Result<Vec<accounts::Account>, String> {
    with_db(accounts::list)
}

#[tauri::command]
pub fn create_account(input: accounts::CreateAccountInput) -> Result<accounts::Account, String> {
    with_db(|conn| accounts::create(conn, &input))
}

#[tauri::command]
pub fn update_account(input: accounts::UpdateAccountInput) -> Result<accounts::Account, String> {
    with_db(|conn| accounts::update(conn, &input))
}

#[tauri::command]
pub fn delete_account(id: i64) -> Result<(), String> {
    with_db(|conn| accounts::delete(conn, id))
}

#[tauri::command]
pub fn get_categories() -> Result<Vec<categories::Category>, String> {
    with_db(categories::list_tree)
}

#[tauri::command]
pub fn create_category(
    input: categories::CreateCategoryInput,
) -> Result<categories::CategoryFlat, String> {
    with_db(|conn| categories::create(conn, &input))
}

#[tauri::command]
pub fn update_category(input: categories::UpdateCategoryInput) -> Result<categories::CategoryFlat, String> {
    with_db(|conn| categories::update(conn, &input))
}

#[tauri::command]
pub fn archive_category(id: i64) -> Result<(), String> {
    with_db(|conn| categories::archive(conn, id))
}

#[tauri::command]
pub fn get_transactions(
    account_id: Option<i64>,
    month: Option<String>,
    uncategorized: Option<bool>,
    transaction_type: Option<String>,
    exclude_transfer_categories: Option<bool>,
) -> Result<Vec<transactions::Transaction>, String> {
    let filters = transactions::TransactionFilters {
        account_id,
        month,
        uncategorized,
        transaction_type,
        exclude_transfer_categories,
    };
    with_db(|conn| transactions::list(conn, &filters))
}

#[tauri::command]
pub fn update_transaction_category(
    transaction_id: i64,
    category_id: Option<i64>,
) -> Result<transactions::Transaction, String> {
    with_db(|conn| transactions::update_category(conn, transaction_id, category_id))
}

#[tauri::command]
pub fn delete_transaction(transaction_id: i64) -> Result<(), String> {
    with_db(|conn| transactions::delete(conn, transaction_id))
}

#[tauri::command]
pub fn bulk_update_transaction_categories(
    transaction_ids: Vec<i64>,
    category_id: Option<i64>,
) -> Result<transactions::BulkUpdateResult, String> {
    with_db(|conn| transactions::bulk_update_categories(conn, &transaction_ids, category_id))
}

#[tauri::command]
pub fn get_rules() -> Result<Vec<rules::Rule>, String> {
    with_db(rules::list)
}

#[tauri::command]
pub fn create_rule(input: rules::CreateRuleInput) -> Result<rules::Rule, String> {
    with_db(|conn| rules::create(conn, &input))
}

#[tauri::command]
pub fn delete_rule(id: i64) -> Result<(), String> {
    with_db(|conn| rules::delete(conn, id))
}

#[tauri::command]
pub fn apply_rules(
    month: Option<String>,
    account_id: Option<i64>,
) -> Result<rules::ApplyRulesResult, String> {
    let filters = rules::ApplyRulesFilters {
        month,
        account_id,
    };
    with_db(|conn| rules::apply_to_uncategorized(conn, &filters))
}

#[tauri::command]
pub fn preview_apply_rules(
    month: Option<String>,
    account_id: Option<i64>,
) -> Result<rules::PreviewApplyResult, String> {
    let filters = rules::ApplyRulesFilters {
        month,
        account_id,
    };
    with_db(|conn| rules::preview_apply(conn, &filters))
}

#[tauri::command]
pub fn set_rule_enabled(id: i64, enabled: bool) -> Result<rules::Rule, String> {
    with_db(|conn| rules::set_enabled(conn, id, enabled))
}

#[tauri::command]
pub fn reorder_rules(rule_ids: Vec<i64>) -> Result<Vec<rules::Rule>, String> {
    with_db(|conn| rules::reorder(conn, &rule_ids))
}

#[tauri::command]
pub fn get_budget_month(month: String) -> Result<budget::BudgetMonth, String> {
    with_db(|conn| budget::get_month(conn, &month))
}

#[tauri::command]
pub fn set_budget_target(
    input: budget::SetBudgetTargetInput,
) -> Result<budget::BudgetTarget, String> {
    with_db(|conn| budget::set_target(conn, &input))
}

#[tauri::command]
pub fn get_dashboard_summary(month: String) -> Result<dashboard::DashboardSummary, String> {
    with_db(|conn| dashboard::get_summary(conn, &month))
}

#[tauri::command]
pub fn get_spending_trends(
    months: i32,
    end_month: String,
    account_id: Option<i64>,
) -> Result<analytics::SpendingTrends, String> {
    with_db(|conn| analytics::get_spending_trends(conn, months, &end_month, account_id))
}

#[tauri::command]
pub fn get_category_breakdown(
    month: String,
    account_id: Option<i64>,
) -> Result<analytics::CategoryBreakdown, String> {
    with_db(|conn| analytics::get_category_breakdown(conn, &month, account_id))
}

#[tauri::command]
pub fn get_top_payees(
    month: String,
    limit: Option<i64>,
    account_id: Option<i64>,
) -> Result<analytics::TopPayees, String> {
    let limit = limit.unwrap_or(10);
    with_db(|conn| analytics::get_top_payees(conn, &month, limit, account_id))
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
pub fn import_transactions(
    account_id: i64,
    transactions_json: String,
    dedup_mode: String,
    filename: Option<String>,
) -> Result<transactions::ImportResult, String> {
    let parsed: Vec<transactions::ImportTransactionInput> =
        serde_json::from_str(&transactions_json)
            .map_err(|e| format!("Invalid transactions JSON: {e}"))?;

    with_db(|conn| {
        transactions::bulk_insert(
            conn,
            account_id,
            &parsed,
            &dedup_mode,
            filename.as_deref(),
        )
    })
}

#[tauri::command]
pub fn get_import_profiles(
    account_id: i64,
) -> Result<Vec<import_profiles::ImportProfile>, String> {
    with_db(|conn| import_profiles::list_for_account(conn, account_id))
}

#[tauri::command]
pub fn get_default_import_profile(
    account_id: i64,
) -> Result<Option<import_profiles::ImportProfile>, String> {
    with_db(|conn| import_profiles::get_default(conn, account_id))
}

#[tauri::command]
pub fn save_import_profile(
    input: import_profiles::SaveImportProfileInput,
) -> Result<import_profiles::ImportProfile, String> {
    with_db(|conn| import_profiles::save(conn, &input))
}

#[tauri::command]
pub fn delete_import_profile(id: i64) -> Result<(), String> {
    with_db(|conn| import_profiles::delete(conn, id))
}

#[tauri::command]
pub fn get_import_history(limit: Option<i64>) -> Result<Vec<import_history::ImportHistoryEntry>, String> {
    let limit = limit.unwrap_or(50);
    with_db(|conn| import_history::list(conn, limit))
}

#[tauri::command]
pub fn export_database(path: String) -> Result<(), String> {
    let conn = db::open_db()?;
    backup::export_db(&conn, &path)
}

#[tauri::command]
pub fn restore_database(path: String) -> Result<(), String> {
    backup::restore_db(&path)
}

#[tauri::command]
pub fn get_import_hashes(account_id: i64) -> Result<Vec<String>, String> {
    with_db(|conn| transactions::list_import_hashes(conn, account_id))
}

#[tauri::command]
pub fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let path = db::get_db_path()?;
    let folder = path
        .parent()
        .ok_or_else(|| "Could not resolve data folder".to_string())?;

    app.opener()
        .open_path(folder.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open data folder: {e}"))
}