const AMOUNT_PATTERN =
  /^\s*(?:\(([^)]+)\)|(-)?\s*([^\d-]*)([\d,]+)(?:\.(\d{1,2}))?|(-)?\s*([^\d-]*)([\d.]+)(?:,(\d{1,2}))?)\s*$/;

const DATE_FORMATS: Array<{ pattern: RegExp; toIso: (match: RegExpMatchArray) => string | null }> = [
  {
    pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    toIso: (match) => toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
  },
  {
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    toIso: (match) => toIsoDate(Number(match[3]), Number(match[1]), Number(match[2])),
  },
  {
    pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    toIso: (match) => toIsoDate(Number(match[3]), Number(match[1]), Number(match[2])),
  },
  {
    pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    toIso: (match) => toIsoDate(Number(match[3]), Number(match[2]), Number(match[1])),
  },
];

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function roundHalfAwayFromZero(value: number): number {
  if (value >= 0) {
    return Math.floor(value + 0.5);
  }

  return Math.ceil(value - 0.5);
}

/**
 * Parse a locale-ish currency string into signed integer cents.
 * Supports parentheses negatives, commas, and currency symbols.
 */
export function parseAmountToCents(value: string): number | null {
  if (!value || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(AMOUNT_PATTERN);
  if (!match) {
    return null;
  }

  let negative = false;
  let wholePart = "";
  let fractionalPart = "00";

  if (match[1] !== undefined) {
    negative = true;
    const inner = match[1].replace(/[^\d.,-]/g, "");
    const normalized = inner.replace(/,/g, "");
    const [whole, fraction = "00"] = normalized.split(".");
    wholePart = whole ?? "";
    fractionalPart = (fraction + "00").slice(0, 2);
  } else if (match[4] !== undefined) {
    negative = match[2] === "-" || trimmed.startsWith("-");
    wholePart = match[4].replace(/,/g, "");
    fractionalPart = (match[5] ?? "00").padEnd(2, "0").slice(0, 2);
  } else if (match[8] !== undefined) {
    negative = match[6] === "-" || trimmed.startsWith("-");
    wholePart = match[8].replace(/\./g, "");
    fractionalPart = (match[9] ?? "00").padEnd(2, "0").slice(0, 2);
  } else {
    return null;
  }

  if (!/^\d+$/.test(wholePart) || !/^\d{2}$/.test(fractionalPart)) {
    return null;
  }

  const cents = Number(wholePart) * 100 + Number(fractionalPart);
  if (!Number.isFinite(cents)) {
    return null;
  }

  const signed = negative ? -cents : cents;
  return roundHalfAwayFromZero(signed);
}

/**
 * Parse a date string into canonical ISO date (YYYY-MM-DD).
 */
export function parseDate(value: string, formatHint?: string): string | null {
  if (!value || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (formatHint) {
    const hinted = parseWithHint(trimmed, formatHint);
    if (hinted) {
      return hinted;
    }
  }

  for (const format of DATE_FORMATS) {
    const match = trimmed.match(format.pattern);
    if (match) {
      const iso = format.toIso(match);
      if (iso) {
        return iso;
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime()) && trimmed.includes("-")) {
    return toIsoDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
    );
  }

  return null;
}

function parseWithHint(value: string, formatHint: string): string | null {
  const hint = formatHint.toLowerCase();

  if (hint === "iso" || hint === "yyyy-mm-dd") {
    return parseDate(value);
  }

  if (hint === "mdy" || hint === "mm/dd/yyyy") {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match
      ? toIsoDate(Number(match[3]), Number(match[1]), Number(match[2]))
      : null;
  }

  if (hint === "dmy" || hint === "dd/mm/yyyy") {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match
      ? toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]))
      : null;
  }

  return null;
}

export function normalizeMemo(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}