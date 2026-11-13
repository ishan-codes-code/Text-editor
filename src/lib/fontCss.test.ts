import { describe, expect, it } from "vitest";
import { fontFamilyWithFallback, quoteFontFamily } from "./fontCss";

describe("font-family CSS quoting", () => {
  it("quotes plain names", () => {
    expect(quoteFontFamily("TestFont")).toBe('"TestFont"');
    expect(quoteFontFamily("Kruti Dev")).toBe('"Kruti Dev"');
  });

  it("quotes names with digits that are invalid bare", () => {
    expect(quoteFontFamily("Kruti Dev 010")).toBe('"Kruti Dev 010"');
    expect(quoteFontFamily("Test 010")).toBe('"Test 010"');
  });

  it("is idempotent and strips pasted quotes", () => {
    expect(quoteFontFamily('"TestFont"')).toBe('"TestFont"');
    expect(quoteFontFamily("'TestFont'")).toBe('"TestFont"');
    expect(quoteFontFamily(quoteFontFamily("Test 010"))).toBe('"Test 010"');
  });

  it("escapes backslashes and double quotes", () => {
    expect(quoteFontFamily('a"b')).toBe('"a\\"b"');
    expect(quoteFontFamily("a\\b")).toBe('"a\\\\b"');
  });

  it("appends a fallback for preview stacks", () => {
    expect(fontFamilyWithFallback("Test 010")).toBe('"Test 010", sans-serif');
  });
});
