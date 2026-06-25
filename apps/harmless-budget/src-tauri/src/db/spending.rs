//! Shared SQL filters for income/expense totals on the dashboard and analytics.

/// Expense-side spending: real spending, not internal account transfers.
/// Excludes transfer-type transactions and anything categorized as a transfer.
pub const SPENDING_EXPENSE_FILTER: &str =
    "t.type = 'expense'
     AND (t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE type = 'transfer'))";

/// Income-side spending: real income, not internal account transfers.
pub const SPENDING_INCOME_FILTER: &str =
    "t.type = 'income'
     AND (t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE type = 'transfer'))";

/// Payee patterns for inter-account transfers misclassified during import.
pub const INTERNAL_TRANSFER_PAYEE_SQL: &str = "
    LOWER(COALESCE(payee, '')) LIKE '%internet withdrawal to%'
    OR LOWER(COALESCE(payee, '')) LIKE '%withdrawal to tangerine%'
    OR LOWER(COALESCE(payee, '')) LIKE '%recurring internet withdrawal%'
    OR LOWER(COALESCE(payee, '')) LIKE '%credit card payment%'
    OR LOWER(COALESCE(payee, '')) LIKE '%internet deposit from%'
";

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER REFERENCES categories(id),
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                is_system INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                archived_at TEXT
            );

            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                include_in_budget INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                date TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                memo TEXT,
                payee TEXT,
                type TEXT NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                import_hash TEXT,
                import_batch_id INTEGER,
                applied_rule_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            INSERT INTO accounts (id, name) VALUES (1, 'Checking');
            INSERT INTO categories (id, name, type, is_system, sort_order) VALUES
                (1, 'Groceries', 'expense', 1, 1),
                (2, 'Transfers', 'transfer', 1, 2);
            ",
        )
        .unwrap();
        conn
    }

    fn expense_total(conn: &Connection, month: &str) -> i64 {
        let sql = format!(
            "SELECT COALESCE(SUM(t.amount_cents), 0)
             FROM transactions t
             LEFT JOIN categories c ON c.id = t.category_id
             WHERE {SPENDING_EXPENSE_FILTER}
               AND t.date LIKE ?1"
        );
        conn.query_row(&sql, [format!("{month}%")], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn spending_expense_excludes_transfer_type_and_transfer_category() {
        let conn = setup_conn();
        let now = "2026-06-01T00:00:00Z";

        conn.execute_batch(&format!(
            "
            INSERT INTO transactions
                (account_id, date, amount_cents, payee, type, category_id, created_at, updated_at)
            VALUES
                (1, '2026-06-05', -5000, 'Grocery Store', 'expense', 1, '{now}', '{now}'),
                (1, '2026-06-06', -12000, 'Credit Card Payment', 'transfer', 2, '{now}', '{now}'),
                (1, '2026-06-07', -8000, 'Mislabeled Transfer', 'expense', 2, '{now}', '{now}');
            "
        ))
        .unwrap();

        assert_eq!(expense_total(&conn, "2026-06"), -5000);
    }
}