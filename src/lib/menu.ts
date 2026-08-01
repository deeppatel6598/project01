import { getDb, type DB } from "./db";
import {
  toCategory,
  toInt,
  toMenuItem,
  toRestaurant,
  type CategoryRow,
  type MenuItemRow,
  type RestaurantRow,
} from "./db/rows";
import type { Category, MenuItem, MenuSection, Restaurant } from "./types";

/**
 * Menu reads.
 *
 * The menu is public and identical for every guest, which is what lets
 * `/t/[code]` stay a server component and render on first paint. Nothing in
 * here is guest-specific, so nothing in here needs a token.
 */

export function getRestaurant(db: DB = getDb()): Restaurant {
  const row = db
    .prepare<[], RestaurantRow>("SELECT * FROM restaurants ORDER BY created_at LIMIT 1")
    .get();

  if (!row) {
    throw new Error(
      "No restaurant row found. Run `npm run seed` to create the Roast & Toast pilot data.",
    );
  }
  return toRestaurant(row);
}

export function updateRestaurant(
  restaurantId: string,
  patch: Partial<Pick<Restaurant, "name" | "address" | "phone" | "hoursLabel" | "isAcceptingOrders">>,
  db: DB = getDb(),
): void {
  const sets: string[] = [];
  const values: Array<string | number> = [];

  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.address !== undefined) {
    sets.push("address = ?");
    values.push(patch.address);
  }
  if (patch.phone !== undefined) {
    sets.push("phone = ?");
    values.push(patch.phone);
  }
  if (patch.hoursLabel !== undefined) {
    sets.push("hours_label = ?");
    values.push(patch.hoursLabel);
  }
  if (patch.isAcceptingOrders !== undefined) {
    sets.push("is_accepting_orders = ?");
    values.push(toInt(patch.isAcceptingOrders));
  }

  if (sets.length === 0) return;

  values.push(restaurantId);
  db.prepare(`UPDATE restaurants SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/**
 * The guest menu: active categories, available items, in sort order.
 *
 * Sold-out items are filtered out here rather than rendered greyed, so the
 * owner's availability toggle takes effect on the next load — which is the
 * acceptance criterion. The design's dimmed "Sold out" row still has a job:
 * it covers the case where an item sells out while a guest already has the
 * page open and the item sitting in their basket.
 */
export function getGuestMenu(restaurantId: string, db: DB = getDb()): MenuSection[] {
  const categories = db
    .prepare<[string], CategoryRow>(
      "SELECT * FROM categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY sort_order, name",
    )
    .all(restaurantId)
    .map(toCategory);

  const items = db
    .prepare<[string], MenuItemRow>(
      `SELECT * FROM menu_items
       WHERE restaurant_id = ? AND is_available = 1
       ORDER BY sort_order, name`,
    )
    .all(restaurantId)
    .map(toMenuItem);

  const byCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.categoryId);
    if (bucket) bucket.push(item);
    else byCategory.set(item.categoryId, [item]);
  }

  return categories
    .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }))
    .filter((section) => section.items.length > 0);
}

/** The admin menu: everything, including inactive and sold-out rows. */
export function getFullMenu(restaurantId: string, db: DB = getDb()): MenuSection[] {
  const categories = db
    .prepare<[string], CategoryRow>(
      "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, name",
    )
    .all(restaurantId)
    .map(toCategory);

  const items = db
    .prepare<[string], MenuItemRow>(
      "SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY sort_order, name",
    )
    .all(restaurantId)
    .map(toMenuItem);

  return categories.map((category) => ({
    category,
    items: items.filter((item) => item.categoryId === category.id),
  }));
}

export function getMenuItem(id: string, db: DB = getDb()): MenuItem | null {
  const row = db.prepare<[string], MenuItemRow>("SELECT * FROM menu_items WHERE id = ?").get(id);
  return row ? toMenuItem(row) : null;
}

export function setItemAvailability(id: string, isAvailable: boolean, db: DB = getDb()): void {
  db.prepare("UPDATE menu_items SET is_available = ? WHERE id = ?").run(toInt(isAvailable), id);
}

export function updateMenuItem(
  id: string,
  patch: Partial<Pick<MenuItem, "name" | "description" | "price" | "isVeg" | "isAvailable" | "badge">>,
  db: DB = getDb(),
): void {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    values.push(patch.description);
  }
  if (patch.price !== undefined) {
    sets.push("price = ?");
    values.push(patch.price);
  }
  if (patch.badge !== undefined) {
    sets.push("badge = ?");
    values.push(patch.badge);
  }
  if (patch.isVeg !== undefined) {
    sets.push("is_veg = ?");
    values.push(toInt(patch.isVeg));
  }
  if (patch.isAvailable !== undefined) {
    sets.push("is_available = ?");
    values.push(toInt(patch.isAvailable));
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE menu_items SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function listCategories(restaurantId: string, db: DB = getDb()): Category[] {
  return db
    .prepare<[string], CategoryRow>(
      "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, name",
    )
    .all(restaurantId)
    .map(toCategory);
}
