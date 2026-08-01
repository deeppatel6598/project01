/**
 * Time helpers.
 *
 * Timestamps cross the wire as epoch milliseconds — an integer both the
 * SQLite layer and the browser agree on without a parser in between. The
 * cafe runs in a single timezone, so wall-clock formatting is pinned to
 * Asia/Kolkata rather than the viewer's locale: the kitchen screen and the
 * owner's laptop must agree on what "today" means, even if someone opens the
 * admin from a different timezone.
 */

export const CAFE_TIMEZONE = "Asia/Kolkata";

/** How long a served docket stays on the pass before it clears itself. */
export const SERVED_VISIBLE_MS = 30 * 60 * 1000;

/** `07:32` — 24-hour, cafe-local. Used on dockets and order history. */
export function formatClock(epochMs: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CAFE_TIMEZONE,
  }).format(new Date(epochMs));
}

/** `01 Aug 2026` — used in order history and CSV exports. */
export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: CAFE_TIMEZONE,
  }).format(new Date(epochMs));
}

/**
 * `MM:SS` since the order was placed, the ticking number on every docket.
 * Clamped at zero so a clock skew between server and browser can never
 * render a negative timer.
 */
export function formatElapsed(sinceMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function minutesSince(sinceMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - sinceMs) / 60000);
}

/**
 * The cafe-local calendar day as `YYYY-MM-DD`.
 *
 * Order codes reset daily, so this is what the counter keys on. Deriving it
 * from the formatted parts rather than from a UTC offset keeps it correct
 * regardless of where the server runs.
 */
export function cafeDayKey(epochMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: CAFE_TIMEZONE,
  }).format(new Date(epochMs));
}

/**
 * Turn two `YYYY-MM-DD` day keys into an epoch-millisecond range covering
 * both days in full, cafe-local.
 *
 * The UTC offset is derived from the dates themselves rather than hard-coded,
 * so a range that straddles a rule change still covers exactly the days the
 * owner asked for. India has no DST today, but a report that quietly loses an
 * hour is the kind of bug nobody notices until it is in an accountant's
 * spreadsheet.
 */
export function dayRange(fromKey: string, toKey: string): { from: number; to: number } {
  const offsetMs = (dayKey: string): number => {
    const asUtc = Date.parse(`${dayKey}T00:00:00Z`);
    if (Number.isNaN(asUtc)) return 0;
    const local = new Date(
      new Date(asUtc).toLocaleString("en-US", { timeZone: CAFE_TIMEZONE }),
    ).getTime();
    return local - asUtc;
  };

  const startUtc = Date.parse(`${fromKey}T00:00:00Z`);
  const endUtc = Date.parse(`${toKey}T00:00:00Z`);

  // An unparseable date from a hand-edited URL falls back to "everything"
  // rather than an empty report that looks like a quiet day.
  if (Number.isNaN(startUtc) || Number.isNaN(endUtc)) {
    return { from: 0, to: Number.MAX_SAFE_INTEGER };
  }

  return {
    from: startUtc - offsetMs(fromKey),
    to: endUtc - offsetMs(toKey) + 24 * 60 * 60 * 1000 - 1,
  };
}
