import { describe, expect, it } from "vitest";

import { cafeDayKey, dayRange, formatElapsed, minutesSince } from "@/lib/time";

describe("formatElapsed", () => {
  it("counts up in MM:SS", () => {
    const start = 1_700_000_000_000;
    expect(formatElapsed(start, start)).toBe("00:00");
    expect(formatElapsed(start, start + 65_000)).toBe("01:05");
    expect(formatElapsed(start, start + 11 * 60_000)).toBe("11:00");
  });

  it("clamps at zero rather than showing a negative timer", () => {
    // Server and browser clocks disagree by a second or two all the time.
    const start = 1_700_000_000_000;
    expect(formatElapsed(start, start - 5_000)).toBe("00:00");
  });

  it("keeps counting past an hour rather than wrapping", () => {
    const start = 1_700_000_000_000;
    expect(formatElapsed(start, start + 90 * 60_000)).toBe("90:00");
  });
});

describe("minutesSince", () => {
  it("measures the late threshold the board colours on", () => {
    const start = 1_700_000_000_000;
    expect(minutesSince(start, start + 10 * 60_000)).toBe(10);
    expect(minutesSince(start, start - 60_000)).toBe(0);
  });
});

describe("cafeDayKey", () => {
  it("uses the cafe's timezone, not the server's", () => {
    // 2026-08-01T19:00Z is already 2026-08-02 in Asia/Kolkata (+05:30).
    expect(cafeDayKey(Date.parse("2026-08-01T19:00:00Z"))).toBe("2026-08-02");
    expect(cafeDayKey(Date.parse("2026-08-01T18:00:00Z"))).toBe("2026-08-01");
  });

  it("formats as YYYY-MM-DD", () => {
    expect(cafeDayKey(Date.parse("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });
});

describe("dayRange", () => {
  it("covers a single cafe-local day end to end", () => {
    const { from, to } = dayRange("2026-08-01", "2026-08-01");

    // Local midnight on 1 Aug is 18:30Z on 31 Jul.
    expect(new Date(from).toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(cafeDayKey(from)).toBe("2026-08-01");
    expect(cafeDayKey(to)).toBe("2026-08-01");
    expect(to - from).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("spans multiple days inclusively", () => {
    const { from, to } = dayRange("2026-08-01", "2026-08-03");
    expect(cafeDayKey(from)).toBe("2026-08-01");
    expect(cafeDayKey(to)).toBe("2026-08-03");
  });

  it("falls back to everything on an unparseable date", () => {
    // A hand-edited URL should not silently render an empty report that reads
    // like a quiet day.
    const { from, to } = dayRange("not-a-date", "2026-08-01");
    expect(from).toBe(0);
    expect(to).toBe(Number.MAX_SAFE_INTEGER);
  });
});
