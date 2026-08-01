import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { setItemAvailability, updateMenuItem } from "@/lib/menu";
import {
  advanceOrder,
  cancelOrder,
  editOrderLine,
  getBoardOrders,
  getGuestOrders,
  getOrder,
  LIMITS,
  OrderError,
  placeOrder,
} from "@/lib/orders";

import { closeTestDb, makeFixture, type Fixture } from "./helpers";

/**
 * The order engine, tested from the position the brief asks for: assume the
 * guest has devtools open.
 *
 * These run against a real Postgres — transaction rollback, the counter's row
 * lock and the race-safe status transitions are the behaviours under test, and
 * a mock would pass while production diverged.
 */

let f: Fixture;

beforeEach(async () => {
  f = await makeFixture();
});

afterAll(async () => {
  await closeTestDb();
});

const place = (overrides: Partial<Parameters<typeof placeOrder>[0]> = {}) =>
  placeOrder(
    {
      tableCode: f.tableCodes[0]!,
      guestName: "Deep",
      lines: [{ menuItemId: f.item.id, qty: 1 }],
      ...overrides,
    },
    f.db,
  );

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toThrowError(expect.objectContaining({ code }));

describe("placement", () => {
  it("prices the order from the menu, ignoring anything the client claims", async () => {
    const { order } = await place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });

    expect(order.lines[0]!.priceSnapshot).toBe(f.item.price);
    expect(order.lines[0]!.lineTotal).toBe(f.item.price * 2);
    expect(order.total).toBe(f.item.price * 2);
  });

  it("merges duplicate lines instead of letting them consume the line budget", async () => {
    const { order } = await place({
      lines: [
        { menuItemId: f.item.id, qty: 2 },
        { menuItemId: f.item.id, qty: 3 },
      ],
    });

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]!.qty).toBe(5);
  });

  it("clamps a quantity above the per-line maximum rather than rejecting it", async () => {
    const { order } = await place({ lines: [{ menuItemId: f.item.id, qty: 9999 }] });
    expect(order.lines[0]!.qty).toBe(LIMITS.maxQty);
  });

  it("ignores zero and negative quantities", async () => {
    await rejectsWith(place({ lines: [{ menuItemId: f.item.id, qty: 0 }] }), "empty_basket");
    await rejectsWith(place({ lines: [{ menuItemId: f.item.id, qty: -5 }] }), "empty_basket");
  });

  it("rejects an empty basket", async () => {
    await rejectsWith(place({ lines: [] }), "empty_basket");
  });

  it("rejects more distinct lines than one order can hold", async () => {
    // More distinct ids than the cap — the count is checked before any menu
    // lookup, so these do not need to exist.
    const lines = Array.from({ length: LIMITS.maxLines + 1 }, (_, index) => ({
      menuItemId: `phantom-${index}`,
      qty: 1,
    }));

    await rejectsWith(place({ lines }), "too_many_lines");
  });

  it("refuses an item that is not on the menu", async () => {
    await expect(place({ lines: [{ menuItemId: "does-not-exist", qty: 1 }] })).rejects.toThrowError(
      OrderError,
    );
  });

  it("refuses a sold-out item and names it", async () => {
    await expect(
      place({ lines: [{ menuItemId: f.soldOutItem.id, qty: 1 }] }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "item_unavailable", itemName: "Loaded Nachos" }),
    );
  });

  it("refuses an unknown table code", async () => {
    await rejectsWith(place({ tableCode: "nope99" }), "table_not_found");
  });

  it("refuses a retired table", async () => {
    await f.db`UPDATE dining_tables SET is_active = false WHERE code = ${f.tableCodes[0]!}`;
    await rejectsWith(place(), "table_inactive");
  });

  it("honours the accepting-orders kill switch", async () => {
    await f.db`UPDATE restaurants SET is_accepting_orders = false`;
    await rejectsWith(place(), "not_accepting");
  });

  it("trims an over-long name and note to their limits", async () => {
    const { order } = await place({ guestName: "x".repeat(200), note: "y".repeat(500) });

    expect(order.guestName).toHaveLength(LIMITS.guestNameChars);
    expect(order.note).toHaveLength(LIMITS.noteChars);
  });

  it("falls back to 'Guest' when no name is given", async () => {
    expect((await place({ guestName: "   " })).order.guestName).toBe("Guest");
  });

  it("rate limits a table after a burst", async () => {
    for (let i = 0; i < LIMITS.rateLimitCount; i += 1) await place();
    await rejectsWith(place(), "rate_limited");
  });

  it("rate limits per table, not globally", async () => {
    for (let i = 0; i < LIMITS.rateLimitCount; i += 1) await place();

    // A different table is unaffected — one busy table must not stop the room.
    await expect(place({ tableCode: f.tableCodes[1]! })).resolves.toBeDefined();
  });

  it("writes nothing at all when placement fails", async () => {
    await expect(
      place({
        lines: [
          { menuItemId: f.item.id, qty: 1 },
          { menuItemId: f.soldOutItem.id, qty: 1 },
        ],
      }),
    ).rejects.toThrow();

    // The whole placement is one transaction, so the failure must leave no
    // order, no lines, and no rate-limit row behind.
    const [orders] = await f.db<{ n: string }[]>`SELECT COUNT(*) AS n FROM orders`;
    const [lines] = await f.db<{ n: string }[]>`SELECT COUNT(*) AS n FROM order_items`;
    const [log] = await f.db<{ n: string }[]>`SELECT COUNT(*) AS n FROM guest_orders_log`;

    expect(Number(orders!.n)).toBe(0);
    expect(Number(lines!.n)).toBe(0);
    expect(Number(log!.n)).toBe(0);
  });

  it("issues a unique token per order", async () => {
    const a = await place();
    const b = await place();

    expect(a.publicToken).not.toBe(b.publicToken);
    expect(a.publicToken.length).toBeGreaterThan(20);
  });
});

describe("order codes", () => {
  it("counts up within a day", async () => {
    const codes = [
      (await place()).order.orderCode,
      (await place()).order.orderCode,
      (await place()).order.orderCode,
    ];

    expect(codes.map((code) => code.slice(1))).toEqual(["01", "02", "03"]);
    // Same rotating letter for all three.
    expect(new Set(codes.map((code) => code[0])).size).toBe(1);
  });

  it("is human-sayable rather than a uuid", async () => {
    expect((await place()).order.orderCode).toMatch(/^[A-Z]\d{2,}$/);
  });
});

describe("price snapshots", () => {
  it("does not reprice an existing order when the menu price changes", async () => {
    const { order, publicToken } = await place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });
    const originalTotal = order.total;

    await updateMenuItem(f.item.id, { price: f.item.price * 3 }, f.db);

    const after = (await getOrder(order.id, f.db))!;
    expect(after.total).toBe(originalTotal);
    expect(after.lines[0]!.priceSnapshot).toBe(f.item.price);

    // And the guest's own view agrees.
    expect((await getGuestOrders([publicToken], f.db))[0]!.total).toBe(originalTotal);
  });

  it("keeps the item name as it was when ordered", async () => {
    const { order } = await place();
    await updateMenuItem(f.item.id, { name: "Renamed Later" }, f.db);

    expect((await getOrder(order.id, f.db))!.lines[0]!.nameSnapshot).toBe(f.item.name);
  });
});

describe("guest access", () => {
  it("returns only the orders whose tokens were presented", async () => {
    const mine = await place({ guestName: "Mine" });
    await place({ tableCode: f.tableCodes[1]!, guestName: "Somebody else" });

    const visible = await getGuestOrders([mine.publicToken], f.db);

    expect(visible).toHaveLength(1);
    expect(visible[0]!.orderCode).toBe(mine.order.orderCode);
  });

  it("returns nothing for an unknown or empty token", async () => {
    await place();

    expect(await getGuestOrders([], f.db)).toEqual([]);
    expect(await getGuestOrders(["not-a-real-token"], f.db)).toEqual([]);
  });

  it("does not expose the guest phone number or restaurant id", async () => {
    const { publicToken } = await place({ guestPhone: "9876543210" });
    const view = (await getGuestOrders([publicToken], f.db))[0]!;

    expect(view).not.toHaveProperty("guestPhone");
    expect(view).not.toHaveProperty("restaurantId");
    expect(JSON.stringify(view)).not.toContain("9876543210");
  });

  it("echoes back the token that fetched each order", async () => {
    const { publicToken } = await place();
    expect((await getGuestOrders([publicToken], f.db))[0]!.token).toBe(publicToken);
  });
});

describe("transitions", () => {
  it("moves new → preparing → served and stamps the times", async () => {
    const { order } = await place();

    const preparing = await advanceOrder(order.id, f.db);
    expect(preparing.status).toBe("preparing");
    expect(preparing.acceptedAt).not.toBeNull();
    expect(preparing.servedAt).toBeNull();

    const served = await advanceOrder(order.id, f.db);
    expect(served.status).toBe("served");
    expect(served.servedAt).not.toBeNull();
  });

  it("refuses to advance past served", async () => {
    const { order } = await place();
    await advanceOrder(order.id, f.db);
    await advanceOrder(order.id, f.db);

    await rejectsWith(advanceOrder(order.id, f.db), "order_locked");
  });

  it("refuses to advance a cancelled order", async () => {
    const { order } = await place();
    await cancelOrder(order.id, f.db);

    await rejectsWith(advanceOrder(order.id, f.db), "order_locked");
  });

  it("throws for an unknown order", async () => {
    await rejectsWith(advanceOrder("nope", f.db), "order_not_found");
  });
});

describe("guest line edits", () => {
  it("adjusts a line and recomputes the total while the order is new", async () => {
    const { order, publicToken } = await place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });

    const updated = (await editOrderLine(publicToken, f.item.id, 1, f.db))!;

    expect(updated.lines[0]!.qty).toBe(3);
    expect(updated.total).toBe(f.item.price * 3);
    expect((await getOrder(order.id, f.db))!.total).toBe(f.item.price * 3);
  });

  it("refuses once the kitchen has started", async () => {
    const { order, publicToken } = await place();
    await advanceOrder(order.id, f.db);

    await rejectsWith(editOrderLine(publicToken, f.item.id, 1, f.db), "order_locked");
  });

  it("refuses with a token for a different order", async () => {
    const mine = await place();
    const other = await place({ tableCode: f.tableCodes[1]! });

    // `other`'s token cannot touch a line on `mine`.
    await rejectsWith(
      editOrderLine(other.publicToken, "not-on-that-order", 1, f.db),
      "order_not_found",
    );
    expect((await getOrder(mine.order.id, f.db))!.status).toBe("new");
  });

  it("cancels the order when the last line is removed", async () => {
    const { order, publicToken } = await place({ lines: [{ menuItemId: f.item.id, qty: 1 }] });

    expect(await editOrderLine(publicToken, f.item.id, -1, f.db)).toBeNull();
    expect((await getOrder(order.id, f.db))!.status).toBe("cancelled");
  });

  it("prices edits from the snapshot, not the current menu", async () => {
    const { publicToken } = await place({ lines: [{ menuItemId: f.item.id, qty: 1 }] });

    await updateMenuItem(f.item.id, { price: 999_00 }, f.db);
    const updated = (await editOrderLine(publicToken, f.item.id, 1, f.db))!;

    expect(updated.total).toBe(f.item.price * 2);
  });
});

describe("the board", () => {
  it("sorts new oldest-first so the longest wait is on top", async () => {
    const first = await place({ guestName: "First" });
    const second = await place({ guestName: "Second" });

    // Force a distinguishable ordering rather than relying on clock resolution
    // between two calls in the same millisecond.
    await f.db`
      UPDATE orders SET placed_at = ${new Date(Date.now() - 600_000)} WHERE id = ${first.order.id}
    `;

    const board = (await getBoardOrders(f.restaurant.id, f.db)).filter((o) => o.status === "new");

    expect(board[0]!.orderCode).toBe(first.order.orderCode);
    expect(board[1]!.orderCode).toBe(second.order.orderCode);
  });

  it("excludes cancelled orders", async () => {
    const { order } = await place();
    await cancelOrder(order.id, f.db);

    expect(await getBoardOrders(f.restaurant.id, f.db)).toHaveLength(0);
  });

  it("drops a served docket after the visible window", async () => {
    const { order } = await place();
    await advanceOrder(order.id, f.db);
    await advanceOrder(order.id, f.db);

    expect(await getBoardOrders(f.restaurant.id, f.db)).toHaveLength(1);

    await f.db`
      UPDATE orders SET served_at = ${new Date(Date.now() - 31 * 60_000)} WHERE id = ${order.id}
    `;

    expect(await getBoardOrders(f.restaurant.id, f.db)).toHaveLength(0);
  });

  it("carries the table label the tray has to reach", async () => {
    await place();
    expect((await getBoardOrders(f.restaurant.id, f.db))[0]!.tableLabel).toBe("Table 01");
  });
});

describe("availability", () => {
  it("removes a sold-out item from what a new order can contain", async () => {
    await setItemAvailability(f.item.id, false, f.db);
    await rejectsWith(place(), "item_unavailable");
  });
});
