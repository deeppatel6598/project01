import { generateId, generateTableCode } from "./codes";
import { getDb, type DB } from "./db";
import { toDiningTable, toInt, type DiningTableRow } from "./db/rows";
import type { DiningTable } from "./types";

/**
 * Tables — the physical ones with chairs, resolved from the code in a QR
 * sticker.
 */

export function listTables(restaurantId: string, db: DB = getDb()): DiningTable[] {
  return db
    .prepare<[string], DiningTableRow>(
      "SELECT * FROM dining_tables WHERE restaurant_id = ? ORDER BY label",
    )
    .all(restaurantId)
    .map(toDiningTable);
}

/**
 * Resolve a scanned code.
 *
 * Returns inactive tables too — the caller needs to tell "this QR was
 * retired" apart from "this QR was never linked", and both deserve a real
 * dead-end page rather than a framework 404.
 */
export function findTableByCode(code: string, db: DB = getDb()): DiningTable | null {
  const row = db
    .prepare<[string], DiningTableRow>("SELECT * FROM dining_tables WHERE code = ?")
    .get(code.trim().toLowerCase());
  return row ? toDiningTable(row) : null;
}

export function findTableById(id: string, db: DB = getDb()): DiningTable | null {
  const row = db
    .prepare<[string], DiningTableRow>("SELECT * FROM dining_tables WHERE id = ?")
    .get(id);
  return row ? toDiningTable(row) : null;
}

/**
 * Create a table with a fresh random code.
 *
 * The retry loop covers the birthday case: `code` is unique in the schema, so
 * a collision is a constraint error rather than a silent overwrite, and one
 * more draw settles it.
 */
export function createTable(
  restaurantId: string,
  label: string,
  seats: number | null = null,
  db: DB = getDb(),
): DiningTable {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTableCode();
    const existing = db.prepare("SELECT 1 FROM dining_tables WHERE code = ?").get(code);
    if (existing) continue;

    const table: DiningTable = {
      id: generateId(),
      restaurantId,
      label: label.trim().slice(0, 40),
      code,
      seats,
      isActive: true,
    };

    db.prepare(
      `INSERT INTO dining_tables (id, restaurant_id, label, code, seats, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run(table.id, table.restaurantId, table.label, table.code, table.seats, Date.now());

    return table;
  }

  throw new Error("Could not allocate a unique table code after 5 attempts");
}

export function updateTable(
  id: string,
  patch: Partial<Pick<DiningTable, "label" | "seats" | "isActive">>,
  db: DB = getDb(),
): void {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.label !== undefined) {
    sets.push("label = ?");
    values.push(patch.label.trim().slice(0, 40));
  }
  if (patch.seats !== undefined) {
    sets.push("seats = ?");
    values.push(patch.seats);
  }
  if (patch.isActive !== undefined) {
    sets.push("is_active = ?");
    values.push(toInt(patch.isActive));
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE dining_tables SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/**
 * Rotate a table's code — the fix for a sticker that leaked, was photographed
 * and posted, or got moved to another table. The old URL dead-ends
 * immediately.
 */
export function rotateTableCode(id: string, db: DB = getDb()): string {
  const code = generateTableCode();
  db.prepare("UPDATE dining_tables SET code = ? WHERE id = ?").run(code, id);
  return code;
}

/** The URL that goes into the QR image. */
export function tableUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/t/${code}`;
}
