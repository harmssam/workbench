import { describe, expect, it } from "vitest";
import { suggestColumnMapping } from "../suggest-mapping";

describe("suggestColumnMapping", () => {
  it("maps generic bank headers using v1 keyword heuristics", () => {
    const headers = ["Date", "Description", "Amount", "Type", "Payee"];

    expect(suggestColumnMapping(headers)).toEqual({
      date: "Date",
      memo: "Description",
      amount: "Amount",
      transaction: "Type",
      name: "Payee",
    });
  });

  it("maps quoted export headers", () => {
    const headers = [
      "Transaction Date",
      "Memo",
      "Amount",
      "Merchant Name",
      "Category",
    ];

    expect(suggestColumnMapping(headers)).toEqual({
      date: "Transaction Date",
      memo: "Memo",
      amount: "Amount",
      name: "Merchant Name",
      transaction: "Category",
    });
  });

  it("does not assign the same header twice", () => {
    const headers = ["Date", "Posted Date", "Amount", "Total Amount"];

    const mapping = suggestColumnMapping(headers);

    expect(mapping.date).toBe("Date");
    expect(mapping.amount).toBe("Amount");
    expect(mapping).not.toHaveProperty("memo");
  });

  it("detects separate debit and credit columns", () => {
    const headers = ["Date", "Description", "Debit", "Credit"];

    expect(suggestColumnMapping(headers)).toEqual({
      date: "Date",
      memo: "Description",
      debit: "Debit",
      credit: "Credit",
      amountMode: "debit_credit",
    });
  });
});