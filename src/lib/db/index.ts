import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

/**
 * The database connection.
 *
 * One process, one handle, WAL journaling. `better-sqlite3` is synchronous by
 * design, which is exactly what this workload wants: every query here is a
 * single-digit-millisecond read against a database that fits in page cache,
 * and the synchronous API lets `placeOrder` run inside a real transaction
 * without the interleaving hazards an async driver would introduce.
 */

export type DB = Database.Database;

const DEFAULT_DB_PATH = "data/tablekit.db";

declare global {
  // Next's dev server re-evaluates modules on every edit. Without a handle
  // parked on globalThis, each reload would open another connection and leak
  // file descriptors until the process fell over.
  var __tablekitDb: DB | undefined;
}

function openDatabase(): DB {
  const file = process.env.TABLEKIT_DB_PATH ?? DEFAULT_DB_PATH;

  // `:memory:` is how the test suite gets a throwaway database.
  if (file !== ":memory:") {
    // Built at call time from `process.cwd()`. Turbopack's tracer treats a
    // module-scope `path.resolve` on a configurable value as a signal to trace
    // the entire project into the server bundle, so the directory work stays
    // inside this function and off the module's static import graph.
    const directory = path.dirname(
      path.isAbsolute(file) ? file : path.join(/* turbopackIgnore: true */ process.cwd(), file),
    );
    mkdirSync(directory, { recursive: true });
  }

  const db = new Database(file);

  // WAL lets the kitchen board read while a guest is mid-placement instead of
  // blocking on the writer's lock.
  db.pragma("journal_mode = WAL");
  // NORMAL is the right durability trade for WAL: safe across process crashes,
  // and it does not fsync on every single commit.
  db.pragma("synchronous = NORMAL");
  // SQLite honours foreign keys only when asked to, per connection.
  db.pragma("foreign_keys = ON");
  // Wait rather than throw if a write lock is briefly held.
  db.pragma("busy_timeout = 5000");

  migrate(db);
  return db;
}

/**
 * Bring a database up to the current schema.
 *
 * `user_version` is SQLite's built-in schema-version counter — a plain
 * integer in the file header, which means the version travels with the
 * database rather than with a separate bookkeeping table.
 */
export function migrate(db: DB): void {
  const current = Number(db.pragma("user_version", { simple: true }));
  if (current >= SCHEMA_VERSION) return;

  db.exec("BEGIN");
  try {
    db.exec(SCHEMA_SQL);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getDb(): DB {
  if (!globalThis.__tablekitDb) {
    globalThis.__tablekitDb = openDatabase();
  }
  return globalThis.__tablekitDb;
}

/** Open an isolated in-memory database. Used by the test suite. */
export function createTestDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
