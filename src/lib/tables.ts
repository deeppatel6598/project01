import { generateId, generateTableCode } from "./codes";
import { getDb, type DB } from "./db";
import { toDiningTable, type DiningTableRow } from "./db/rows";
import type { DiningTable } from "./types";

/**
 * Tables — the physical ones with chairs, resolved from the code in a QR
 * sticker.
 */

export async function listTables(restaurantId: string, sql: DB = getDb()): Promise<DiningTable[]> {
  const rows = await sql<DiningTableRow[]>`
    SELECT * FROM dining_tables WHERE restaurant_id = ${restaurantId} ORDER BY label
  `;
  return rows.map(toDiningTable);
}

/**
 * Resolve a scanned code.
 *
 * Returns inactive tables too — the caller needs to tell "this QR was retired"
 * apart from "this QR was never linked", and both deserve a real dead-end page
 * rather than a framework 404.
 */
export async function findTableByCode(
  code: string,
  sql: DB = getDb(),
): Promise<DiningTable | null> {
  const rows = await sql<DiningTableRow[]>`
    SELECT * FROM dining_tables WHERE code = ${code.trim().toLowerCase()}
  `;
  return rows.length > 0 ? toDiningTable(rows[0]!) : null;
}

export async function findTableById(id: string, sql: DB = getDb()): Promise<DiningTable | null> {
  const rows = await sql<DiningTableRow[]>`SELECT * FROM dining_tables WHERE id = ${id}`;
  return rows.length > 0 ? toDiningTable(rows[0]!) : null;
}

/**
 * Create a table with a fresh random code.
 *
 * The retry loop covers the birthday case: `code` is unique in the schema, so
 * a collision is a constraint error rather than a silent overwrite, and one
 * more draw settles it.
 */
export async function createTable(
  restaurantId: string,
  label: string,
  seats: number | null = null,
  sql: DB = getDb(),
): Promise<DiningTable> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateTableCode();

    const existing = await sql`SELECT 1 FROM dining_tables WHERE code = ${code}`;
    if (existing.length > 0) continue;

    const table: DiningTable = {
      id: generateId(),
      restaurantId,
      label: label.trim().slice(0, 40),
      code,
      seats,
      isActive: true,
    };

    await sql`
      INSERT INTO dining_tables (id, restaurant_id, label, code, seats, is_active)
      VALUES (${table.id}, ${table.restaurantId}, ${table.label}, ${table.code},
              ${table.seats}, true)
    `;

    return table;
  }

  throw new Error("Could not allocate a unique table code after 5 attempts");
}

export async function updateTable(
  id: string,
  patch: Partial<Pick<DiningTable, "label" | "seats" | "isActive">>,
  sql: DB = getDb(),
): Promise<void> {
  const columns: Record<string, string | number | boolean | null> = {};
  if (patch.label !== undefined) columns.label = patch.label.trim().slice(0, 40);
  if (patch.seats !== undefined) columns.seats = patch.seats;
  if (patch.isActive !== undefined) columns.is_active = patch.isActive;

  if (Object.keys(columns).length === 0) return;

  await sql`UPDATE dining_tables SET ${sql(columns)} WHERE id = ${id}`;
}

/**
 * Rotate a table's code — the fix for a sticker that leaked, was photographed
 * and posted, or got moved to another table. The old URL dead-ends
 * immediately.
 */
export async function rotateTableCode(id: string, sql: DB = getDb()): Promise<string> {
  const code = generateTableCode();
  await sql`UPDATE dining_tables SET code = ${code} WHERE id = ${id}`;
  return code;
}

/** The URL that goes into the QR image. */
export function tableUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/t/${code}`;
}
