import { createHmac } from "node:crypto";

import { formatOrderCode, generateId, generateOrderToken, orderCodeLetter } from "./codes";
import { getDb, type DB } from "./db";
import {
  toOrder,
  type MenuItemRow,
  type OrderItemRow,
  type OrderRow,
} from "./db/rows";
import { publish } from "./events";
import { LIMITS } from "./limits";
import { sumPaise } from "./money";
import { cafeDayKey, SERVED_VISIBLE_MS } from "./time";
import type { CartRequestLine, GuestOrderView, Order, OrderStatus } from "./types";

export { LIMITS } from "./limits";

/**
 * The order engine.
 *
 * This module is the entire write surface a guest gets, and it is written on
 * the assumption that the guest has devtools open. Everything a client sends
 * is treated as a request, never as a fact: prices are re-read here,
 * quantities are clamped here, availability is checked here. A client that
 * posts `{ price: 1 }` gets charged the menu price.
 *
 * The corresponding Postgres `place_order` function — same rules, same order
 * — is in `supabase/migrations/0001_init.sql`.
 */

/* ── errors ────────────────────────────────────────────────────────────── */

export type OrderErrorCode =
  | "table_not_found"
  | "table_inactive"
  | "not_accepting"
  | "empty_basket"
  | "too_many_lines"
  | "item_unavailable"
  | "rate_limited"
  | "order_not_found"
  | "order_locked";

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  /** Set when the failure names a specific item, e.g. one that just sold out. */
  readonly itemName?: string;

  constructor(code: OrderErrorCode, message: string, itemName?: string) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.itemName = itemName;
  }
}

/* ── placement ─────────────────────────────────────────────────────────── */

export interface PlaceOrderInput {
  tableCode: string;
  guestName: string;
  guestPhone?: string | null;
  note?: string | null;
  lines: CartRequestLine[];
  /** Raw client IP, hashed before it is stored. */
  clientIp?: string | null;
}

export interface PlaceOrderResult {
  order: Order;
  /** Returned once, to the guest who placed it. Never logged, never in a URL. */
  publicToken: string;
}

/**
 * Hash an IP before it touches the rate-limit log.
 *
 * The log needs to answer "was this the same client" for two minutes; it does
 * not need to be a list of everyone's IP address sitting on disk. Keyed with
 * the app secret so the hashes are not reversible with a rainbow table of the
 * IPv4 space.
 */
function hashIp(ip: string | null | undefined): string {
  const secret = process.env.TABLEKIT_SECRET ?? "tablekit-dev-secret";
  return createHmac("sha256", secret).update(ip ?? "unknown").digest("hex").slice(0, 32);
}

export function placeOrder(input: PlaceOrderInput, db: DB = getDb()): PlaceOrderResult {
  const now = Date.now();

  // Everything from here to COMMIT is one transaction: the counter bump, the
  // order, its lines and the rate-limit row either all land or none do. A
  // half-written order on the pass is worse than a rejected one.
  const run = db.transaction((): PlaceOrderResult => {
    /* 1. Resolve the table. */
    const table = db
      .prepare<[string], { id: string; restaurant_id: string; label: string; is_active: number }>(
        "SELECT id, restaurant_id, label, is_active FROM dining_tables WHERE code = ?",
      )
      .get(input.tableCode.trim().toLowerCase());

    if (!table) {
      throw new OrderError("table_not_found", "No table is linked to that code");
    }
    if (table.is_active !== 1) {
      throw new OrderError("table_inactive", "That table is not taking orders");
    }

    /* 2. The kill switch. */
    const restaurant = db
      .prepare<[string], { id: string; is_accepting_orders: number }>(
        "SELECT id, is_accepting_orders FROM restaurants WHERE id = ?",
      )
      .get(table.restaurant_id);

    if (!restaurant) {
      throw new OrderError("table_not_found", "That table is not linked to a restaurant");
    }
    if (restaurant.is_accepting_orders !== 1) {
      throw new OrderError("not_accepting", "The kitchen has paused orders");
    }

    /* 3. Rate limit, before doing any real work. */
    const windowStart = now - LIMITS.rateLimitWindowMs;
    const recent = db
      .prepare<[string, number], { n: number }>(
        "SELECT COUNT(*) AS n FROM guest_orders_log WHERE table_id = ? AND created_at > ?",
      )
      .get(table.id, windowStart);

    if ((recent?.n ?? 0) >= LIMITS.rateLimitCount) {
      throw new OrderError("rate_limited", "Too many orders from this table just now");
    }

    /* 4. Normalise the basket. Merge duplicate lines first, so a client that
          posts the same item three times gets one line of three rather than
          three lines toward the 30-line cap. */
    const merged = new Map<string, number>();
    for (const line of input.lines ?? []) {
      if (typeof line?.menuItemId !== "string") continue;
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      merged.set(line.menuItemId, (merged.get(line.menuItemId) ?? 0) + Math.floor(qty));
    }

    if (merged.size === 0) {
      throw new OrderError("empty_basket", "Nothing in the basket");
    }
    if (merged.size > LIMITS.maxLines) {
      throw new OrderError("too_many_lines", `More than ${LIMITS.maxLines} distinct lines`);
    }

    /* 5. Re-read every price from the database. Anything price-shaped the
          client sent is ignored — it never even enters this function's
          signature. */
    const selectItem = db.prepare<[string], MenuItemRow>("SELECT * FROM menu_items WHERE id = ?");

    const resolved = [...merged.entries()].map(([menuItemId, requestedQty]) => {
      const item = selectItem.get(menuItemId);

      if (!item) {
        throw new OrderError("item_unavailable", "That item is not on the menu");
      }
      // Cross-restaurant guard. Single-tenant today, but the check costs
      // nothing and is the one that matters the day it is not.
      if (item.restaurant_id !== restaurant.id) {
        throw new OrderError("item_unavailable", "That item is not on this menu", item.name);
      }
      if (item.is_available !== 1) {
        throw new OrderError("item_unavailable", "That item just sold out", item.name);
      }

      const qty = Math.min(LIMITS.maxQty, Math.max(LIMITS.minQty, requestedQty));

      return {
        menuItemId: item.id,
        nameSnapshot: item.name,
        priceSnapshot: item.price,
        imageUrlSnapshot: item.image_url,
        qty,
        lineTotal: item.price * qty,
      };
    });

    /* 6. Trim the free text. */
    const guestName = (input.guestName ?? "").trim().slice(0, LIMITS.guestNameChars) || "Guest";
    const note = (input.note ?? "").trim().slice(0, LIMITS.noteChars) || null;
    const guestPhone = (input.guestPhone ?? "").trim().slice(0, 20) || null;

    /* 7. The daily order code, under the transaction's write lock. */
    const dayKey = cafeDayKey(now);
    db.prepare(
      `INSERT INTO order_counters (restaurant_id, day_key, last_sequence)
       VALUES (?, ?, 1)
       ON CONFLICT (restaurant_id, day_key)
       DO UPDATE SET last_sequence = last_sequence + 1`,
    ).run(restaurant.id, dayKey);

    const counter = db
      .prepare<[string, string], { last_sequence: number }>(
        "SELECT last_sequence FROM order_counters WHERE restaurant_id = ? AND day_key = ?",
      )
      .get(restaurant.id, dayKey);

    const orderCode = formatOrderCode(orderCodeLetter(dayKey), counter?.last_sequence ?? 1);

    /* 8. Write it. */
    const subtotal = sumPaise(resolved.map((line) => line.lineTotal));
    const orderId = generateId();
    const publicToken = generateOrderToken();

    db.prepare(
      `INSERT INTO orders (
         id, restaurant_id, table_id, order_code, guest_name, guest_phone, note,
         status, subtotal, total, public_token, placed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
    ).run(
      orderId,
      restaurant.id,
      table.id,
      orderCode,
      guestName,
      guestPhone,
      note,
      subtotal,
      subtotal, // total === subtotal in v1; no tax or charges yet
      publicToken,
      now,
    );

    const insertLine = db.prepare(
      `INSERT INTO order_items (
         id, order_id, menu_item_id, name_snapshot, price_snapshot,
         image_url_snapshot, qty, line_total
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const line of resolved) {
      insertLine.run(
        generateId(),
        orderId,
        line.menuItemId,
        line.nameSnapshot,
        line.priceSnapshot,
        line.imageUrlSnapshot,
        line.qty,
        line.lineTotal,
      );
    }

    db.prepare(
      "INSERT INTO guest_orders_log (id, table_id, ip_hash, created_at) VALUES (?, ?, ?, ?)",
    ).run(generateId(), table.id, hashIp(input.clientIp), now);

    const order = mustGetOrder(orderId, db);
    return { order, publicToken };
  });

  const result = run();

  // Published after the transaction commits, so a subscriber that immediately
  // re-reads cannot observe an order the database has not finished writing.
  publish({ type: "order.placed", order: result.order });
  return result;
}

/* ── reads ─────────────────────────────────────────────────────────────── */

const ORDER_SELECT = /* sql */ `
  SELECT o.*, t.label AS table_label
  FROM orders o
  JOIN dining_tables t ON t.id = o.table_id
`;

function hydrate(rows: OrderRow[], db: DB): Order[] {
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => "?").join(", ");
  const lines = db
    .prepare<string[], OrderItemRow>(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY rowid`,
    )
    .all(...rows.map((row) => row.id));

  const byOrder = new Map<string, OrderItemRow[]>();
  for (const line of lines) {
    const bucket = byOrder.get(line.order_id);
    if (bucket) bucket.push(line);
    else byOrder.set(line.order_id, [line]);
  }

  return rows.map((row) => toOrder(row, byOrder.get(row.id) ?? []));
}

export function getOrder(id: string, db: DB = getDb()): Order | null {
  const row = db.prepare<[string], OrderRow>(`${ORDER_SELECT} WHERE o.id = ?`).get(id);
  return row ? hydrate([row], db)[0] : null;
}

function mustGetOrder(id: string, db: DB): Order {
  const order = getOrder(id, db);
  if (!order) throw new OrderError("order_not_found", "Order not found");
  return order;
}

/**
 * The kitchen board.
 *
 * New is sorted oldest-first — the longest-waiting order is the most urgent,
 * so it goes on top. Served is newest-first and drops off after 30 minutes,
 * which keeps the third column from growing into a scroll well.
 */
export function getBoardOrders(restaurantId: string, db: DB = getDb()): Order[] {
  const servedCutoff = Date.now() - SERVED_VISIBLE_MS;

  const rows = db
    .prepare<[string, number], OrderRow>(
      `${ORDER_SELECT}
       WHERE o.restaurant_id = ?
         AND o.status IN ('new', 'preparing', 'served')
         AND (o.status != 'served' OR o.served_at > ?)
       ORDER BY
         CASE o.status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
         CASE WHEN o.status = 'served' THEN -o.placed_at ELSE o.placed_at END`,
    )
    .all(restaurantId, servedCutoff);

  return hydrate(rows, db);
}

export interface HistoryFilter {
  from?: number;
  to?: number;
  status?: OrderStatus;
  limit?: number;
}

export function getOrderHistory(
  restaurantId: string,
  filter: HistoryFilter = {},
  db: DB = getDb(),
): Order[] {
  const where = ["o.restaurant_id = ?"];
  const values: Array<string | number> = [restaurantId];

  if (filter.from !== undefined) {
    where.push("o.placed_at >= ?");
    values.push(filter.from);
  }
  if (filter.to !== undefined) {
    where.push("o.placed_at <= ?");
    values.push(filter.to);
  }
  if (filter.status) {
    where.push("o.status = ?");
    values.push(filter.status);
  }

  values.push(Math.min(filter.limit ?? 500, 2000));

  const rows = db
    .prepare<Array<string | number>, OrderRow>(
      `${ORDER_SELECT} WHERE ${where.join(" AND ")} ORDER BY o.placed_at DESC LIMIT ?`,
    )
    .all(...values);

  return hydrate(rows, db);
}

/**
 * Read back the orders a guest actually placed, by their per-order tokens.
 *
 * This is the whole of a guest's read access. Without a token there is no
 * query that returns an order to an anonymous client — the board endpoint is
 * staff-only, and there is no "list orders for table X" route, because
 * knowing a table code must not be enough to read the names and notes of
 * everyone who has sat there today.
 *
 * The projection is narrower than `Order` on purpose: no phone, no internal
 * ids, no other table.
 */
export function getGuestOrders(tokens: string[], db: DB = getDb()): GuestOrderView[] {
  const clean = [...new Set(tokens.filter((t) => typeof t === "string" && t.length > 0))].slice(0, 20);
  if (clean.length === 0) return [];

  const placeholders = clean.map(() => "?").join(", ");
  const rows = db
    .prepare<string[], OrderRow>(
      `${ORDER_SELECT} WHERE o.public_token IN (${placeholders}) ORDER BY o.placed_at DESC`,
    )
    .all(...clean);

  // `hydrate` preserves row order, so the token for order `i` is the token on
  // row `i` — no second lookup and no id-to-token map to keep in step.
  return hydrate(rows, db).map((order, index) => ({
    id: order.id,
    token: rows[index]!.public_token,
    orderCode: order.orderCode,
    tableLabel: order.tableLabel,
    status: order.status,
    note: order.note,
    total: order.total,
    placedAt: order.placedAt,
    lines: order.lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.nameSnapshot,
      qty: line.qty,
      price: line.priceSnapshot,
      lineTotal: line.lineTotal,
      imageUrl: line.imageUrlSnapshot,
    })),
  }));
}

/** Resolve a token to the order id it unlocks, or null. */
export function resolveOrderToken(token: string, db: DB = getDb()): string | null {
  const row = db
    .prepare<[string], { id: string }>("SELECT id FROM orders WHERE public_token = ?")
    .get(token);
  return row?.id ?? null;
}

/* ── transitions ───────────────────────────────────────────────────────── */

/**
 * Move a docket forward: new → preparing → served.
 *
 * Staff-only. The transition is guarded in SQL rather than read-then-write,
 * so two people tapping "Start" on the pass and the counter at the same
 * moment cannot double-advance an order to served.
 */
export function advanceOrder(id: string, db: DB = getDb()): Order {
  const now = Date.now();

  const result = db
    .prepare(
      `UPDATE orders
       SET status      = CASE status WHEN 'new' THEN 'preparing' WHEN 'preparing' THEN 'served' END,
           accepted_at = CASE WHEN status = 'new' THEN ? ELSE accepted_at END,
           served_at   = CASE WHEN status = 'preparing' THEN ? ELSE served_at END
       WHERE id = ? AND status IN ('new', 'preparing')`,
    )
    .run(now, now, id);

  if (result.changes === 0) {
    const existing = getOrder(id, db);
    if (!existing) throw new OrderError("order_not_found", "Order not found");
    throw new OrderError("order_locked", "That order has already been served or cancelled");
  }

  const order = mustGetOrder(id, db);
  publish({ type: "order.updated", order });
  return order;
}

export function cancelOrder(id: string, db: DB = getDb()): Order {
  const result = db
    .prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'")
    .run(id);

  if (result.changes === 0) {
    const existing = getOrder(id, db);
    if (!existing) throw new OrderError("order_not_found", "Order not found");
    return existing;
  }

  const order = mustGetOrder(id, db);
  publish({ type: "order.cancelled", orderId: order.id, restaurantId: order.restaurantId });
  return order;
}

/**
 * Let a guest adjust a line on an order the kitchen has not started.
 *
 * The design shows steppers on a `new` docket and a lock message once it is
 * `preparing`, so this is the write behind those steppers. Authorised by the
 * order's own token — a guest can only reach an order they placed.
 *
 * Totals are recomputed from the stored snapshots, never from the live menu:
 * removing an item from yesterday's order must not silently reprice the rest
 * of it.
 */
export function editOrderLine(
  token: string,
  menuItemId: string,
  delta: number,
  db: DB = getDb(),
): GuestOrderView | null {
  const run = db.transaction((): string => {
    const order = db
      .prepare<[string], { id: string; status: OrderStatus }>(
        "SELECT id, status FROM orders WHERE public_token = ?",
      )
      .get(token);

    if (!order) throw new OrderError("order_not_found", "Order not found");
    if (order.status !== "new") {
      throw new OrderError("order_locked", "The kitchen has already started this order");
    }

    const line = db
      .prepare<[string, string], OrderItemRow>(
        "SELECT * FROM order_items WHERE order_id = ? AND menu_item_id = ?",
      )
      .get(order.id, menuItemId);

    if (!line) throw new OrderError("order_not_found", "That item is not on this order");

    const nextQty = Math.min(LIMITS.maxQty, Math.max(0, line.qty + Math.trunc(delta)));

    if (nextQty === 0) {
      db.prepare("DELETE FROM order_items WHERE id = ?").run(line.id);
    } else {
      db.prepare("UPDATE order_items SET qty = ?, line_total = ? WHERE id = ?").run(
        nextQty,
        line.price_snapshot * nextQty,
        line.id,
      );
    }

    const remaining = db
      .prepare<[string], { total: number | null }>(
        "SELECT SUM(line_total) AS total FROM order_items WHERE order_id = ?",
      )
      .get(order.id);

    // An order emptied to nothing is a cancellation, not a ₹0 docket sitting
    // on the pass.
    if (!remaining?.total) {
      db.prepare("UPDATE orders SET status = 'cancelled', subtotal = 0, total = 0 WHERE id = ?").run(
        order.id,
      );
    } else {
      db.prepare("UPDATE orders SET subtotal = ?, total = ? WHERE id = ?").run(
        remaining.total,
        remaining.total,
        order.id,
      );
    }

    return order.id;
  });

  const orderId = run();
  const order = mustGetOrder(orderId, db);

  if (order.status === "cancelled") {
    publish({ type: "order.cancelled", orderId: order.id, restaurantId: order.restaurantId });
    return null;
  }

  publish({ type: "order.updated", order });
  return getGuestOrders([token], db)[0] ?? null;
}

/* ── reporting ─────────────────────────────────────────────────────────── */

export interface DayStats {
  orders: number;
  revenue: number;
  items: number;
  medianMinutesToServe: number | null;
}

export function getDayStats(restaurantId: string, dayKey: string, db: DB = getDb()): DayStats {
  const orders = getOrderHistory(restaurantId, {}, db).filter(
    (order) => cafeDayKey(order.placedAt) === dayKey && order.status !== "cancelled",
  );

  const durations = orders
    .filter((order) => order.servedAt !== null)
    .map((order) => (order.servedAt! - order.placedAt) / 60000)
    .sort((a, b) => a - b);

  const median =
    durations.length === 0
      ? null
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;

  return {
    orders: orders.length,
    revenue: sumPaise(orders.map((order) => order.total)),
    items: orders.reduce((n, order) => n + order.lines.reduce((m, line) => m + line.qty, 0), 0),
    medianMinutesToServe: median === null ? null : Math.round(median * 10) / 10,
  };
}
