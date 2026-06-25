import { describe, expect, it } from "vitest";
import { applyMapping } from "../pipeline";
import { applyBankPreset } from "../suggest-mapping";
import type { ColumnMapping, ParsedRow } from "../../types";

const TD_HEADERS = ["Date", "Description", "Debit", "Credit"];

function tdMapping(): ColumnMapping {
  const suggested = applyBankPreset(TD_HEADERS, "td");
  return {
    date: suggested.date ?? "",
    amount: suggested.amount ?? "",
    memo: suggested.memo ?? "",
    name: suggested.name ?? "",
    transaction: suggested.transaction ?? "",
    debit: suggested.debit,
    credit: suggested.credit,
    amountMode: suggested.amountMode,
  };
}

describe("debit/credit import mapping", () => {
  it("maps TD headers with debit_credit amount mode", () => {
    expect(applyBankPreset(TD_HEADERS, "td")).toEqual({
      date: "Date",
      memo: "Description",
      debit: "Debit",
      credit: "Credit",
      amountMode: "debit_credit",
    });
  });

  it("treats debit-only rows as negative expenses", () => {
    const rows: ParsedRow[] = [
      {
        Date: "2024-02-01",
        Description: "Coffee shop",
        Debit: "12.50",
        Credit: "",
      },
    ];

    const drafts = applyMapping(rows, tdMapping(), 1);

    expect(drafts[0]).toMatchObject({
      date: "2024-02-01",
      amountCents: -1250,
      memo: "Coffee shop",
      type: "expense",
    });
  });

  it("treats credit-only rows as positive income", () => {
    const rows: ParsedRow[] = [
      {
        Date: "2024-02-02",
        Description: "Payroll deposit",
        Debit: "",
        Credit: "3,500.00",
      },
    ];

    const drafts = applyMapping(rows, tdMapping(), 1);

    expect(drafts[0]).toMatchObject({
      date: "2024-02-02",
      amountCents: 350000,
      memo: "Payroll deposit",
      type: "income",
    });
  });

  it("computes signed amount as credit minus debit when both are populated", () => {
    const rows: ParsedRow[] = [
      {
        Date: "2024-02-03",
        Description: "Adjustment",
        Debit: "25.00",
        Credit: "10.00",
      },
    ];

    const drafts = applyMapping(rows, tdMapping(), 1);

    expect(drafts[0]?.amountCents).toBe(-1500);
    expect(drafts[0]?.type).toBe("expense");
  });

  it("keeps single-column amount behavior when amountMode is single", () => {
    const rows: ParsedRow[] = [
      {
        Date: "2024-02-04",
        Amount: "-42.00",
        Description: "Utility bill",
      },
    ];

    const mapping: ColumnMapping = {
      date: "Date",
      amount: "Amount",
      memo: "Description",
      name: "",
      transaction: "",
      amountMode: "single",
    };

    const drafts = applyMapping(rows, mapping, 1);

    expect(drafts[0]).toMatchObject({
      amountCents: -4200,
      type: "expense",
    });
  });
});