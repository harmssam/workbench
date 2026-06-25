import Papa from "papaparse";
import type {
  ColumnMapping,
  ConflictStatus,
  DedupResult,
  ParsedRow,
  TransactionDraft,
  TransactionType,
  ValidationResult,
} from "../types";
import { sha256Hex } from "./hash";
import { normalizeMemo, parseAmountToCents, parseDate } from "./normalize";

const EXPENSE_KEYWORDS = ["debit", "withdrawal", "payment", "expense", "charge", "purchase"];
const INCOME_KEYWORDS = ["credit", "deposit", "income", "refund"];
const TRANSFER_KEYWORDS = ["transfer", "tfr", "xfer"];
const INTERNAL_TRANSFER_PATTERNS = [
  /internet withdrawal to/i,
  /withdrawal to tangerine/i,
  /recurring internet withdrawal/i,
  /credit card payment/i,
  /internet deposit from/i,
];

export function computeImportHash(
  accountId: number,
  date: string,
  amountCents: number,
  memo: string | null,
): string {
  const canonical = [
    String(accountId),
    date,
    String(amountCents),
    normalizeMemo(memo),
  ].join("|");

  return sha256Hex(canonical);
}

function inferTransactionType(
  amountCents: number,
  payee: string | null,
  memo: string | null,
  transactionValue: string | undefined,
): TransactionType {
  const combined = [transactionValue, payee, memo]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const normalized = combined.toLowerCase();

  if (normalized) {
    if (
      TRANSFER_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
      INTERNAL_TRANSFER_PATTERNS.some((pattern) => pattern.test(combined))
    ) {
      return "transfer";
    }

    if (EXPENSE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "expense";
    }

    if (INCOME_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "income";
    }
  }

  if (amountCents < 0) {
    return "expense";
  }

  if (amountCents > 0) {
    return "income";
  }

  return "transfer";
}

function normalizeAmountSign(amountCents: number, type: TransactionType): number {
  if (type === "expense" && amountCents > 0) {
    return -amountCents;
  }

  if (type === "income" && amountCents < 0) {
    return -amountCents;
  }

  return amountCents;
}

export function parseCsv(
  text: string,
  _encoding: string,
): { headers: string[]; rows: ParsedRow[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  const headers = parsed.meta.fields?.map((field) => field.trim()).filter(Boolean) ?? [];
  const rows = (parsed.data ?? []).map((row) => {
    const normalizedRow: ParsedRow = {};
    for (const [key, value] of Object.entries(row)) {
      normalizedRow[key.trim()] = value ?? "";
    }
    return normalizedRow;
  });

  return { headers, rows };
}

function parseDebitCreditAmountCents(
  row: ParsedRow,
  mapping: ColumnMapping,
): number | null {
  const rawDebit = mapping.debit ? row[mapping.debit] ?? "" : "";
  const rawCredit = mapping.credit ? row[mapping.credit] ?? "" : "";

  const debitCents = rawDebit.trim() ? parseAmountToCents(rawDebit) : 0;
  const creditCents = rawCredit.trim() ? parseAmountToCents(rawCredit) : 0;

  if (debitCents === null || creditCents === null) {
    return null;
  }

  if (debitCents === 0 && creditCents === 0) {
    return 0;
  }

  return creditCents - debitCents;
}

export function applyMapping(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  accountId: number,
): TransactionDraft[] {
  const isDebitCreditMode = mapping.amountMode === "debit_credit";

  return rows.map((row, rowIndex) => {
    const rawAmount = row[mapping.amount] ?? "";
    const rawDate = row[mapping.date] ?? "";
    const rawMemo = row[mapping.memo] ?? "";
    const rawPayee = row[mapping.name] ?? "";
    const rawTransaction = row[mapping.transaction] ?? "";

    const parsedAmount = isDebitCreditMode
      ? parseDebitCreditAmountCents(row, mapping)
      : parseAmountToCents(rawAmount);
    const parsedDate = parseDate(rawDate);
    const memo = rawMemo.trim() || null;
    const payee = rawPayee.trim() || null;
    const type =
      parsedAmount === null
        ? "expense"
        : inferTransactionType(parsedAmount, payee, memo, rawTransaction);
    const amountCents =
      parsedAmount === null
        ? 0
        : isDebitCreditMode
          ? parsedAmount
          : normalizeAmountSign(parsedAmount, type);

    const draft: TransactionDraft = {
      rowIndex,
      accountId,
      date: parsedDate ?? "",
      amountCents,
      memo,
      payee,
      type,
      categoryId: null,
      appliedRuleId: null,
      importHash: "",
      raw: row,
      errors: [],
    };

    draft.importHash = computeImportHash(
      draft.accountId,
      draft.date,
      draft.amountCents,
      draft.memo,
    );

    return draft;
  });
}

export function validateDrafts(drafts: TransactionDraft[]): ValidationResult {
  const valid: TransactionDraft[] = [];
  const invalid: TransactionDraft[] = [];

  for (const draft of drafts) {
    const errors: string[] = [];

    if (!draft.date) {
      errors.push("Invalid or missing date");
    }

    if (!Number.isInteger(draft.amountCents)) {
      errors.push("Invalid amount");
    } else if (draft.amountCents === 0 && draft.type !== "transfer") {
      errors.push("Amount cannot be zero");
    }

    if (!draft.accountId) {
      errors.push("Missing account");
    }

    const validatedDraft = { ...draft, errors };
    if (errors.length > 0) {
      invalid.push(validatedDraft);
    } else {
      valid.push(validatedDraft);
    }
  }

  return { valid, invalid };
}

function canonicalDraftKey(draft: TransactionDraft): string {
  return [
    String(draft.accountId),
    draft.date,
    String(draft.amountCents),
    normalizeMemo(draft.memo),
    normalizeMemo(draft.payee),
    draft.type,
  ].join("|");
}

export function deduplicateDrafts(
  drafts: TransactionDraft[],
  existingHashes: Set<string> | string[],
): DedupResult {
  const existing = existingHashes instanceof Set ? existingHashes : new Set(existingHashes);
  const seenInBatch = new Map<string, TransactionDraft>();
  const newRows: TransactionDraft[] = [];
  const duplicates: TransactionDraft[] = [];
  const conflicts: TransactionDraft[] = [];

  for (const draft of drafts) {
    const status = classifyDraft(draft, existing, seenInBatch);
    if (status === "duplicate") {
      duplicates.push(draft);
      continue;
    }

    if (status === "conflict") {
      conflicts.push(draft);
      continue;
    }

    newRows.push(draft);
    seenInBatch.set(draft.importHash, draft);
  }

  return { newRows, duplicates, conflicts };
}

function classifyDraft(
  draft: TransactionDraft,
  existing: Set<string>,
  seenInBatch: Map<string, TransactionDraft>,
): ConflictStatus {
  if (existing.has(draft.importHash)) {
    return "duplicate";
  }

  const prior = seenInBatch.get(draft.importHash);
  if (prior && canonicalDraftKey(prior) !== canonicalDraftKey(draft)) {
    return "conflict";
  }

  if (seenInBatch.has(draft.importHash)) {
    return "duplicate";
  }

  return "new";
}