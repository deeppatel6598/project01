import { describe, expect, it } from "vitest";

import {
  formatINR,
  MAX_PAISE,
  paiseToRupees,
  parseRupeeInput,
  rupeesToPaise,
  sumPaise,
} from "@/lib/money";

describe("formatINR", () => {
  it("uses Indian digit grouping, not thousands", () => {
    // The 2,2,3 grouping every guest and the owner reads: ₹1,23,45,678 —
    // not the ₹12,345,678 that a default `en-US` format would produce.
    expect(formatINR(1_23_45_678_00)).toBe("₹1,23,45,678");
    expect(formatINR(12_345_00)).toBe("₹12,345");
    expect(formatINR(1_00_000_00)).toBe("₹1,00,000");
  });

  it("omits paise when they are zero", () => {
    expect(formatINR(26_000)).toBe("₹260");
  });

  it("shows paise when they are not", () => {
    expect(formatINR(26_050)).toBe("₹260.50");
    expect(formatINR(26_005)).toBe("₹260.05");
  });

  it("handles zero and negatives", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(-5_000)).toBe("-₹50");
  });
});

describe("rupee/paise conversion", () => {
  it("round-trips whole rupees", () => {
    expect(paiseToRupees(rupeesToPaise(260))).toBe(260);
  });

  it("rounds rather than truncating fractional paise", () => {
    expect(rupeesToPaise(0.005)).toBe(1);
    expect(rupeesToPaise(0.004)).toBe(0);
  });

  it("rejects non-finite input instead of storing NaN", () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("sumPaise", () => {
  it("stays exact where floating-point rupees would not", () => {
    // 0.1 + 0.2 !== 0.3 in float. In integer paise it is simply 30.
    expect(sumPaise([10, 20])).toBe(30);
  });

  it("sums an empty list to zero", () => {
    expect(sumPaise([])).toBe(0);
  });

  it("totals a realistic order exactly", () => {
    const lines = [260_00 * 2, 320_00, 190_00 * 3];
    expect(sumPaise(lines)).toBe(1_410_00);
    expect(formatINR(sumPaise(lines))).toBe("₹1,410");
  });
});

describe("parseRupeeInput", () => {
  it("accepts what an owner actually types", () => {
    expect(parseRupeeInput("260")).toBe(26_000);
    expect(parseRupeeInput("₹260")).toBe(26_000);
    expect(parseRupeeInput("1,250.50")).toBe(1_25_050);
    expect(parseRupeeInput(" 260 ")).toBe(26_000);
  });

  it("rejects junk rather than silently storing zero", () => {
    for (const input of ["", "abc", "-50", "1.234", "12.3.4", "1e5"]) {
      expect(parseRupeeInput(input)).toBeNull();
    }
  });

  it("rejects an absurd amount", () => {
    expect(parseRupeeInput(String(MAX_PAISE))).toBeNull();
  });
});
