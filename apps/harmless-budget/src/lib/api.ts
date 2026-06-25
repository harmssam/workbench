import { invoke } from "@tauri-apps/api/core";

// ─── Types (match Rust serde output) ─────────────────────────────────────────

export type CategoryType = "expense" | "income" | "transfer";
export type TransactionType = "expense" | "income" | "transfer";
export type MatchType = "CONTAINS" | "EXACT";

export interface Account {
  id: number;
  name: string;
  include_in_budget: boolean;
}

export interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  cat_type: CategoryType;
  is_system: boolean;
  sort_order: number;
  archived_at: string | null;
  children: Category[];
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  amount_cents: number;
  memo: string | null;
  payee: string | null;
  transaction_type: TransactionType;
  category_id: number | null;
  import_hash: string | null;
  import_batch_id: number | null;
  applied_rule_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: number;
  name: string;
  match_type: MatchType;
  match_value: string;
  category_id: number;
  priority: number;
  enabled: boolean;
}

export interface DashboardSummary {
  month: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  budget_target_cents: number;
  budget_actual_cents: number;
  budget_remaining_cents: number;
  uncategorized_count: number;
  transaction_count: number;
}

export interface BudgetCategoryRow {
  category_id: number;
  category_name: string;
  parent_id: number | null;
  cat_type: CategoryType;
  target_cents: number;
  actual_cents: number;
  remaining_cents: number;
}

export interface BudgetMonth {
  month: string;
  income_cents: number;
  allocated_cents: number;
  to_budget_cents: number;
  actual_income_cents: number;
  total_spent_cents: number;
  categories: BudgetCategoryRow[];
}

export interface ImportTransactionPayload {
  date: string;
  amount_cents: number;
  memo?: string | null;
  payee?: string | null;
  type: TransactionType;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  staged: number;
  import_batch_id: number | null;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function getAccounts(): Promise<Account[]> {
  return invoke<Account[]>("get_accounts");
}

export function createAccount(
  name: string,
  includeInBudget = true,
): Promise<Account> {
  return invoke<Account>("create_account", {
    input: { name, include_in_budget: includeInBudget },
  });
}

export function updateAccount(
  id: number,
  name: string,
  includeInBudget: boolean,
): Promise<Account> {
  return invoke<Account>("update_account", {
    input: { id, name, include_in_budget: includeInBudget },
  });
}

export function deleteAccount(id: number): Promise<void> {
  return invoke("delete_account", { id });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return invoke<Category[]>("get_categories");
}

export function createCategory(input: {
  name: string;
  parent_id?: number | null;
  cat_type?: CategoryType;
}): Promise<Category> {
  return invoke<Category>("create_category", {
    input: {
      name: input.name,
      parent_id: input.parent_id ?? null,
      cat_type: input.cat_type ?? null,
    },
  });
}

export function updateCategory(
  id: number,
  name: string,
): Promise<Category> {
  return invoke<Category>("update_category", {
    input: { id, name },
  });
}

export function archiveCategory(id: number): Promise<void> {
  return invoke("archive_category", { id });
}

// ─── Transactions ────────────────────────────────────────────────────────────

export function getTransactions(filters?: {
  month?: string;
  account_id?: number;
  uncategorized_only?: boolean;
  transaction_type?: TransactionType;
  exclude_transfer_categories?: boolean;
}): Promise<Transaction[]> {
  return invoke<Transaction[]>("get_transactions", {
    accountId: filters?.account_id ?? null,
    month: filters?.month ?? null,
    uncategorized: filters?.uncategorized_only ?? null,
    transactionType: filters?.transaction_type ?? null,
    excludeTransferCategories: filters?.exclude_transfer_categories ?? null,
  });
}

export function updateTransactionCategory(
  transactionId: number,
  categoryId: number | null,
): Promise<Transaction> {
  return invoke<Transaction>("update_transaction_category", {
    transactionId,
    categoryId,
  });
}

export function bulkUpdateTransactionCategories(
  transactionIds: number[],
  categoryId: number | null,
): Promise<{ updated: number }> {
  return invoke<{ updated: number }>("bulk_update_transaction_categories", {
    transactionIds,
    categoryId,
  });
}

export function deleteTransaction(transactionId: number): Promise<void> {
  return invoke("delete_transaction", { transactionId });
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function getRules(): Promise<Rule[]> {
  return invoke<Rule[]>("get_rules");
}

export function createRule(rule: {
  name: string;
  match_type: MatchType;
  match_value: string;
  category_id: number;
  priority?: number;
  enabled?: boolean;
}): Promise<Rule> {
  return invoke<Rule>("create_rule", { input: rule });
}

export function deleteRule(id: number): Promise<void> {
  return invoke("delete_rule", { id });
}

export interface RulePreviewItem {
  rule_id: number;
  rule_name: string;
  match_count: number;
}

export interface PreviewApplyResult {
  uncategorized_count: number;
  would_update: number;
  rules: RulePreviewItem[];
}

export function applyRules(filters?: {
  month?: string;
  account_id?: number;
}): Promise<{ updated: number }> {
  return invoke<{ updated: number }>("apply_rules", {
    month: filters?.month ?? null,
    accountId: filters?.account_id ?? null,
  });
}

export function previewApplyRules(filters?: {
  month?: string;
  account_id?: number;
}): Promise<PreviewApplyResult> {
  return invoke<PreviewApplyResult>("preview_apply_rules", {
    month: filters?.month ?? null,
    accountId: filters?.account_id ?? null,
  });
}

export function setRuleEnabled(
  id: number,
  enabled: boolean,
): Promise<Rule> {
  return invoke<Rule>("set_rule_enabled", { id, enabled });
}

export function reorderRules(ruleIds: number[]): Promise<Rule[]> {
  return invoke<Rule[]>("reorder_rules", { ruleIds });
}

// ─── Dashboard & Budget ──────────────────────────────────────────────────────

export function getDashboardSummary(month: string): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary", { month });
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface MonthTrend {
  month: string;
  label: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
}

export interface SpendingTrends {
  months: MonthTrend[];
}

export interface CategoryBreakdownItem {
  category_id: number | null;
  category_name: string;
  amount_cents: number;
  percentage: number;
}

export interface CategoryBreakdown {
  month: string;
  total_cents: number;
  categories: CategoryBreakdownItem[];
}

export interface TopPayee {
  payee: string;
  amount_cents: number;
  transaction_count: number;
}

export interface TopPayees {
  month: string;
  payees: TopPayee[];
}

export function getSpendingTrends(
  months: number,
  endMonth: string,
  accountId?: number,
): Promise<SpendingTrends> {
  return invoke<SpendingTrends>("get_spending_trends", {
    months,
    endMonth,
    accountId: accountId ?? null,
  });
}

export function getCategoryBreakdown(
  month: string,
  accountId?: number,
): Promise<CategoryBreakdown> {
  return invoke<CategoryBreakdown>("get_category_breakdown", {
    month,
    accountId: accountId ?? null,
  });
}

export function getTopPayees(
  month: string,
  limit = 10,
  accountId?: number,
): Promise<TopPayees> {
  return invoke<TopPayees>("get_top_payees", {
    month,
    limit,
    accountId: accountId ?? null,
  });
}

export function getBudgetMonth(month: string): Promise<BudgetMonth> {
  return invoke<BudgetMonth>("get_budget_month", { month });
}

export function setBudgetTarget(
  categoryId: number,
  month: string,
  targetCents: number,
): Promise<void> {
  return invoke("set_budget_target", {
    input: { category_id: categoryId, month, target_cents: targetCents },
  });
}

export function setBudgetMonthIncome(
  month: string,
  incomeCents: number,
): Promise<void> {
  return invoke("set_budget_month_income", {
    input: { month, income_cents: incomeCents },
  });
}

// ─── Import ──────────────────────────────────────────────────────────────────

export function readFileText(path: string): Promise<string> {
  return invoke<string>("read_file_text", { path });
}

export function getImportHashes(accountId: number): Promise<string[]> {
  return invoke<string[]>("get_import_hashes", { accountId });
}

export interface ImportProfileRecord {
  id: number;
  account_id: number;
  name: string;
  preset_id: string | null;
  mapping_json: string;
  created_at: string;
  updated_at: string;
}

export interface ImportHistoryEntry {
  id: number;
  account_id: number | null;
  account_name: string | null;
  filename: string | null;
  source: string | null;
  imported_at: string;
  row_count: number;
  status: string;
}

export function importTransactions(
  accountId: number,
  transactions: ImportTransactionPayload[],
  dedupMode: "skip" | "all" | "review" = "skip",
  filename?: string,
): Promise<ImportResult> {
  return invoke<ImportResult>("import_transactions", {
    accountId,
    transactionsJson: JSON.stringify(transactions),
    dedupMode,
    filename: filename ?? null,
  });
}

export function getImportProfiles(
  accountId: number,
): Promise<ImportProfileRecord[]> {
  return invoke<ImportProfileRecord[]>("get_import_profiles", { accountId });
}

export function getDefaultImportProfile(
  accountId: number,
): Promise<ImportProfileRecord | null> {
  return invoke<ImportProfileRecord | null>("get_default_import_profile", {
    accountId,
  });
}

export function saveImportProfile(input: {
  account_id: number;
  name: string;
  preset_id?: string | null;
  mapping_json: string;
}): Promise<ImportProfileRecord> {
  return invoke<ImportProfileRecord>("save_import_profile", { input });
}

export function deleteImportProfile(id: number): Promise<void> {
  return invoke("delete_import_profile", { id });
}

export function getImportHistory(
  limit = 20,
): Promise<ImportHistoryEntry[]> {
  return invoke<ImportHistoryEntry[]>("get_import_history", { limit });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getDataPath(): Promise<string> {
  return invoke<string>("get_data_path");
}

export function exportDatabase(path: string): Promise<void> {
  return invoke("export_database", { path });
}

export function restoreDatabase(path: string): Promise<void> {
  return invoke("restore_database", { path });
}

export function openDataFolder(): Promise<void> {
  return invoke("open_data_folder");
}