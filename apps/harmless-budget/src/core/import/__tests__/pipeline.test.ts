import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyRules } from "../../rules";
import { detectEncoding } from "../encoding";
import {
  applyMapping,
  computeImportHash,
  deduplicateDrafts,
  parseCsv,
  validateDrafts,
} from "../pipeline";
import { suggestColumnMapping } from "../suggest-mapping";

const fixturesDir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, "fixtures", name), "utf-8");
}

describe("parseCsv", () => {
  it("parses generic bank CSV rows", () => {
    const text = loadFixture("generic-bank.csv");
    const encoding = detectEncoding(text);
    const { headers, rows } = parseCsv(text, encoding);

    expect(headers).toEqual(["Date", "Description", "Amount", "Type", "Payee"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.Description).toBe("Grocery Store");
  });

  it("parses quoted commas in memo and merchant fields", () => {
    const text = loadFixture("quoted-commas.csv");
    const { rows } = parseCsv(text, detectEncoding(text));

    expect(rows[0]?.Memo).toBe('Payment to "Acme, LLC"');
    expect(rows[0]?.["Merchant Name"]).toBe("Acme, LLC");
    expect(rows[1]?.Amount).toBe("1,234.56");
  });
});

describe("applyMapping", () => {
  it("normalizes mapped rows into transaction drafts", () => {
    const text = loadFixture("generic-bank.csv");
    const { headers, rows } = parseCsv(text, "utf-8");
    const mapping = {
      date: "Date",
      amount: "Amount",
      memo: "Description",
      name: "Payee",
      transaction: "Type",
      ...suggestColumnMapping(headers),
    };

    const drafts = applyMapping(rows, mapping, 1);

    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({
      accountId: 1,
      date: "2024-01-15",
      amountCents: -4567,
      memo: "Grocery Store",
      payee: "Whole Foods",
      type: "expense",
    });
    expect(drafts[1]).toMatchObject({
      date: "2024-01-16",
      amountCents: 250000,
      type: "income",
    });
    expect(drafts[2]).toMatchObject({
      date: "2024-01-17",
      amountCents: -50000,
      type: "transfer",
    });
  });

  it("classifies inter-account movements as transfers before expense keywords", () => {
    const mapping = {
      date: "Date",
      amount: "Amount",
      memo: "Description",
      name: "Payee",
      transaction: "Type",
      amountMode: "single" as const,
    };

    const drafts = applyMapping(
      [
        {
          Date: "2024-02-01",
          Amount: "-775.00",
          Description: "Completed transfer to Tangerine DDA account",
          Payee: "Internet Withdrawal to Tangerine",
          Type: "",
        },
      ],
      mapping,
      1,
    );

    expect(drafts[0]).toMatchObject({
      amountCents: -77500,
      type: "transfer",
    });
  });

  it("handles parenthetical negatives from quoted CSV", () => {
    const text = loadFixture("quoted-commas.csv");
    const { headers, rows } = parseCsv(text, "utf-8");
    const mapping = {
      date: "Transaction Date",
      amount: "Amount",
      memo: "Memo",
      name: "Merchant Name",
      transaction: "Category",
      ...suggestColumnMapping(headers),
    };

    const drafts = applyMapping(rows, mapping, 2);

    expect(drafts[0]?.amountCents).toBe(-1234);
    expect(drafts[1]?.amountCents).toBe(123456);
  });
});

describe("validateDrafts", () => {
  it("splits valid and invalid drafts", () => {
    const text = loadFixture("generic-bank.csv");
    const { rows } = parseCsv(text, "utf-8");
    const mapping = suggestColumnMapping(["Date", "Description", "Amount", "Type", "Payee"]);
    const drafts = applyMapping(rows, mapping as Required<typeof mapping>, 1);

    const invalidDraft = {
      ...drafts[0]!,
      rowIndex: 99,
      date: "",
      errors: [],
    };

    const result = validateDrafts([...drafts, invalidDraft]);

    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.errors).toContain("Invalid or missing date");
  });
});

describe("computeImportHash", () => {
  it("returns a stable sha256 hex digest", () => {
    const hash = computeImportHash(1, "2024-01-15", -4567, "Grocery Store");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeImportHash(1, "2024-01-15", -4567, "Grocery Store")).toBe(hash);
    expect(computeImportHash(1, "2024-01-15", -4567, "grocery store")).toBe(hash);
  });
});

describe("deduplicateDrafts", () => {
  it("classifies new, duplicate, and conflicting rows", () => {
    const text = loadFixture("generic-bank.csv");
    const { rows } = parseCsv(text, "utf-8");
    const mapping = suggestColumnMapping(["Date", "Description", "Amount", "Type", "Payee"]);
    const drafts = applyMapping(rows, mapping as Required<typeof mapping>, 1);
    const first = drafts[0]!;
    const duplicate = { ...first, rowIndex: 10 };
    const conflict = {
      ...first,
      rowIndex: 11,
      payee: "Different Payee",
    };

    const result = deduplicateDrafts(
      [first, duplicate, conflict],
      new Set([drafts[1]!.importHash]),
    );

    expect(result.duplicates.map((draft) => draft.rowIndex)).toEqual([10]);
    expect(result.conflicts.map((draft) => draft.rowIndex)).toEqual([11]);
    expect(result.newRows.map((draft) => draft.rowIndex)).toEqual([0]);
  });
});

describe("rules integration", () => {
  it("applies the first enabled rule by priority", () => {
    const text = loadFixture("generic-bank.csv");
    const { rows } = parseCsv(text, "utf-8");
    const mapping = suggestColumnMapping(["Date", "Description", "Amount", "Type", "Payee"]);
    const drafts = applyMapping(rows, mapping as Required<typeof mapping>, 1);

    const categorized = applyRules(drafts, [
      {
        id: 2,
        name: "Generic food",
        matchType: "CONTAINS",
        matchValue: "store",
        categoryId: 99,
        priority: 5,
        enabled: true,
      },
      {
        id: 1,
        name: "Groceries",
        matchType: "CONTAINS",
        matchValue: "grocery",
        categoryId: 10,
        priority: 1,
        enabled: true,
      },
    ]);

    expect(categorized[0]?.categoryId).toBe(10);
    expect(categorized[0]?.appliedRuleId).toBe(1);
    expect(categorized[1]?.categoryId).toBeNull();
  });
});