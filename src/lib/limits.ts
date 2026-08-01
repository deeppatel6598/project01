/**
 * Order limits.
 *
 * These live in their own module because both sides need them: the order
 * engine enforces them, and the browser's basket applies the same clamp so
 * the UI never shows a quantity the server would silently reduce.
 *
 * Keeping them here — with no database import — is what lets a client
 * component reach for them without dragging `better-sqlite3` into the browser
 * bundle. The server-side enforcement in `lib/orders.ts` remains the only one
 * that counts; this is shared *values*, not shared trust.
 */
export const LIMITS = {
  /** Per line. Clamped, not rejected — a fat-fingered 200 becomes 20. */
  minQty: 1,
  maxQty: 20,
  /** Distinct lines in one order. */
  maxLines: 30,
  guestNameChars: 40,
  noteChars: 200,
  /** Rate limit: this many placements per table per window. */
  rateLimitCount: 5,
  rateLimitWindowMs: 2 * 60 * 1000,
} as const;
