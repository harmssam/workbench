mod commands;
mod db;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let import_item = MenuItem::with_id(app, "go_import", "Import CSV…", true, Some("Cmd+I"))?;
    let open_folder =
        MenuItem::with_id(app, "open_data_folder", "Open Data Folder", true, None::<&str>)?;
    let export_item =
        MenuItem::with_id(app, "go_settings", "Backup & Settings…", true, None::<&str>)?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &import_item,
            &PredefinedMenuItem::separator(app)?,
            &open_folder,
            &export_item,
        ],
    )?;

    let dash_item = MenuItem::with_id(app, "go_dashboard", "Dashboard", true, Some("Cmd+1"))?;
    let txns_item =
        MenuItem::with_id(app, "go_transactions", "Transactions", true, Some("Cmd+2"))?;
    let budget_item = MenuItem::with_id(app, "go_budget", "Budget", true, Some("Cmd+4"))?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&dash_item, &txns_item, &budget_item],
    )?;

    let app_submenu = Submenu::with_items(
        app,
        "Harmless Budget",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("Harmless Budget"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Hide Harmless Budget"))?,
            &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
            &PredefinedMenuItem::show_all(app, Some("Show All"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quit Harmless Budget"))?,
        ],
    )?;

    Menu::with_items(app, &[&app_submenu, &file_menu, &view_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            db::init_db()?;
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "open_data_folder" => {
                    let _ = commands::open_data_folder(app.clone());
                }
                "go_import" => {
                    let _ = app.emit("menu-navigate", "/import");
                }
                "go_settings" => {
                    let _ = app.emit("menu-navigate", "/settings");
                }
                "go_dashboard" => {
                    let _ = app.emit("menu-navigate", "/");
                }
                "go_transactions" => {
                    let _ = app.emit("menu-navigate", "/transactions");
                }
                "go_budget" => {
                    let _ = app.emit("menu-navigate", "/budget");
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_data_path,
            commands::get_accounts,
            commands::create_account,
            commands::update_account,
            commands::delete_account,
            commands::get_categories,
            commands::create_category,
            commands::update_category,
            commands::archive_category,
            commands::get_transactions,
            commands::update_transaction_category,
            commands::bulk_update_transaction_categories,
            commands::delete_transaction,
            commands::get_rules,
            commands::create_rule,
            commands::delete_rule,
            commands::apply_rules,
            commands::preview_apply_rules,
            commands::set_rule_enabled,
            commands::reorder_rules,
            commands::get_budget_month,
            commands::set_budget_target,
            commands::set_budget_month_income,
            commands::get_dashboard_summary,
            commands::get_spending_trends,
            commands::get_category_breakdown,
            commands::get_top_payees,
            commands::read_file_text,
            commands::import_transactions,
            commands::get_import_profiles,
            commands::get_default_import_profile,
            commands::save_import_profile,
            commands::delete_import_profile,
            commands::get_import_history,
            commands::get_import_hashes,
            commands::export_database,
            commands::restore_database,
            commands::open_data_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}