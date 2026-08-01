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

export async function seed(options: SeedOptions = {}, sql: DB = getDb()): Promise<SeedResult> {
  const [existing] = await sql<{ id: string }[]>`SELECT id FROM restaurants LIMIT 1`;

  if (existing && !options.force) {
    const tables = await sql<{ label: string; code: string }[]>`
      SELECT label, code FROM dining_tables ORDER BY label
    `;
    const [count] = await sql<{ n: string }[]>`SELECT COUNT(*) AS n FROM menu_items`;

    return {
      restaurantId: existing.id,
      tables: [...tables],
      itemCount: Number(count?.n ?? 0),
      ownerEmail: null,
      skipped: true,
    };
  }

  if (existing && options.force) {
    // The schema cascades, but being explicit makes it obvious that a force
    // reset destroys order history.
    await sql`TRUNCATE order_items, orders, order_counters, guest_orders_log,
                       menu_items, categories, dining_tables, staff_members, restaurants
              RESTART IDENTITY CASCADE`;
  }

  const restaurantId = generateId();

  await sql`
    INSERT INTO restaurants (
      id, name, slug, address, phone, currency, hero_image_url, hours_label, is_accepting_orders
    ) VALUES (
      ${restaurantId}, ${SEED_RESTAURANT.name}, ${SEED_RESTAURANT.slug},
      ${SEED_RESTAURANT.address}, ${SEED_RESTAURANT.phone}, 'INR',
      ${
        SEED_RESTAURANT.heroImageId
          ? unsplashUrl(SEED_RESTAURANT.heroImageId, 900)
          : SEED_RESTAURANT.heroArt
      },
      ${SEED_RESTAURANT.hoursLabel}, true
    )
  `;

  let itemCount = 0;

  for (const [categoryIndex, category] of SEED_MENU.entries()) {
    const categoryId = generateId();

    await sql`
      INSERT INTO categories (id, restaurant_id, name, sort_order, is_active)
      VALUES (${categoryId}, ${restaurantId}, ${category.name}, ${categoryIndex}, true)
    `;

    const rows = category.items.map((item, itemIndex) => ({
      id: generateId(),
      restaurant_id: restaurantId,
      category_id: categoryId,
      name: item.name,
      description: item.description ?? null,
      price: rupeesToPaise(item.price),
      image_url: item.imageId ? unsplashUrl(item.imageId, 200) : category.art,
      badge: item.badge ?? null,
      is_veg: true,
      is_available: !item.soldOut,
      sort_order: itemIndex,
    }));

    await sql`INSERT INTO menu_items ${sql(rows)}`;
    itemCount += rows.length;
  }

  // Every table gets a random code — see `lib/codes.ts` for why they are not
  // `/t/1` through `/t/12`.
  const tables: Array<{ label: string; code: string }> = [];
  for (const label of SEED_TABLES) {
    const table = await createTable(restaurantId, label, null, sql);
    tables.push({ label: table.label, code: table.code });
  }

  const ownerEmail = options.ownerEmail ?? process.env.TABLEKIT_OWNER_EMAIL ?? null;
  const ownerPassword = options.ownerPassword ?? process.env.TABLEKIT_OWNER_PASSWORD ?? null;

  if (ownerEmail && ownerPassword) {
    await createStaffMember(restaurantId, ownerEmail, ownerPassword, "owner", sql);
  }

  return { restaurantId, tables, itemCount, ownerEmail, skipped: false };
}
