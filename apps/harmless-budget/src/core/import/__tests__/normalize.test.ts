import { describe, expect, it } from "vitest";
import { normalizeMemo, parseAmountToCents, parseDate } from "../normalize";

describe("parseAmountToCents", () => {
  it("parses plain dollar amounts", () => {
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
    expect(parseAmountToCents("45.67")).toBe(4567);
  });

  it("parses parenthetical negatives", () => {
    expect(parseAmountToCents("($1,234.56)")).toBe(-123456);
    expect(parseAmountToCents("(45.67)")).toBe(-4567);
  });

  it("parses explicit negatives with commas", () => {
    expect(parseAmountToCents("-1,234.56")).toBe(-123456);
    expect(parseAmountToCents("-45.67")).toBe(-4567);
  });

  it("returns null for invalid values", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("not-a-number")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses ISO dates", () => {
    expect(parseDate("2024-01-15")).toBe("2024-01-15");
  });

  it("parses US-style dates", () => {
    expect(parseDate("01/15/2024")).toBe("2024-01-15");
  });

  it("respects format hints", () => {
    expect(parseDate("01/02/2024", "mdy")).toBe("2024-01-02");
    expect(parseDate("01/02/2024", "dmy")).toBe("2024-02-01");
  });

  it("returns null for invalid dates", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("99/99/9999")).toBeNull();
  });
});

describe("normalizeMemo", () => {
  it("trims and lowercases memo text", () => {
    expect(normalizeMemo("  Starbucks Coffee  ")).toBe("starbucks coffee");
    expect(normalizeMemo(null)).toBe("");
  });
});