# Data model

SQLite at runtime (`src/lib/db/schema.ts`), Postgres for the hosted target
(`supabase/migrations/0001_init.sql`). Same tables, same constraints; the
differences are noted below.

## Tables

```
restaurants ──┬── dining_tables ──── orders ──── order_items
              ├── categories ─────── menu_items ──┘ (snapshot only, see below)
              ├── staff_members
              └── order_counters

guest_orders_log        (rate limiting; references dining_tables)
```

Everything hangs off `restaurant_id` even though v1 is single-tenant. There is
no tenant signup, no plan tier and no onboarding wizard — but multi-tenancy is
a migration later rather than a rewrite.

`dining_tables` is `tables` in Postgres. It is renamed in SQLite only to keep
queries readable without quoting.

## Three decisions worth knowing

### 1. Money is integer paise

The brief asked for `numeric(10,2)` in rupees, "keep it readable for the
owner". Postgres has exact decimals, so the migration honours that literally.
SQLite does not — its only numeric types are integer and IEEE float, and money
must never round-trip through a float.

So the SQLite column stores **integer paise**, and readability is met where it
was actually about: `formatINR` renders `₹1,23,45,678` with Indian digit
grouping, and the admin's price fields take and show rupees via
`parseRupeeInput`. See `src/lib/money.ts`.

### 2. Order lines are snapshots, never joins

`order_items` copies the item's name, price and image at the moment of
ordering:

```
name_snapshot   price_snapshot   image_url_snapshot
```

If the owner raises the cappuccino price on Tuesday, last week's docket must
still show what the guest actually agreed to pay. **Never resolve an old order
through `menu_items`.** Editing a line recomputes from `price_snapshot`, so
removing an item from an order does not silently reprice the rest of it.

Two tests pin this down: a price change after placement leaves both the order
total and the guest's own view untouched.

### 3. Order codes are human-sayable

Nobody shouts "order eight-four-two-a-f-nine" across a cafe. Codes are a letter
that rotates daily plus a counter: `A01`, `A02`, … then `B01` tomorrow.

- The letter is derived from the cafe-local calendar day, so it advances on its
  own with no stored cursor.
- The counter lives in `order_counters (restaurant_id, day_key)` and is bumped
  inside the placement transaction, so two simultaneous orders cannot take the
  same number.
- Past 99 the code widens (`A100`) rather than wrapping — two live orders both
  called `A01` would be worse than a three-digit code.

The uuid stays in the database.

## Table codes

Six characters from `abcdefghjkmnpqrstuvwxyz23456789` — no `i`/`l`/`1`, no
`o`/`0`, because someone reads these off a smudged sticker to the counter.

Generated with rejection sampling: taking `byte % 31` would quietly
over-represent the first few letters of the alphabet. A test asserts every
symbol appears across enough draws.

They must be random, never sequential. `/t/4` invites a bored guest to try
`/t/9`. Rotating a code (admin → Tables → New code) dead-ends the old URL
immediately, which is the fix for a sticker that leaked or got moved — the UI
warns that the printed sticker stops working.

## Time

Timestamps are epoch milliseconds on the wire — one integer both SQLite and the
browser agree on with no parser in between.

Wall-clock formatting is pinned to **Asia/Kolkata**, not the viewer's locale:
the kitchen screen and the owner's laptop must agree on what "today" means even
if the admin is opened from another timezone. `cafeDayKey` and `dayRange`
derive the offset from the dates themselves rather than hard-coding +05:30, so
a report that straddles a future rule change still covers the days asked for.

## Statuses

`new → preparing → served`, plus `cancelled`, which is not a stage.

- Transitions are guarded in SQL (`WHERE ... AND status IN (...)`), not
  read-then-write, so two staff tapping "Start" at once cannot double-advance
  an order to served.
- `accepted_at` and `served_at` are stamped on transition, which is what the
  "how long did that take" figure on the admin overview is computed from.
- A guest who empties an order down to nothing cancels it rather than leaving a
  ₹0 docket on the pass.
- Served dockets clear off the board 30 minutes after serving.

## Indexes

```sql
orders (restaurant_id, status, placed_at DESC)   -- the board query
orders (table_id)
orders (public_token)                            -- the guest's read path
order_items (order_id)
menu_items (category_id, sort_order)
dining_tables (code)                             -- every QR scan
guest_orders_log (table_id, created_at DESC)     -- the rate-limit window
```

## Migrations

SQLite uses the `user_version` pragma — an integer in the file header, so the
schema version travels with the database rather than in a side table.
`migrate()` runs on first connection and is idempotent.

To change the schema: bump `SCHEMA_VERSION`, add the DDL, and add the
corresponding Postgres migration alongside `0001_init.sql`.
