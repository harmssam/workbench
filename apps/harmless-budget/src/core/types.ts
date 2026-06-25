export type TransactionType = "expense" | "income" | "transfer";

export type RuleMatchType = "CONTAINS" | "EXACT";

export type ConflictStatus = "new" | "duplicate" | "conflict";

export type ImportResolution = "skip" | "import" | "pending";

/** Raw CSV row keyed by header name. */
export type ParsedRow = Record<string, string>;

export type AmountMappingMode = "single" | "debit_credit";

/** User-selected CSV column → app field mapping (header names). */
export interface ColumnMapping {
  date: string;
  amount: string;
  memo: string;
  name: string;
  transaction: string;
  debit?: string;
  credit?: string;
  amountMode?: AmountMappingMode;
}

/** Built-in bank CSV format preset for column mapping hints. */
export interface BankPreset {
  id: string;
  name: string;
  mapping: Partial<ColumnMapping>;
}

/** Saved import mapping profile (matches `import_profiles` table). */
export interface ImportProfile {
  id: number;
  name: string;
  accountId: number | null;
  bankPresetId: string | null;
  mappingJson: string;
  createdAt: string;
  updatedAt: string;
}

/** Partial mapping produced by heuristics before the user confirms. */
export type SuggestedColumnMapping = Partial<ColumnMapping>;

/** Normalized transaction candidate produced by the import pipeline. */
export interface TransactionDraft {
  rowIndex: number;
  accountId: number;
  date: string;
  amountCents: number;
  memo: string | null;
  payee: string | null;
  type: TransactionType;
  categoryId: number | null;
  appliedRuleId: number | null;
  importHash: string;
  raw: ParsedRow;
  errors: string[];
}

export interface ValidationResult {
  valid: TransactionDraft[];
  invalid: TransactionDraft[];
}

export interface DedupResult {
  newRows: TransactionDraft[];
  duplicates: TransactionDraft[];
  conflicts: TransactionDraft[];
}

export interface ImportPreview {
  headers: string[];
  rows: ParsedRow[];
  suggestedMapping: SuggestedColumnMapping;
  drafts: TransactionDraft[];
  validation: ValidationResult;
  dedup: DedupResult;
}

export interface Rule {
  id: number;
  name: string;
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: number;
  priority: number;
  enabled: boolean;
}

export interface BudgetTarget {
  categoryId: number;
  month: string;
  targetCents: number;
}

export interface BudgetProgress {
  categoryId: number;
  month: string;
  targetCents: number;
  actualCents: number;
  remainingCents: number;
  percentUsed: number | null;
}

export interface TransactionRecord {
  id?: number;
  accountId: number;
  date: string;
  amountCents: number;
  memo: string | null;
  payee: string | null;
  type: TransactionType;
  categoryId: number | null;
}