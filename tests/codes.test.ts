import { describe, expect, it } from "vitest";

import { formatOrderCode, generateOrderToken, generateTableCode, orderCodeLetter } from "@/lib/codes";

describe("table codes", () => {
  it("contains no ambiguous glyphs", () => {
    // No i/l/1, no o/0 — someone reads these off a smudged sticker.
    for (let i = 0; i < 200; i += 1) {
      expect(generateTableCode()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
    }
  });

  it("is not sequential or predictable", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateTableCode()));
    // 500 draws from ~31^6 should essentially never collide; a generator that
    // counted, or one seeded identically each call, would fail here loudly.
    expect(codes.size).toBe(500);
  });

  it("uses the whole alphabet rather than favouring its start", () => {
    // Rejection sampling exists so `byte % 31` does not over-represent the
    // first few letters. Every symbol should show up across enough draws.
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      for (const char of generateTableCode()) seen.add(char);
    }
    expect(seen.size).toBe(31);
  });
});

describe("order tokens", () => {
  it("is long enough to be unguessable and URL-safe", () => {
    const token = generateOrderToken();
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateOrderToken()));
    expect(tokens.size).toBe(1000);
  });
});

describe("order code letters", () => {
  it("advances by one letter per day", () => {
    expect(orderCodeLetter("2026-08-02")).not.toBe(orderCodeLetter("2026-08-01"));
  });

  it("is stable for a given day", () => {
    expect(orderCodeLetter("2026-08-01")).toBe(orderCodeLetter("2026-08-01"));
  });

  it("wraps through the alphabet over 26 days", () => {
    const start = orderCodeLetter("2026-08-01");
    expect(orderCodeLetter("2026-08-27")).toBe(start);
  });

  it("is always A–Z", () => {
    for (let day = 1; day <= 28; day += 1) {
      const key = `2026-02-${String(day).padStart(2, "0")}`;
      expect(orderCodeLetter(key)).toMatch(/^[A-Z]$/);
    }
  });
});

describe("order code formatting", () => {
  it("pads to the familiar two digits", () => {
    expect(formatOrderCode("A", 1)).toBe("A01");
    expect(formatOrderCode("A", 42)).toBe("A42");
  });

  it("widens rather than wrapping on a very busy day", () => {
    // Two live orders both called A01 would be worse than a three-digit code.
    expect(formatOrderCode("A", 100)).toBe("A100");
  });
});
