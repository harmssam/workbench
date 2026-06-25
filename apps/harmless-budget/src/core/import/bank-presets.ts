import type { BankPreset } from "../types";

/** Built-in bank CSV presets with expected header name hints. */
export const BANK_PRESETS: BankPreset[] = [
  {
    id: "generic",
    name: "Generic / Other",
    mapping: {},
  },
  {
    id: "rbc",
    name: "Royal Bank of Canada",
    mapping: {
      date: "Transaction Date",
      memo: "Description 1",
      name: "Description 2",
      amount: "CAD$",
      amountMode: "single",
    },
  },
  {
    id: "td",
    name: "TD Canada Trust",
    mapping: {
      date: "Date",
      memo: "Description",
      debit: "Debit",
      credit: "Credit",
      amountMode: "debit_credit",
    },
  },
  {
    id: "scotiabank",
    name: "Scotiabank",
    mapping: {
      date: "Date",
      memo: "Description",
      amount: "Amount",
      amountMode: "single",
    },
  },
  {
    id: "tangerine",
    name: "Tangerine",
    mapping: {
      date: "Date",
      name: "Name",
      amount: "Amount ($)",
      amountMode: "single",
    },
  },
  {
    id: "amex",
    name: "American Express",
    mapping: {
      date: "Date",
      memo: "Description",
      amount: "Amount",
      amountMode: "single",
    },
  },
];

export function getBankPreset(presetId: string): BankPreset | undefined {
  return BANK_PRESETS.find((preset) => preset.id === presetId);
}