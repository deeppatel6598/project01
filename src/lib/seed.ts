import { createStaffMember } from "./auth";
import { generateId } from "./codes";
import { getDb, type DB } from "./db";
import { rupeesToPaise } from "./money";
import { SEED_MENU, SEED_RESTAURANT, SEED_TABLES, unsplashUrl } from "./seed-data";
import { createTable } from "./tables";

/**
 * Seed the pilot data.
 *
 * Idempotent: if a restaurant row already exists the seed is a no-op, so
 * running it against a live database cannot duplicate the menu or hand out a
 * new set of table codes while the old QR stickers are still on the tables.
 * `--force` (via `npm run seed:reset`) is the deliberate way to start over.
 */

export interface SeedOptions {
  force?: boolean;
  ownerEmail?: string;
  ownerPassword?: string;
}

export interface SeedResult {
  restaurantId: string;
  tables: Array<{ label: string; code: string }>;
  itemCount: number;
  ownerEmail: string | null;
  skipped: boolean;
}

export function seed(options: SeedOptions = {}, db: DB = getDb()): SeedResult {
  const existing = db.prepare<[], { id: string }>("SELECT id FROM restaurants LIMIT 1").get();

  if (existing && !options.force) {
    const tables = db
      .prepare<[], { label: string; code: string }>(
        "SELECT label, code FROM dining_tables ORDER BY label",
      )
      .all();
    const count = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM menu_items").get();

    return {
      restaurantId: existing.id,
      tables,
      itemCount: count?.n ?? 0,
      ownerEmail: null,
      skipped: true,
    };
  }

  if (existing && options.force) {
    // Order matters only for readability — the schema cascades — but being
    // explicit makes it obvious that a force reset destroys order history.
    db.exec(`
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM order_counters;
      DELETE FROM guest_orders_log;
      DELETE FROM menu_items;
      DELETE FROM categories;
      DELETE FROM dining_tables;
      DELETE FROM staff_members;
      DELETE FROM restaurants;
    `);
  }

  const restaurantId = generateId();

  db.prepare(
    `INSERT INTO restaurants (
       id, name, slug, address, phone, currency, hero_image_url,
       hours_label, is_accepting_orders, created_at
     ) VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, 1, ?)`,
  ).run(
    restaurantId,
    SEED_RESTAURANT.name,
    SEED_RESTAURANT.slug,
    SEED_RESTAURANT.address,
    SEED_RESTAURANT.phone,
    SEED_RESTAURANT.heroImageId
      ? unsplashUrl(SEED_RESTAURANT.heroImageId, 900)
      : SEED_RESTAURANT.heroArt,
    SEED_RESTAURANT.hoursLabel,
    Date.now(),
  );

  const insertCategory = db.prepare(
    "INSERT INTO categories (id, restaurant_id, name, sort_order, is_active) VALUES (?, ?, ?, ?, 1)",
  );
  const insertItem = db.prepare(
    `INSERT INTO menu_items (
       id, restaurant_id, category_id, name, description, price,
       image_url, badge, is_veg, is_available, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  let itemCount = 0;

  SEED_MENU.forEach((category, categoryIndex) => {
    const categoryId = generateId();
    insertCategory.run(categoryId, restaurantId, category.name, categoryIndex);

    category.items.forEach((item, itemIndex) => {
      insertItem.run(
        generateId(),
        restaurantId,
        categoryId,
        item.name,
        item.description ?? null,
        rupeesToPaise(item.price),
        item.imageId ? unsplashUrl(item.imageId, 200) : category.art,
        item.badge ?? null,
        item.soldOut ? 0 : 1,
        itemIndex,
      );
      itemCount += 1;
    });
  });

  // Every table gets a random code — see `lib/codes.ts` for why they are not
  // `/t/1` through `/t/12`.
  const tables = SEED_TABLES.map((label) => {
    const table = createTable(restaurantId, label, null, db);
    return { label: table.label, code: table.code };
  });

  const ownerEmail = options.ownerEmail ?? process.env.TABLEKIT_OWNER_EMAIL ?? null;
  const ownerPassword = options.ownerPassword ?? process.env.TABLEKIT_OWNER_PASSWORD ?? null;

  if (ownerEmail && ownerPassword) {
    createStaffMember(restaurantId, ownerEmail, ownerPassword, "owner", db);
  }

  return { restaurantId, tables, itemCount, ownerEmail, skipped: false };
}
