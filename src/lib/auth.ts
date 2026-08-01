import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import { generateId } from "./codes";
import { getDb, type DB } from "./db";
import { toStaffMember, type StaffMemberRow } from "./db/rows";
import type { StaffMember, StaffRole } from "./types";

/**
 * Staff authentication.
 *
 * Scope check first: this guards `/kitchen` and `/admin`. The guest surface
 * has no accounts and never will — a guest who has to sign in to order a
 * coffee is a guest who walks to the counter instead.
 *
 * Password hashing is scrypt from Node's standard library and sessions are
 * HMAC-signed cookies. Both are deliberate: this is a single-cafe pilot with
 * two or three staff logins, and a dependency-free implementation of two
 * well-understood primitives is easier to audit than a framework whose
 * defaults you have to go read. `docs/SECURITY.md` records what would change
 * before this served many tenants.
 */

const SESSION_COOKIE = "tablekit_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one long shift

const SCRYPT_KEYLEN = 64;
/** Node's defaults (N=16384, r=8, p=1) — ~100ms per hash on a modest box. */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function secret(): string {
  const value = process.env.TABLEKIT_SECRET;

  if (!value || value.length < 16) {
    // Refusing to boot beats silently signing sessions with a public string.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TABLEKIT_SECRET must be set to at least 16 characters in production. " +
          "Generate one with: openssl rand -base64 32",
      );
    }
    return "tablekit-dev-secret";
  }

  return value;
}

/* ── passwords ─────────────────────────────────────────────────────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltPart, hashPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;

  const expected = Buffer.from(hashPart, "base64url");
  const actual = scryptSync(
    password.normalize("NFKC"),
    Buffer.from(saltPart, "base64url"),
    expected.length,
    SCRYPT_PARAMS,
  );

  // Constant-time — a byte-by-byte `===` leaks the hash one comparison at a
  // time to anyone willing to measure.
  return timingSafeEqual(expected, actual);
}

/* ── sessions ──────────────────────────────────────────────────────────── */

export interface Session {
  staffId: string;
  restaurantId: string;
  role: StaffRole;
  expiresAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(token: string): Session | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (typeof session.expiresAt !== "number" || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createSession(staff: StaffMember): Promise<void> {
  const session: Session = {
    staffId: staff.id,
    restaurantId: staff.restaurantId,
    role: staff.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? decodeSession(token) : null;
}

/** Both roles reach `/kitchen`. */
export async function requireStaff(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError("unauthenticated");
  return session;
}

/** Only `owner` reaches `/admin`. */
export async function requireOwner(): Promise<Session> {
  const session = await requireStaff();
  if (session.role !== "owner") throw new AuthError("forbidden");
  return session;
}

export class AuthError extends Error {
  readonly code: "unauthenticated" | "forbidden";

  constructor(code: "unauthenticated" | "forbidden") {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}

/* ── staff records ─────────────────────────────────────────────────────── */

export async function findStaffByEmail(
  email: string,
  sql: DB = getDb(),
): Promise<StaffMemberRow | null> {
  const [row] = await sql<StaffMemberRow[]>`
    SELECT * FROM staff_members WHERE email = ${email.trim().toLowerCase()}
  `;
  return row ?? null;
}

/**
 * Verify an email and password.
 *
 * On an unknown email this still runs a scrypt hash against a throwaway
 * value. Returning early would make "no such user" measurably faster than
 * "wrong password", which is how you enumerate a staff list.
 */
export async function authenticate(
  email: string,
  password: string,
  sql: DB = getDb(),
): Promise<StaffMember | null> {
  const row = await findStaffByEmail(email, sql);

  if (!row) {
    verifyPassword(password, hashPassword("timing-equalizer"));
    return null;
  }

  return verifyPassword(password, row.password_hash) ? toStaffMember(row) : null;
}

export async function createStaffMember(
  restaurantId: string,
  email: string,
  password: string,
  role: StaffRole,
  sql: DB = getDb(),
): Promise<StaffMember> {
  const staff = {
    id: generateId(),
    restaurantId,
    email: email.trim().toLowerCase(),
    role,
  };

  await sql`
    INSERT INTO staff_members (id, restaurant_id, email, password_hash, role)
    VALUES (${staff.id}, ${staff.restaurantId}, ${staff.email},
            ${hashPassword(password)}, ${staff.role})
  `;

  return staff;
}
