import { describe, expect, it } from "vitest";
import { BANK_PRESETS, getBankPreset } from "../bank-presets";
import { applyBankPreset } from "../suggest-mapping";

describe("bank presets", () => {
  it("exposes all built-in presets", () => {
    expect(BANK_PRESETS.map((preset) => preset.id)).toEqual([
      "generic",
      "rbc",
      "td",
      "scotiabank",
      "tangerine",
      "amex",
    ]);
  });

  it("looks up presets by id", () => {
    expect(getBankPreset("td")?.name).toBe("TD Canada Trust");
    expect(getBankPreset("missing")).toBeUndefined();
  });

  it("uses heuristics for the generic preset", () => {
    const headers = ["Date", "Description", "Amount", "Type", "Payee"];

    expect(applyBankPreset(headers, "generic")).toEqual({
      date: "Date",
      memo: "Description",
      amount: "Amount",
      transaction: "Type",
      name: "Payee",
    });
  });

  it("maps RBC export headers", () => {
    const headers = [
      "Transaction Date",
      "Description 1",
      "Description 2",
      "CAD$",
      "USD$",
    ];

    expect(applyBankPreset(headers, "rbc")).toMatchObject({
      date: "Transaction Date",
      memo: "Description 1",
      name: "Description 2",
      amount: "CAD$",
      amountMode: "single",
    });
  });

  it("maps Scotiabank export headers", () => {
    const headers = ["Date", "Description", "Amount", "Balance"];

    expect(applyBankPreset(headers, "scotiabank")).toMatchObject({
      date: "Date",
      memo: "Description",
      amount: "Amount",
      amountMode: "single",
    });
  });

  it("maps Tangerine export headers", () => {
    const headers = ["Date", "Name", "Amount ($)", "Balance"];

    expect(applyBankPreset(headers, "tangerine")).toMatchObject({
      date: "Date",
      name: "Name",
      amount: "Amount ($)",
      amountMode: "single",
    });
  });

  it("maps American Express export headers", () => {
    const headers = ["Date", "Description", "Card Member", "Amount"];

    expect(applyBankPreset(headers, "amex")).toMatchObject({
      date: "Date",
      memo: "Description",
      amount: "Amount",
      amountMode: "single",
    });
  });

  it("falls back to heuristics for unknown preset ids", () => {
    const headers = ["Date", "Description", "Amount"];

    expect(applyBankPreset(headers, "unknown-bank")).toEqual({
      date: "Date",
      memo: "Description",
      amount: "Amount",
    });
  });
});