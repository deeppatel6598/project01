-- Tablekit — initial schema.
--
-- Generated from src/lib/db/schema.ts, which is the single source of truth so
-- the migration and the runtime cannot drift. Apply with the Supabase CLI:
--
--   supabase link --project-ref <ref>
--   supabase db push
--
-- Or let `npm run seed` create it: both are idempotent.
--
-- Access model: the application is the enforcement layer — every query runs
-- server-side over a pooled connection and a guest never holds a database
-- credential. RLS is enabled with no policies purely as defence in depth, so
-- that an exposed publishable key returns nothing through PostgREST.
-- See docs/SECURITY.md.

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
  is_accepting_orders BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  seats         INTEGER,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         INTEGER NOT NULL CHECK (price >= 0),
  image_url     TEXT,
  badge         TEXT,
  is_veg        BOOLEAN NOT NULL DEFAULT true,
  is_available  BOOLEAN NOT NULL DEFAULT true,
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
  status        TEXT NOT NULL CHECK (status IN ('new','preparing','served','cancelled')),
  subtotal      INTEGER NOT NULL CHECK (subtotal >= 0),
  total         INTEGER NOT NULL CHECK (total >= 0),
  public_token  TEXT NOT NULL UNIQUE,
  placed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  served_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id       TEXT NOT NULL REFERENCES menu_items(id),
  name_snapshot      TEXT NOT NULL,
  price_snapshot     INTEGER NOT NULL CHECK (price_snapshot >= 0),
  image_url_snapshot TEXT,
  qty                INTEGER NOT NULL CHECK (qty > 0),
  line_total         INTEGER NOT NULL CHECK (line_total >= 0),
  -- Preserves insert order for rendering, replacing SQLite's rowid.
  seq                BIGSERIAL
);

CREATE TABLE IF NOT EXISTS staff_members (
  id            TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_orders_log (
  id         TEXT PRIMARY KEY,
  table_id   TEXT NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_counters (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_key       TEXT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_board     ON orders (restaurant_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table     ON orders (table_id);
CREATE INDEX IF NOT EXISTS idx_orders_token     ON orders (public_token);
CREATE INDEX IF NOT EXISTS idx_order_items_ord  ON order_items (order_id, seq);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat   ON menu_items (category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tables_code      ON dining_tables (code);
CREATE INDEX IF NOT EXISTS idx_guest_log_window ON guest_orders_log (table_id, created_at DESC);

ALTER TABLE restaurants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_orders_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_counters   ENABLE ROW LEVEL SECURITY;
