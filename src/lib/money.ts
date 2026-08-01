/**
 * Money.
 *
 * Every amount in this system is an integer count of paise. Nothing is ever
 * a float: `0.1 + 0.2` is the oldest bug in billing software, and a cafe
 * totalling sixteen line items has plenty of chances to hit it.
 *
 * The owner-facing brief asks for prices "in rupees, not paise — keep it
 * readable for the owner". That is a presentation requirement, and it is met
 * by `formatINR` and by the admin's rupee-denominated inputs; the storage
 * layer stays in integers. See `docs/DATA-MODEL.md`.
 */

/** An integer count of paise. 1 rupee = 100 paise. */
export type Paise = number;

export const PAISE_PER_RUPEE = 100;

/** Largest amount we will accept anywhere — ₹10,00,000. Guards overflow and
 *  absurd input long before it reaches the database. */
export const MAX_PAISE = 100_000_000;

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new RangeError(`Not a finite rupee amount: ${rupees}`);
  }
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function paiseToRupees(paise: Paise): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Format for display: `₹260`, `₹1,250`, `₹99.50`.
 *
 * Uses the Indian digit grouping (2,2,3 — so 12,34,567 not 1,234,567),
 * because the owner and every guest reads amounts that way. Paise are shown
 * only when they are non-zero; a menu of whole-rupee prices should not be
 * littered with `.00`.
 */
export function formatINR(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;

  const grouped = rupees.toLocaleString("en-IN");
  const body = remainder === 0 ? grouped : `${grouped}.${String(remainder).padStart(2, "0")}`;

  return `${negative ? "-" : ""}₹${body}`;
}

/** Sum line totals without ever leaving integer space. */
export function sumPaise(amounts: readonly Paise[]): Paise {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Parse a rupee amount typed by the owner in the admin — "260", "₹260",
 * "1,250.50". Returns null on anything it cannot read, so callers surface a
 * field error rather than silently storing a zero.
 */
export function parseRupeeInput(raw: string): Paise | null {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const paise = rupeesToPaise(Number(cleaned));
  if (paise < 0 || paise > MAX_PAISE) return null;
  return paise;
}
