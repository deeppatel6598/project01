-- ═══════════════════════════════════════════════════════════════════════════
-- Tablekit — initial schema, RLS policies and the place_order RPC.
--
-- This is the Postgres/Supabase target described in the project brief. The
-- running application uses the SQLite schema in `src/lib/db/schema.ts`, which
-- is the same tables with the same constraints; this file is what a hosted
-- deployment applies, and it is the authority on the RLS model.
--
-- The security posture in one line: the anon key is in the browser, so
-- `orders` is not readable by anon at all, and the only write anon can make
-- goes through `place_order`, which re-reads every price server-side.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── tables ────────────────────────────────────────────────────────────────

create table restaurants (
  id                  uuid primary key default gen_random_uuid(),
  name                text        not null,
  slug                text        not null unique,
  address             text        not null default '',
  phone               text        not null default '',
  currency            text        not null default 'INR',
  logo_url            text,
  hero_image_url      text,
  hours_label         text        not null default '11:00-23:00',
  is_accepting_orders boolean     not null default true,
  created_at          timestamptz not null default now()
);

create table tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid        not null references restaurants (id) on delete cascade,
  label         text        not null,
  -- Random, never sequential: `/t/4` invites a guest to try `/t/9` and order
  -- for someone else's table. Six chars of a no-ambiguity alphabet.
  code          text        not null unique,
  seats         int,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

create table categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name          text not null,
  sort_order    int  not null default 0,
  is_active     boolean not null default true
);

create table menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id   uuid not null references categories (id) on delete cascade,
  name          text not null,
  description   text,
  -- Rupees, as the brief asks, so the owner reads the admin without
  -- converting. numeric(10,2) is exact — never use a float for money.
  price         numeric(10, 2) not null check (price >= 0),
  image_url     text,
  badge         text,
  -- Renders the green/red FSSAI dot.
  is_veg        boolean not null default true,
  is_available  boolean not null default true,
  sort_order    int     not null default 0
);

create type order_status as enum ('new', 'preparing', 'served', 'cancelled');

create table orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_id      uuid not null references tables (id),
  -- Human-sayable across a noisy room: A01, A02 … B01 tomorrow.
  order_code    text not null,
  guest_name    text not null,
  guest_phone   text,
  note          text,
  status        order_status   not null default 'new',
  subtotal      numeric(10, 2) not null check (subtotal >= 0),
  -- = subtotal in v1; the column exists so tax and charges need no migration.
  total         numeric(10, 2) not null check (total >= 0),
  -- The per-order secret that lets the guest who placed it read it back.
  -- Held in sessionStorage, never put in a URL. See docs/SECURITY.md.
  public_token  text not null unique default encode(gen_random_bytes(32), 'base64'),
  placed_at     timestamptz not null default now(),
  accepted_at   timestamptz,
  served_at     timestamptz
);

create table order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders (id) on delete cascade,
  menu_item_id       uuid not null references menu_items (id),
  -- The snapshots are not optional. If the owner raises the cappuccino price
  -- on Tuesday, last week's order must still show what the guest agreed to
  -- pay. Never join to menu_items to render an old order.
  name_snapshot      text not null,
  price_snapshot     numeric(10, 2) not null check (price_snapshot >= 0),
  image_url_snapshot text,
  qty                int not null check (qty > 0),
  line_total         numeric(10, 2) not null check (line_total >= 0)
);

create table staff_members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  restaurant_id uuid        not null references restaurants (id) on delete cascade,
  role          text        not null check (role in ('owner', 'staff')),
  created_at    timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

-- One row per placement attempt, so the rate limiter can answer "how many
-- from this table in the last two minutes" without scanning orders.
create table guest_orders_log (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid        not null references tables (id) on delete cascade,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);

create table order_counters (
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  day_key       date not null,
  last_sequence int  not null default 0,
  primary key (restaurant_id, day_key)
);

create index idx_orders_board     on orders (restaurant_id, status, placed_at desc);
create index idx_orders_table     on orders (table_id);
create index idx_order_items_ord  on order_items (order_id);
create index idx_menu_items_cat   on menu_items (category_id, sort_order);
create index idx_tables_code      on tables (code);
create index idx_guest_log_window on guest_orders_log (table_id, created_at desc);

-- ── row level security ────────────────────────────────────────────────────

alter table restaurants      enable row level security;
alter table tables           enable row level security;
alter table categories       enable row level security;
alter table menu_items       enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table staff_members    enable row level security;
alter table guest_orders_log enable row level security;
alter table order_counters   enable row level security;

-- Membership check, used by every staff policy.
create or replace function is_staff_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id
  );
$$;

create or replace function is_owner_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff_members
    where user_id = auth.uid() and restaurant_id = p_restaurant_id and role = 'owner'
  );
$$;

-- Public read, scoped to exactly what rendering a menu needs, active only.
create policy anon_read_restaurants on restaurants
  for select to anon, authenticated using (true);

create policy anon_read_tables on tables
  for select to anon, authenticated using (is_active);

create policy anon_read_categories on categories
  for select to anon, authenticated using (is_active);

create policy anon_read_menu_items on menu_items
  for select to anon, authenticated using (is_available);

-- Orders: NO anon select policy exists, deliberately. A guest with devtools
-- must not be able to `select * from orders` and read every name, note and
-- phone number in the cafe. Guests reach their own orders only through
-- `get_my_orders` below, which requires the per-order token.
create policy staff_read_orders on orders
  for select to authenticated using (is_staff_of(restaurant_id));

create policy staff_update_orders on orders
  for update to authenticated using (is_staff_of(restaurant_id));

create policy staff_read_order_items on order_items
  for select to authenticated using (
    exists (select 1 from orders o where o.id = order_id and is_staff_of(o.restaurant_id))
  );

create policy owner_write_menu_items on menu_items
  for all to authenticated using (is_owner_of(restaurant_id)) with check (is_owner_of(restaurant_id));

create policy owner_write_categories on categories
  for all to authenticated using (is_owner_of(restaurant_id)) with check (is_owner_of(restaurant_id));

create policy owner_write_tables on tables
  for all to authenticated using (is_owner_of(restaurant_id)) with check (is_owner_of(restaurant_id));

create policy owner_write_restaurants on restaurants
  for update to authenticated using (is_owner_of(id)) with check (is_owner_of(id));

create policy staff_read_membership on staff_members
  for select to authenticated using (user_id = auth.uid());

-- ── place_order ───────────────────────────────────────────────────────────

-- The entire write surface an anonymous guest gets.
--
-- Note what it does not accept: no price, no total, no order code, no status.
-- Those are not validated-then-trusted, they are simply not parameters —
-- every amount is read from menu_items inside this function.
create or replace function place_order(
  p_table_code  text,
  p_guest_name  text,
  p_guest_phone text,
  p_note        text,
  p_items       jsonb,   -- [{ "menu_item_id": "...", "qty": 2 }]
  p_ip_hash     text default 'unknown'
)
returns table (order_id uuid, order_code text, public_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table      tables%rowtype;
  v_restaurant restaurants%rowtype;
  v_recent     int;
  v_line       jsonb;
  v_item       menu_items%rowtype;
  v_qty        int;
  v_subtotal   numeric(10,2) := 0;
  v_order_id   uuid;
  v_token      text;
  v_day        date := (now() at time zone 'Asia/Kolkata')::date;
  v_seq        int;
  v_letter     text;
  v_distinct   int;
begin
  -- 1. Resolve the table.
  select * into v_table from tables where code = lower(trim(p_table_code));
  if not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;
  if not v_table.is_active then
    raise exception 'table_inactive' using errcode = 'P0002';
  end if;

  -- 2. The kill switch.
  select * into v_restaurant from restaurants where id = v_table.restaurant_id;
  if not v_restaurant.is_accepting_orders then
    raise exception 'not_accepting' using errcode = 'P0001';
  end if;

  -- 3. Rate limit: one bored teenager should not be able to send 400 dockets
  --    to the pass.
  select count(*) into v_recent
  from guest_orders_log
  where table_id = v_table.id and created_at > now() - interval '2 minutes';

  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- 4. Merge duplicate lines, then bound the basket.
  create temp table if not exists _basket (menu_item_id uuid primary key, qty int) on commit drop;
  delete from _basket;

  for v_line in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (v_line ->> 'menu_item_id') is null then continue; end if;
    v_qty := coalesce((v_line ->> 'qty')::int, 0);
    if v_qty <= 0 then continue; end if;

    insert into _basket (menu_item_id, qty)
    values ((v_line ->> 'menu_item_id')::uuid, v_qty)
    on conflict (menu_item_id) do update set qty = _basket.qty + excluded.qty;
  end loop;

  select count(*) into v_distinct from _basket;
  if v_distinct = 0 then
    raise exception 'empty_basket' using errcode = 'P0001';
  end if;
  if v_distinct > 30 then
    raise exception 'too_many_lines' using errcode = 'P0001';
  end if;

  -- 5. The daily order code, under a row lock so two simultaneous orders
  --    cannot take the same number.
  insert into order_counters (restaurant_id, day_key, last_sequence)
  values (v_restaurant.id, v_day, 1)
  on conflict (restaurant_id, day_key)
    do update set last_sequence = order_counters.last_sequence + 1
  returning last_sequence into v_seq;

  v_letter := chr(65 + (mod(v_day - date '1970-01-01', 26))::int);
  v_token  := encode(gen_random_bytes(32), 'base64');

  insert into orders (
    restaurant_id, table_id, order_code, guest_name, guest_phone, note,
    status, subtotal, total, public_token
  ) values (
    v_restaurant.id,
    v_table.id,
    v_letter || lpad(v_seq::text, 2, '0'),
    coalesce(nullif(left(trim(p_guest_name), 40), ''), 'Guest'),
    nullif(left(trim(coalesce(p_guest_phone, '')), 20), ''),
    nullif(left(trim(coalesce(p_note, '')), 200), ''),
    'new', 0, 0, v_token
  ) returning id into v_order_id;

  -- 6. Re-read every price from menu_items. Anything price-shaped the client
  --    sent is ignored — it is not even a parameter.
  for v_item, v_qty in
    select m.*, b.qty from _basket b join menu_items m on m.id = b.menu_item_id
  loop
    if v_item.restaurant_id <> v_restaurant.id then
      raise exception 'item_unavailable' using errcode = 'P0001';
    end if;
    if not v_item.is_available then
      raise exception 'item_unavailable' using errcode = 'P0001';
    end if;

    v_qty := least(20, greatest(1, v_qty));   -- clamp, do not reject

    insert into order_items (
      order_id, menu_item_id, name_snapshot, price_snapshot,
      image_url_snapshot, qty, line_total
    ) values (
      v_order_id, v_item.id, v_item.name, v_item.price,
      v_item.image_url, v_qty, v_item.price * v_qty
    );

    v_subtotal := v_subtotal + v_item.price * v_qty;
  end loop;

  -- An id that resolved to no row means the client sent something not on the
  -- menu at all.
  if (select count(*) from order_items where order_id = v_order_id) <> v_distinct then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;

  update orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;

  insert into guest_orders_log (table_id, ip_hash) values (v_table.id, p_ip_hash);

  return query select v_order_id, v_letter || lpad(v_seq::text, 2, '0'), v_token;
end;
$$;

-- Read back only the orders whose tokens the caller can present. This is the
-- whole of a guest's read access.
create or replace function get_my_orders(p_tokens text[])
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',         o.id,
    'token',      o.public_token,
    'orderCode',  o.order_code,
    'tableLabel', t.label,
    'status',     o.status,
    'note',       o.note,
    'total',      o.total,
    'placedAt',   o.placed_at,
    'lines',      coalesce(
      (select jsonb_agg(jsonb_build_object(
         'menuItemId', i.menu_item_id,
         'name',       i.name_snapshot,
         'qty',        i.qty,
         'price',      i.price_snapshot,
         'lineTotal',  i.line_total,
         'imageUrl',   i.image_url_snapshot
       ) order by i.id)
       from order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from orders o
  join tables t on t.id = o.table_id
  -- Bounded so a caller cannot use this to enumerate by sending 10,000 guesses
  -- in one round trip; combine with a gateway rate limit.
  where o.public_token = any (p_tokens[1:20])
  order by o.placed_at desc;
$$;

-- Grant execute to anon. These two functions are the entire anon surface
-- beyond reading the menu.
grant execute on function place_order(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function get_my_orders(text[]) to anon, authenticated;

-- And revoke the blunt table grants, so the policies above are the only path.
revoke all on orders, order_items, guest_orders_log, order_counters from anon;
