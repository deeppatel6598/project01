import postgres from "postgres";

import { RLS_SQL, SCHEMA_SQL } from "./schema";

/**
 * The database connection.
 *
 * Postgres, reached through the `postgres` package. Two settings matter for
 * running on serverless functions, where every invocation may be a cold
 * process and connections are precious:
 *
 *   * **`prepare: false`** — Supabase's transaction pooler (Supavisor, port
 *     6543) multiplexes many clients onto few server connections, so a named
 *     prepared statement created on one invocation will not exist on the next.
 *     Disabling them is required, not an optimisation.
 *   * **`max: 1`** — a function instance handles one request at a time. A pool
 *     of ten here just multiplies idle connections across instances until the
 *     database refuses new ones.
 *
 * On a long-lived server (`npm start`, a container) both are harmless, so one
 * configuration serves both deployment shapes.
 */

export type DB = postgres.Sql;

declare global {
  // Next's dev server re-evaluates modules on every edit. Without a handle
  // parked on globalThis, each reload would open another pool and leak
  // connections until the database started refusing them.
  var __tablekitSql: DB | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy Supabase → Project Settings → Database → " +
        "Connection string → Transaction pooler (port 6543) into your environment. " +
        "See docs/DEPLOYMENT.md.",
    );
  }

  // The single most common way this deployment breaks.
  //
  // Supabase offers three connection strings and only one of them works from
  // a serverless function:
  //
  //   * **Direct** (`db.<ref>.supabase.co:5432`) — IPv6-only, and holds a
  //     full session per connection. Netlify Functions are IPv4, so this does
  //     not merely run out of connections, it cannot resolve at all. The
  //     symptom is `ENETUNREACH` or a connect timeout on every request.
  //   * **Session pooler** (port 5432 via `pooler.supabase.com`) — IPv4, but
  //     still one server connection held per client for its whole life. A
  //     burst of cold starts exhausts the pool.
  //   * **Transaction pooler** (port 6543) — a server connection is borrowed
  //     per statement and returned. This is the one built for serverless.
  //
  // Failing loudly here beats a site that half-works and times out under
  // load, which is far harder to diagnose from a deploy log.
  if (process.env.NETLIFY === "true" || process.env.VERCEL === "1") {
    if (/db\.[a-z0-9]+\.supabase\.co/.test(url)) {
      throw new Error(
        "DATABASE_URL points at Supabase's direct connection, which is IPv6-only " +
          "and cannot be reached from a serverless function. Use the " +
          "Transaction pooler string (host ends in .pooler.supabase.com, port 6543): " +
          "Supabase → Project Settings → Database → Connection string → Transaction pooler.",
      );
    }
    if (url.includes("pooler.supabase.com") && !url.includes(":6543")) {
      throw new Error(
        "DATABASE_URL uses Supabase's session pooler (port 5432). Serverless needs the " +
          "transaction pooler on port 6543, which returns a connection after every " +
          "statement instead of holding one per function instance.",
      );
    }
  }

  return url;
}

export function getDb(): DB {
  if (!globalThis.__tablekitSql) {
    globalThis.__tablekitSql = postgres(connectionString(), {
      prepare: false,
      max: 1,
      // A cold function waiting 30s on a paused database is a timed-out
      // request; fail fast enough to surface a real error instead.
      connect_timeout: 15,
      idle_timeout: 20,
      // Supabase terminates TLS at the pooler with its own certificate chain.
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
      onnotice: () => {},
    });
  }
  return globalThis.__tablekitSql;
}

/**
 * Create the schema if it is not already there.
 *
 * Idempotent — every statement is `IF NOT EXISTS` — so it is safe to call
 * against a live database. Used by `npm run seed` and by the test harness;
 * production schema changes should go through `supabase/migrations/`.
 */
export async function migrate(sql: DB = getDb(), withRls = false): Promise<void> {
  await sql.unsafe(SCHEMA_SQL);
  if (withRls) await sql.unsafe(RLS_SQL);
}

/** Open a throwaway connection to a named database. Used by the test suite. */
export function createTestDb(url: string): DB {
  return postgres(url, { prepare: false, max: 1, ssl: false, onnotice: () => {} });
}
