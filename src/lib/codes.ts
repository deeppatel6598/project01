import { randomBytes, randomUUID } from "node:crypto";

/**
 * Short codes: the ones printed on QR stickers and the ones shouted across a
 * noisy room. Different jobs, different alphabets.
 */

/**
 * The QR alphabet, with every ambiguous glyph removed: no `i`/`l`/`1`,
 * no `o`/`0`. A guest reading a smudged sticker aloud to the counter should
 * not have to guess.
 */
const TABLE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TABLE_CODE_LENGTH = 6;

/**
 * Generate a table code.
 *
 * This must be random, never sequential. If the URL were `/t/4`, a bored
 * guest types `/t/9` and sends dockets to someone else's table. Six chars of
 * this alphabet is ~30 bits — far beyond guessing for a room of twelve
 * tables, and the rate limiter catches anyone who tries.
 *
 * Rejection sampling keeps the distribution flat: taking `byte % 31` would
 * quietly favour the first few letters of the alphabet.
 */
export function generateTableCode(length = TABLE_CODE_LENGTH): string {
  const alphabet = TABLE_CODE_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let out = "";

  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue; // biased tail — draw again
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }

  return out;
}

/**
 * A per-order secret, handed to the guest who placed it and to nobody else.
 *
 * The original brief skipped the guest order-status screen precisely because
 * it "would need a per-order secret token in the URL". The design ships that
 * screen, so the token exists — it is held in `sessionStorage`, never in the
 * URL, and it is the only thing that makes an order readable to an anonymous
 * client. See `docs/SECURITY.md`.
 */
export function generateOrderToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateId(): string {
  return randomUUID();
}

/**
 * The human-sayable order code: a letter that rotates daily plus a counter —
 * `A01`, `A02`, … then `B01` tomorrow.
 *
 * Nobody shouts "order eight-four-two-a-f-nine" across a cafe, so the uuid
 * stays in the database. The letter is derived from the cafe-local day so it
 * advances on its own without a stored cursor, and the counter resets with
 * it.
 */
export function orderCodeLetter(dayKey: string): string {
  // Days since the epoch, computed from the cafe-local calendar date so it
  // steps exactly at local midnight.
  const days = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  return String.fromCharCode(65 + (((days % 26) + 26) % 26));
}

export function formatOrderCode(letter: string, sequence: number): string {
  // Past 99 in a single day the code widens rather than wrapping — a busy
  // Sunday should not produce two live orders both called A01.
  return `${letter}${String(sequence).padStart(2, "0")}`;
}
