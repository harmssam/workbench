import { getBankPreset } from "./bank-presets";
import type { ColumnMapping, SuggestedColumnMapping } from "../types";

type MappableField = Exclude<keyof ColumnMapping, "amountMode">;

const FIELD_KEYWORDS: Record<MappableField, string[]> = {
  date: ["date", "time", "posted", "transaction date", "posting date"],
  amount: ["amount", "sum", "total", "value", "cad$", "amount ($)"],
  debit: ["debit", "withdrawal", "withdrawals", "out"],
  credit: ["credit", "deposit", "deposits", "in"],
  memo: ["memo", "description", "notes", "details", "reference"],
  name: ["name", "payee", "merchant", "vendor"],
  transaction: ["type", "transaction", "category", "trans type"],
};

function normalizeHeaders(headers: string[]): { normalized: string[]; lower: string[] } {
  const normalized = headers
    .map((header) => header.trim())
    .filter((header) => header.length > 0);

  return {
    normalized,
    lower: normalized.map((header) => header.toLowerCase()),
  };
}

function findHeaderByHint(
  normalizedHeaders: string[],
  lowerHeaders: string[],
  hint: string,
  selectedColumns: Set<string>,
): string | undefined {
  const normalizedHint = hint.trim().toLowerCase();
  if (!normalizedHint) {
    return undefined;
  }

  const exactIndex = lowerHeaders.findIndex(
    (header, index) =>
      header === normalizedHint && !selectedColumns.has(normalizedHeaders[index] ?? header),
  );
  if (exactIndex !== -1) {
    return normalizedHeaders[exactIndex];
  }

  const partialIndex = lowerHeaders.findIndex(
    (header, index) =>
      (header.includes(normalizedHint) || normalizedHint.includes(header)) &&
      !selectedColumns.has(normalizedHeaders[index] ?? header),
  );
  if (partialIndex !== -1) {
    return normalizedHeaders[partialIndex];
  }

  return undefined;
}

function mapFieldsFromKeywords(
  normalizedHeaders: string[],
  lowerHeaders: string[],
  fields: MappableField[],
): SuggestedColumnMapping {
  const selectedColumns = new Set<string>();
  const mapping: SuggestedColumnMapping = {};

  for (const field of fields) {
    const keywords = FIELD_KEYWORDS[field];
    const matchedIndex = lowerHeaders.findIndex(
      (header, index) =>
        keywords.some((keyword) => header.includes(keyword)) &&
        !selectedColumns.has(normalizedHeaders[index] ?? header),
    );

    if (matchedIndex === -1) {
      continue;
    }

    const matchedHeader = normalizedHeaders[matchedIndex];
    if (!matchedHeader || selectedColumns.has(matchedHeader)) {
      continue;
    }

    mapping[field] = matchedHeader;
    selectedColumns.add(matchedHeader);
  }

  return mapping;
}

function applyDebitCreditMode(mapping: SuggestedColumnMapping): SuggestedColumnMapping {
  if (mapping.debit && mapping.credit) {
    return {
      ...mapping,
      amountMode: "debit_credit",
      amount: undefined,
    };
  }

  return mapping;
}

/**
 * Port of v1 autoMapColumns keyword heuristics.
 * Each CSV header can map to at most one app field.
 */
export function suggestColumnMapping(headers: string[]): SuggestedColumnMapping {
  const { normalized, lower } = normalizeHeaders(headers);
  const mapping = mapFieldsFromKeywords(normalized, lower, Object.keys(FIELD_KEYWORDS) as MappableField[]);
  return applyDebitCreditMode(mapping);
}

/**
 * Apply a built-in bank preset to CSV headers, then fill gaps with heuristics.
 */
export function applyBankPreset(headers: string[], presetId: string): SuggestedColumnMapping {
  if (presetId === "generic") {
    return suggestColumnMapping(headers);
  }

  const preset = getBankPreset(presetId);
  if (!preset) {
    return suggestColumnMapping(headers);
  }

  const { normalized, lower } = normalizeHeaders(headers);
  const selectedColumns = new Set<string>();
  const mapping: SuggestedColumnMapping = {};

  for (const [field, hint] of Object.entries(preset.mapping) as Array<
    [keyof ColumnMapping, string | undefined]
  >) {
    if (field === "amountMode" || !hint) {
      if (field === "amountMode" && hint) {
        mapping.amountMode = hint as SuggestedColumnMapping["amountMode"];
      }
      continue;
    }

    const matchedHeader = findHeaderByHint(normalized, lower, hint, selectedColumns);
    if (!matchedHeader) {
      continue;
    }

    mapping[field] = matchedHeader;
    selectedColumns.add(matchedHeader);
  }

  const heuristic = suggestColumnMapping(headers);
  const merged: SuggestedColumnMapping = {
    ...heuristic,
    ...mapping,
    amountMode: mapping.amountMode ?? heuristic.amountMode,
  };

  if (merged.amountMode === "debit_credit") {
    merged.amount = undefined;
  }

  return applyDebitCreditMode(merged);
}