import { createHmac } from "node:crypto";

import { formatOrderCode, generateId, generateOrderToken, orderCodeLetter } from "./codes";
import { getDb, type DB } from "./db";
import { toOrder, type MenuItemRow, type OrderItemRow, type OrderRow } from "./db/rows";
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

export async function placeOrder(
  input: PlaceOrderInput,
  sql: DB = getDb(),
): Promise<PlaceOrderResult> {
  const now = Date.now();

  // Everything inside `begin` is one transaction: the counter bump, the order,
  // its lines and the rate-limit row either all land or none do. A half-written
  // order on the pass is worse than a rejected one — and unlike the SQLite
  // build, a thrown error here rolls back automatically.
  const { orderId, publicToken } = await sql.begin(async (tx) => {
    /* 1. Resolve the table. */
    const [table] = await tx<
      { id: string; restaurant_id: string; label: string; is_active: boolean }[]
    >`
      SELECT id, restaurant_id, label, is_active
      FROM dining_tables WHERE code = ${input.tableCode.trim().toLowerCase()}
    `;

    if (!table) throw new OrderError("table_not_found", "No table is linked to that code");
    if (!table.is_active) throw new OrderError("table_inactive", "That table is not taking orders");

    /* 2. The kill switch. */
    const [restaurant] = await tx<{ id: string; is_accepting_orders: boolean }[]>`
      SELECT id, is_accepting_orders FROM restaurants WHERE id = ${table.restaurant_id}
    `;

    if (!restaurant) {
      throw new OrderError("table_not_found", "That table is not linked to a restaurant");
    }
    if (!restaurant.is_accepting_orders) {
      throw new OrderError("not_accepting", "The kitchen has paused orders");
    }

    /* 3. Rate limit, before doing any real work. */
    const [recent] = await tx<{ n: string }[]>`
      SELECT COUNT(*) AS n FROM guest_orders_log
      WHERE table_id = ${table.id}
        AND created_at > ${new Date(now - LIMITS.rateLimitWindowMs)}
    `;

    // COUNT() comes back as a bigint, which the driver renders as a string.
    if (Number(recent?.n ?? 0) >= LIMITS.rateLimitCount) {
      throw new OrderError("rate_limited", "Too many orders from this table just now");
    }

    /* 4. Normalise the basket. Merge duplicates first, so a client posting the
          same item three times gets one line of three rather than three lines
          toward the 30-line cap. */
    const merged = new Map<string, number>();
    for (const line of input.lines ?? []) {
      if (typeof line?.menuItemId !== "string") continue;
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      merged.set(line.menuItemId, (merged.get(line.menuItemId) ?? 0) + Math.floor(qty));
    }

    if (merged.size === 0) throw new OrderError("empty_basket", "Nothing in the basket");
    if (merged.size > LIMITS.maxLines) {
      throw new OrderError("too_many_lines", `More than ${LIMITS.maxLines} distinct lines`);
    }

    /* 5. Re-read every price from the database. Anything price-shaped the
          client sent is ignored — it never enters this function's signature. */
    const ids = [...merged.keys()];
    const found = await tx<MenuItemRow[]>`SELECT * FROM menu_items WHERE id = ANY(${ids})`;
    const byId = new Map(found.map((item) => [item.id, item]));

    const resolved = ids.map((menuItemId) => {
      const item = byId.get(menuItemId);

      if (!item) throw new OrderError("item_unavailable", "That item is not on the menu");
      // Cross-restaurant guard. Single-tenant today, but the check costs
      // nothing and is the one that matters the day it is not.
      if (item.restaurant_id !== restaurant.id) {
        throw new OrderError("item_unavailable", "That item is not on this menu", item.name);
      }
      if (!item.is_available) {
        throw new OrderError("item_unavailable", "That item just sold out", item.name);
      }

      const qty = Math.min(LIMITS.maxQty, Math.max(LIMITS.minQty, merged.get(menuItemId)!));

      return {
        id: generateId(),
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

    /* 7. The daily order code. The upsert takes a row lock, so two orders
          placed in the same millisecond cannot take the same number. */
    const dayKey = cafeDayKey(now);
    const [counter] = await tx<{ last_sequence: number }[]>`
      INSERT INTO order_counters (restaurant_id, day_key, last_sequence)
      VALUES (${restaurant.id}, ${dayKey}, 1)
      ON CONFLICT (restaurant_id, day_key)
      DO UPDATE SET last_sequence = order_counters.last_sequence + 1
      RETURNING last_sequence
    `;

    const orderCode = formatOrderCode(orderCodeLetter(dayKey), counter?.last_sequence ?? 1);

    /* 8. Write it. */
    const subtotal = sumPaise(resolved.map((line) => line.lineTotal));
    const id = generateId();
    const token = generateOrderToken();

    await tx`
      INSERT INTO orders (
        id, restaurant_id, table_id, order_code, guest_name, guest_phone, note,
        status, subtotal, total, public_token, placed_at
      ) VALUES (
        ${id}, ${restaurant.id}, ${table.id}, ${orderCode}, ${guestName}, ${guestPhone},
        ${note}, 'new', ${subtotal}, ${subtotal}, ${token}, ${new Date(now)}
      )
    `;

    await tx`
      INSERT INTO order_items ${tx(
        resolved.map((line) => ({
          id: line.id,
          order_id: id,
          menu_item_id: line.menuItemId,
          name_snapshot: line.nameSnapshot,
          price_snapshot: line.priceSnapshot,
          image_url_snapshot: line.imageUrlSnapshot,
          qty: line.qty,
          line_total: line.lineTotal,
        })),
      )}
    `;

    await tx`
      INSERT INTO guest_orders_log (id, table_id, ip_hash, created_at)
      VALUES (${generateId()}, ${table.id}, ${hashIp(input.clientIp)}, ${new Date(now)})
    `;

    return { orderId: id, publicToken: token };
  });

  // Read back after the transaction commits, so a subscriber that immediately
  // re-reads cannot observe a half-written order.
  const order = await mustGetOrder(orderId, sql);
  publish({ type: "order.placed", order });

  return { order, publicToken };
}

/* ── reads ─────────────────────────────────────────────────────────────── */

async function hydrate(rows: OrderRow[], sql: DB): Promise<Order[]> {
  if (rows.length === 0) return [];

  const lines = await sql<OrderItemRow[]>`
    SELECT * FROM order_items WHERE order_id = ANY(${rows.map((row) => row.id)}) ORDER BY seq
  `;

  const byOrder = new Map<string, OrderItemRow[]>();
  for (const line of lines) {
    const bucket = byOrder.get(line.order_id);
    if (bucket) bucket.push(line);
    else byOrder.set(line.order_id, [line]);
  }

  return rows.map((row) => toOrder(row, byOrder.get(row.id) ?? []));
}

export async function getOrder(id: string, sql: DB = getDb()): Promise<Order | null> {
  const rows = await sql<OrderRow[]>`
    SELECT o.*, t.label AS table_label
    FROM orders o JOIN dining_tables t ON t.id = o.table_id
    WHERE o.id = ${id}
  `;
  const [order] = await hydrate(rows, sql);
  return order ?? null;
}

async function mustGetOrder(id: string, sql: DB): Promise<Order> {
  const order = await getOrder(id, sql);
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
export async function getBoardOrders(restaurantId: string, sql: DB = getDb()): Promise<Order[]> {
  const rows = await sql<OrderRow[]>`
    SELECT o.*, t.label AS table_label
    FROM orders o JOIN dining_tables t ON t.id = o.table_id
    WHERE o.restaurant_id = ${restaurantId}
      AND o.status IN ('new', 'preparing', 'served')
      AND (o.status <> 'served' OR o.served_at > ${new Date(Date.now() - SERVED_VISIBLE_MS)})
    ORDER BY
      CASE o.status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
      CASE WHEN o.status = 'served' THEN o.placed_at END DESC,
      CASE WHEN o.status <> 'served' THEN o.placed_at END ASC
  `;
  return hydrate(rows, sql);
}

export interface HistoryFilter {
  from?: number;
  to?: number;
  status?: OrderStatus;
  limit?: number;
}

export async function getOrderHistory(
  restaurantId: string,
  filter: HistoryFilter = {},
  sql: DB = getDb(),
): Promise<Order[]> {
  const rows = await sql<OrderRow[]>`
    SELECT o.*, t.label AS table_label
    FROM orders o JOIN dining_tables t ON t.id = o.table_id
    WHERE o.restaurant_id = ${restaurantId}
      ${filter.from !== undefined ? sql`AND o.placed_at >= ${new Date(filter.from)}` : sql``}
      ${filter.to !== undefined ? sql`AND o.placed_at <= ${new Date(filter.to)}` : sql``}
      ${filter.status ? sql`AND o.status = ${filter.status}` : sql``}
    ORDER BY o.placed_at DESC
    LIMIT ${Math.min(filter.limit ?? 500, 2000)}
  `;
  return hydrate(rows, sql);
}

/**
 * Read back the orders a guest actually placed, by their per-order tokens.
 *
 * This is the whole of a guest's read access. Without a token there is no
 * query that returns an order to an anonymous client — the board endpoint is
 * staff-only, and there is no "list orders for table X" route, because knowing
 * a table code must not be enough to read the names and notes of everyone who
 * has sat there today.
 *
 * The projection is narrower than `Order` on purpose: no phone, no internal
 * ids, no other table.
 */
export async function getGuestOrders(
  tokens: string[],
  sql: DB = getDb(),
): Promise<GuestOrderView[]> {
  const clean = [...new Set(tokens.filter((t) => typeof t === "string" && t.length > 0))].slice(
    0,
    20,
  );
  if (clean.length === 0) return [];

  const rows = await sql<OrderRow[]>`
    SELECT o.*, t.label AS table_label
    FROM orders o JOIN dining_tables t ON t.id = o.table_id
    WHERE o.public_token = ANY(${clean})
    ORDER BY o.placed_at DESC
  `;

  const orders = await hydrate(rows, sql);

  // `hydrate` preserves row order, so the token for order `i` is the token on
  // row `i` — no second lookup and no id-to-token map to keep in step.
  return orders.map((order, index) => ({
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
export async function resolveOrderToken(token: string, sql: DB = getDb()): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM orders WHERE public_token = ${token}
  `;
  return row?.id ?? null;
}

/* ── transitions ───────────────────────────────────────────────────────── */

/**
 * Move a docket forward: new → preparing → served.
 *
 * Staff-only. The transition is guarded in SQL rather than read-then-write, so
 * two people tapping "Start" on the pass and the counter at the same moment
 * cannot double-advance an order to served.
 */
export async function advanceOrder(id: string, sql: DB = getDb()): Promise<Order> {
  const now = new Date();

  const updated = await sql`
    UPDATE orders
    SET status      = CASE status WHEN 'new' THEN 'preparing' WHEN 'preparing' THEN 'served' END,
        accepted_at = CASE WHEN status = 'new' THEN ${now} ELSE accepted_at END,
        served_at   = CASE WHEN status = 'preparing' THEN ${now} ELSE served_at END
    WHERE id = ${id} AND status IN ('new', 'preparing')
    RETURNING id
  `;

  if (updated.length === 0) {
    const existing = await getOrder(id, sql);
    if (!existing) throw new OrderError("order_not_found", "Order not found");
    throw new OrderError("order_locked", "That order has already been served or cancelled");
  }

  const order = await mustGetOrder(id, sql);
  publish({ type: "order.updated", order });
  return order;
}

export async function cancelOrder(id: string, sql: DB = getDb()): Promise<Order> {
  const updated = await sql`
    UPDATE orders SET status = 'cancelled'
    WHERE id = ${id} AND status <> 'cancelled'
    RETURNING id
  `;

  if (updated.length === 0) {
    const existing = await getOrder(id, sql);
    if (!existing) throw new OrderError("order_not_found", "Order not found");
    return existing;
  }

  const order = await mustGetOrder(id, sql);
  publish({ type: "order.cancelled", orderId: order.id, restaurantId: order.restaurantId });
  return order;
}

/**
 * Let a guest adjust a line on an order the kitchen has not started.
 *
 * Authorised by the order's own token — a guest can only reach an order they
 * placed. Totals are recomputed from the stored snapshots, never from the live
 * menu: removing an item from yesterday's order must not reprice the rest of
 * it.
 */
export async function editOrderLine(
  token: string,
  menuItemId: string,
  delta: number,
  sql: DB = getDb(),
): Promise<GuestOrderView | null> {
  const orderId = await sql.begin(async (tx) => {
    const [order] = await tx<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE public_token = ${token}
    `;

    if (!order) throw new OrderError("order_not_found", "Order not found");
    if (order.status !== "new") {
      throw new OrderError("order_locked", "The kitchen has already started this order");
    }

    const [line] = await tx<OrderItemRow[]>`
      SELECT * FROM order_items WHERE order_id = ${order.id} AND menu_item_id = ${menuItemId}
    `;

    if (!line) throw new OrderError("order_not_found", "That item is not on this order");

    const nextQty = Math.min(LIMITS.maxQty, Math.max(0, line.qty + Math.trunc(delta)));

    if (nextQty === 0) {
      await tx`DELETE FROM order_items WHERE id = ${line.id}`;
    } else {
      await tx`
        UPDATE order_items
        SET qty = ${nextQty}, line_total = ${line.price_snapshot * nextQty}
        WHERE id = ${line.id}
      `;
    }

    const [remaining] = await tx<{ total: number | null }[]>`
      SELECT SUM(line_total)::int AS total FROM order_items WHERE order_id = ${order.id}
    `;

    // An order emptied to nothing is a cancellation, not a ₹0 docket sitting
    // on the pass.
    if (!remaining?.total) {
      await tx`UPDATE orders SET status = 'cancelled', subtotal = 0, total = 0 WHERE id = ${order.id}`;
    } else {
      await tx`
        UPDATE orders SET subtotal = ${remaining.total}, total = ${remaining.total}
        WHERE id = ${order.id}
      `;
    }

    return order.id;
  });

  const order = await mustGetOrder(orderId, sql);

  if (order.status === "cancelled") {
    publish({ type: "order.cancelled", orderId: order.id, restaurantId: order.restaurantId });
    return null;
  }

  publish({ type: "order.updated", order });
  return (await getGuestOrders([token], sql))[0] ?? null;
}

/* ── reporting ─────────────────────────────────────────────────────────── */

export interface DayStats {
  orders: number;
  revenue: number;
  items: number;
  medianMinutesToServe: number | null;
}

export async function getDayStats(
  restaurantId: string,
  dayKey: string,
  sql: DB = getDb(),
): Promise<DayStats> {
  const history = await getOrderHistory(restaurantId, {}, sql);
  const orders = history.filter(
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
        ? durations[(durations.length - 1) / 2]!
        : (durations[durations.length / 2 - 1]! + durations[durations.length / 2]!) / 2;

  return {
    orders: orders.length,
    revenue: sumPaise(orders.map((order) => order.total)),
    items: orders.reduce((n, order) => n + order.lines.reduce((m, line) => m + line.qty, 0), 0),
    medianMinutesToServe: median === null ? null : Math.round(median * 10) / 10,
  };
}
