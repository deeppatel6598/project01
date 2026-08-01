import { getDb, type DB } from "./db";
import {
  toCategory,
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

export async function getRestaurant(sql: DB = getDb()): Promise<Restaurant> {
  const rows = await sql<RestaurantRow[]>`
    SELECT * FROM restaurants ORDER BY created_at LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error(
      "No restaurant row found. Run `npm run seed` to create the Roast & Toast pilot data.",
    );
  }
  return toRestaurant(rows[0]!);
}

export async function updateRestaurant(
  restaurantId: string,
  patch: Partial<
    Pick<Restaurant, "name" | "address" | "phone" | "hoursLabel" | "isAcceptingOrders">
  >,
  sql: DB = getDb(),
): Promise<void> {
  // Only the keys actually present are written, so a partial patch cannot
  // blank a column the caller never mentioned.
  const columns: Record<string, string | boolean> = {};
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.address !== undefined) columns.address = patch.address;
  if (patch.phone !== undefined) columns.phone = patch.phone;
  if (patch.hoursLabel !== undefined) columns.hours_label = patch.hoursLabel;
  if (patch.isAcceptingOrders !== undefined) {
    columns.is_accepting_orders = patch.isAcceptingOrders;
  }

  if (Object.keys(columns).length === 0) return;

  await sql`UPDATE restaurants SET ${sql(columns)} WHERE id = ${restaurantId}`;
}

/**
 * The guest menu: active categories, available items, in sort order.
 *
 * Sold-out items are filtered out here rather than rendered greyed, so the
 * owner's availability toggle takes effect on the next load — which is the
 * acceptance criterion. The menu's dimmed "Sold out" state still has a job:
 * it covers an item selling out while a guest already has the page open with
 * it in their basket.
 */
export async function getGuestMenu(
  restaurantId: string,
  sql: DB = getDb(),
): Promise<MenuSection[]> {
  const [categoryRows, itemRows] = await Promise.all([
    sql<CategoryRow[]>`
      SELECT * FROM categories
      WHERE restaurant_id = ${restaurantId} AND is_active = true
      ORDER BY sort_order, name
    `,
    sql<MenuItemRow[]>`
      SELECT * FROM menu_items
      WHERE restaurant_id = ${restaurantId} AND is_available = true
      ORDER BY sort_order, name
    `,
  ]);

  const items = itemRows.map(toMenuItem);
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    const bucket = byCategory.get(item.categoryId);
    if (bucket) bucket.push(item);
    else byCategory.set(item.categoryId, [item]);
  }

  return categoryRows
    .map(toCategory)
    .map((category) => ({ category, items: byCategory.get(category.id) ?? [] }))
    .filter((section) => section.items.length > 0);
}

/** The admin menu: everything, including inactive and sold-out rows. */
export async function getFullMenu(
  restaurantId: string,
  sql: DB = getDb(),
): Promise<MenuSection[]> {
  const [categoryRows, itemRows] = await Promise.all([
    sql<CategoryRow[]>`
      SELECT * FROM categories WHERE restaurant_id = ${restaurantId} ORDER BY sort_order, name
    `,
    sql<MenuItemRow[]>`
      SELECT * FROM menu_items WHERE restaurant_id = ${restaurantId} ORDER BY sort_order, name
    `,
  ]);

  const items = itemRows.map(toMenuItem);

  return categoryRows.map(toCategory).map((category) => ({
    category,
    items: items.filter((item) => item.categoryId === category.id),
  }));
}

export async function getMenuItem(id: string, sql: DB = getDb()): Promise<MenuItem | null> {
  const rows = await sql<MenuItemRow[]>`SELECT * FROM menu_items WHERE id = ${id}`;
  return rows.length > 0 ? toMenuItem(rows[0]!) : null;
}

export async function setItemAvailability(
  id: string,
  isAvailable: boolean,
  sql: DB = getDb(),
): Promise<void> {
  await sql`UPDATE menu_items SET is_available = ${isAvailable} WHERE id = ${id}`;
}

export async function updateMenuItem(
  id: string,
  patch: Partial<
    Pick<MenuItem, "name" | "description" | "price" | "isVeg" | "isAvailable" | "badge">
  >,
  sql: DB = getDb(),
): Promise<void> {
  const columns: Record<string, string | number | boolean | null> = {};
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.description !== undefined) columns.description = patch.description;
  if (patch.price !== undefined) columns.price = patch.price;
  if (patch.badge !== undefined) columns.badge = patch.badge;
  if (patch.isVeg !== undefined) columns.is_veg = patch.isVeg;
  if (patch.isAvailable !== undefined) columns.is_available = patch.isAvailable;

  if (Object.keys(columns).length === 0) return;

  await sql`UPDATE menu_items SET ${sql(columns)} WHERE id = ${id}`;
}

export async function listCategories(
  restaurantId: string,
  sql: DB = getDb(),
): Promise<Category[]> {
  const rows = await sql<CategoryRow[]>`
    SELECT * FROM categories WHERE restaurant_id = ${restaurantId} ORDER BY sort_order, name
  `;
  return rows.map(toCategory);
}
