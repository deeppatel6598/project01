import { createTestDb, type DB } from "@/lib/db";
import { getGuestMenu, getRestaurant } from "@/lib/menu";
import { seed } from "@/lib/seed";
import type { MenuItem, Restaurant } from "@/lib/types";

/**
 * A fresh in-memory database seeded with the pilot data, per test.
 *
 * Every suite gets its own — SQLite's `:memory:` is scoped to the connection,
 * so tests cannot leak state into each other however they are ordered or
 * parallelised.
 */
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

export function makeFixture(): Fixture {
  const db = createTestDb();
  const result = seed({}, db);

  const restaurant = getRestaurant(db);
  const items = getGuestMenu(restaurant.id, db).flatMap((section) => section.items);

  const soldOutRow = db
    .prepare<[], { id: string }>("SELECT id FROM menu_items WHERE is_available = 0 LIMIT 1")
    .get();

  const soldOutItem = db
    .prepare<[string], { id: string; name: string; price: number }>(
      "SELECT id, name, price FROM menu_items WHERE id = ?",
    )
    .get(soldOutRow!.id)!;

  return {
    db,
    restaurant,
    tableCodes: result.tables.map((table) => table.code),
    items,
    item: items[0]!,
    soldOutItem: soldOutItem as unknown as MenuItem,
  };
}
