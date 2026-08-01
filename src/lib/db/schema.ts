/**
 * The schema, as one idempotent migration.
 *
 * Kept as a TypeScript string rather than a `.sql` file so it is bundled with
 * the server build instead of depending on a runtime file read that Next's
 * output tracing would have to be told about.
 *
 * The equivalent Postgres migration — same tables, same constraints, with RLS
 * policies and the `place_order` RPC — lives in
 * `supabase/migrations/0001_init.sql` for the hosted deployment target.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS restaurants (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  address             TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL DEFAULT '',
  currency            TEXT NOT NULL DEFAULT 'INR',
  logo_url            TEXT,
  hero_image_url      TEXT,
  hours_label         TEXT NOT NULL DEFAULT '11:00-23:00',
  is_accepting_orders INTEGER NOT NULL DEFAULT 1 CHECK (is_accepting_orders IN (0, 1)),
  created_at          INTEGER NOT NULL
);

-- Every row hangs off restaurant_id even though v1 is single-tenant, so
-- multi-tenancy is a migration later rather than a rewrite.
CREATE TABLE IF NOT EXISTS dining_tables (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  seats         INTEGER,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  -- Integer paise. SQLite has no exact decimal type, and money must never
  -- round-trip through a float.
  price         INTEGER NOT NULL CHECK (price >= 0),
  image_url     TEXT,
  badge         TEXT,
  is_veg        INTEGER NOT NULL DEFAULT 1 CHECK (is_veg IN (0, 1)),
  is_available  INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id      TEXT NOT NULL REFERENCES dining_tables(id),
  order_code    TEXT NOT NULL,
  guest_name    TEXT NOT NULL,
  guest_phone   TEXT,
  note          TEXT,
  status        TEXT NOT NULL CHECK (status IN ('new', 'preparing', 'served', 'cancelled')),
  subtotal      INTEGER NOT NULL CHECK (subtotal >= 0),
  -- Equal to subtotal in v1; the column exists so tax and charges do not need
  -- a migration on the orders table later.
  total         INTEGER NOT NULL CHECK (total >= 0),
  -- The per-order secret that lets the guest who placed it read it back.
  -- Held in sessionStorage, never put in a URL.
  public_token  TEXT NOT NULL UNIQUE,
  placed_at     INTEGER NOT NULL,
  accepted_at   INTEGER,
  served_at     INTEGER
);

CREATE TABLE IF NOT EXISTS order_items (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id       TEXT NOT NULL REFERENCES menu_items(id),
  name_snapshot      TEXT NOT NULL,
  price_snapshot     INTEGER NOT NULL CHECK (price_snapshot >= 0),
  image_url_snapshot TEXT,
  qty                INTEGER NOT NULL CHECK (qty > 0),
  line_total         INTEGER NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS staff_members (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at    INTEGER NOT NULL
);

-- One row per placement attempt, so the rate limiter can answer "how many
-- has this table sent in the last two minutes" without scanning orders.
CREATE TABLE IF NOT EXISTS guest_orders_log (
  id         TEXT PRIMARY KEY,
  table_id   TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- The daily order-code counter: one row per restaurant per cafe-local day.
CREATE TABLE IF NOT EXISTS order_counters (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_key       TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_board     ON orders (restaurant_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table     ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_orders_token     ON orders (public_token);
CREATE INDEX IF NOT EXISTS idx_order_items_ord  ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat   ON menu_items (category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tables_code      ON dining_tables (code);
CREATE INDEX IF NOT EXISTS idx_guest_log_window ON guest_orders_log (table_id, created_at DESC);
`;
