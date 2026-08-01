import { createTestDb, migrate, type DB } from "@/lib/db";
import { getGuestMenu, getRestaurant } from "@/lib/menu";
import { seed } from "@/lib/seed";
import type { MenuItem, Restaurant } from "@/lib/types";

/**
 * The test harness runs against a **real Postgres**, not a mock or an
 * in-memory shim.
 *
 * The order engine leans on things only a real server provides — transaction
 * rollback, `ON CONFLICT DO UPDATE` row locks, `ANY($1)` array binding, the
 * `RETURNING` clauses that make the status transitions race-safe. A fake would
 * pass while the production behaviour diverged, which is worse than no test.
 *
 * Point `TEST_DATABASE_URL` at any throwaway database:
 *
 *   docker run -e POSTGRES_HOST_AUTH_METHOD=trust -p 5433:5432 -d postgres:16
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres npm test
 */

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5433/tablekit";

let shared: DB | null = null;

/** One connection for the whole file; the schema is created once. */
export async function testDb(): Promise<DB> {
  if (!shared) {
    shared = createTestDb(TEST_URL);
    await migrate(shared);
  }
  return shared;
}

export async function closeTestDb(): Promise<void> {
  await shared?.end();
  shared = null;
}

export interface Fixture {
  db: DB;
  restaurant: Restaurant;
  /** Codes for the seeded tables, in label order. */
  tableCodes: string[];
  /** Every available menu item. */
  items: MenuItem[];
  /** An available item, for the common "order one thing" case. */
  item: MenuItem;
  /** The seeded sold-out item (Loaded Nachos). */
  soldOutItem: MenuItem;
}

/**
 * A clean, freshly seeded database.
 *
 * Truncating and re-seeding rather than creating a database per test: it is an
 * order of magnitude faster, and `RESTART IDENTITY CASCADE` leaves exactly the
 * same starting state, so tests still cannot leak into each other.
 */
export async function makeFixture(): Promise<Fixture> {
  const db = await testDb();

  await db`TRUNCATE order_items, orders, order_counters, guest_orders_log,
                    menu_items, categories, dining_tables, staff_members, restaurants
           RESTART IDENTITY CASCADE`;

  const result = await seed({}, db);
  const restaurant = await getRestaurant(db);
  const sections = await getGuestMenu(restaurant.id, db);
  const items = sections.flatMap((section) => section.items);

  const [soldOut] = await db<
    { id: string; name: string; price: number }[]
  >`SELECT id, name, price FROM menu_items WHERE is_available = false LIMIT 1`;

  return {
    db,
    restaurant,
    tableCodes: result.tables.map((table) => table.code),
    items,
    item: items[0]!,
    soldOutItem: soldOut as unknown as MenuItem,
  };
}
