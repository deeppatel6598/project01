import { beforeEach, describe, expect, it } from "vitest";

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
import { setItemAvailability, updateMenuItem } from "@/lib/menu";

import { makeFixture, type Fixture } from "./helpers";

/**
 * The order engine, tested from the position the brief asks for: assume the
 * guest has devtools open.
 */

let f: Fixture;

beforeEach(() => {
  f = makeFixture();
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

describe("placement", () => {
  it("prices the order from the menu, ignoring anything the client claims", () => {
    const { order } = place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });

    expect(order.lines[0]!.priceSnapshot).toBe(f.item.price);
    expect(order.lines[0]!.lineTotal).toBe(f.item.price * 2);
    expect(order.total).toBe(f.item.price * 2);
  });

  it("merges duplicate lines instead of letting them consume the line budget", () => {
    const { order } = place({
      lines: [
        { menuItemId: f.item.id, qty: 2 },
        { menuItemId: f.item.id, qty: 3 },
      ],
    });

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]!.qty).toBe(5);
  });

  it("clamps a quantity above the per-line maximum rather than rejecting it", () => {
    const { order } = place({ lines: [{ menuItemId: f.item.id, qty: 9999 }] });
    expect(order.lines[0]!.qty).toBe(LIMITS.maxQty);
  });

  it("ignores zero and negative quantities", () => {
    expect(() =>
      place({ lines: [{ menuItemId: f.item.id, qty: 0 }] }),
    ).toThrowError(expect.objectContaining({ code: "empty_basket" }));

    expect(() =>
      place({ lines: [{ menuItemId: f.item.id, qty: -5 }] }),
    ).toThrowError(expect.objectContaining({ code: "empty_basket" }));
  });

  it("rejects an empty basket", () => {
    expect(() => place({ lines: [] })).toThrowError(
      expect.objectContaining({ code: "empty_basket" }),
    );
  });

  it("rejects more distinct lines than one order can hold", () => {
    // More distinct ids than the cap, all resolvable or not — the count is
    // checked before any menu lookup.
    const lines = Array.from({ length: LIMITS.maxLines + 1 }, (_, index) => ({
      menuItemId: `phantom-${index}`,
      qty: 1,
    }));

    expect(() => place({ lines })).toThrowError(
      expect.objectContaining({ code: "too_many_lines" }),
    );
  });

  it("refuses an item that is not on the menu", () => {
    expect(() => place({ lines: [{ menuItemId: "does-not-exist", qty: 1 }] })).toThrowError(
      OrderError,
    );
  });

  it("refuses a sold-out item and names it", () => {
    try {
      place({ lines: [{ menuItemId: f.soldOutItem.id, qty: 1 }] });
      expect.unreachable("sold-out item was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(OrderError);
      expect((error as OrderError).code).toBe("item_unavailable");
      expect((error as OrderError).itemName).toBe("Loaded Nachos");
    }
  });

  it("refuses an unknown table code", () => {
    expect(() => place({ tableCode: "nope99" })).toThrowError(
      expect.objectContaining({ code: "table_not_found" }),
    );
  });

  it("refuses a retired table", () => {
    f.db.prepare("UPDATE dining_tables SET is_active = 0 WHERE code = ?").run(f.tableCodes[0]);

    expect(() => place()).toThrowError(expect.objectContaining({ code: "table_inactive" }));
  });

  it("honours the accepting-orders kill switch", () => {
    f.db.prepare("UPDATE restaurants SET is_accepting_orders = 0").run();

    expect(() => place()).toThrowError(expect.objectContaining({ code: "not_accepting" }));
  });

  it("trims an over-long name and note to their limits", () => {
    const { order } = place({
      guestName: "x".repeat(200),
      note: "y".repeat(500),
    });

    expect(order.guestName).toHaveLength(LIMITS.guestNameChars);
    expect(order.note).toHaveLength(LIMITS.noteChars);
  });

  it("falls back to 'Guest' when no name is given", () => {
    expect(place({ guestName: "   " }).order.guestName).toBe("Guest");
  });

  it("rate limits a table after a burst", () => {
    for (let i = 0; i < LIMITS.rateLimitCount; i += 1) place();

    expect(() => place()).toThrowError(expect.objectContaining({ code: "rate_limited" }));
  });

  it("rate limits per table, not globally", () => {
    for (let i = 0; i < LIMITS.rateLimitCount; i += 1) place();

    // A different table is unaffected — one busy table must not stop the room.
    expect(() => place({ tableCode: f.tableCodes[1]! })).not.toThrow();
  });

  it("writes nothing at all when placement fails", () => {
    const before = f.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM orders").get()!.n;

    expect(() =>
      place({
        lines: [
          { menuItemId: f.item.id, qty: 1 },
          { menuItemId: f.soldOutItem.id, qty: 1 },
        ],
      }),
    ).toThrow();

    const after = f.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM orders").get()!.n;
    const lines = f.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM order_items").get()!.n;

    expect(after).toBe(before);
    expect(lines).toBe(0);
  });

  it("issues a unique token per order", () => {
    const a = place();
    const b = place();

    expect(a.publicToken).not.toBe(b.publicToken);
    expect(a.publicToken.length).toBeGreaterThan(20);
  });
});

describe("order codes", () => {
  it("counts up within a day", () => {
    const codes = [place().order.orderCode, place().order.orderCode, place().order.orderCode];

    expect(codes.map((code) => code.slice(1))).toEqual(["01", "02", "03"]);
    // Same rotating letter for all three.
    expect(new Set(codes.map((code) => code[0])).size).toBe(1);
  });

  it("is human-sayable rather than a uuid", () => {
    expect(place().order.orderCode).toMatch(/^[A-Z]\d{2,}$/);
  });
});

describe("price snapshots", () => {
  it("does not reprice an existing order when the menu price changes", () => {
    const { order, publicToken } = place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });
    const originalTotal = order.total;

    updateMenuItem(f.item.id, { price: f.item.price * 3 }, f.db);

    const after = getOrder(order.id, f.db)!;
    expect(after.total).toBe(originalTotal);
    expect(after.lines[0]!.priceSnapshot).toBe(f.item.price);

    // And the guest's own view agrees.
    expect(getGuestOrders([publicToken], f.db)[0]!.total).toBe(originalTotal);
  });

  it("keeps the item name as it was when ordered", () => {
    const { order } = place();
    updateMenuItem(f.item.id, { name: "Renamed Later" }, f.db);

    expect(getOrder(order.id, f.db)!.lines[0]!.nameSnapshot).toBe(f.item.name);
  });
});

describe("guest access", () => {
  it("returns only the orders whose tokens were presented", () => {
    const mine = place({ guestName: "Mine" });
    place({ tableCode: f.tableCodes[1]!, guestName: "Somebody else" });

    const visible = getGuestOrders([mine.publicToken], f.db);

    expect(visible).toHaveLength(1);
    expect(visible[0]!.orderCode).toBe(mine.order.orderCode);
  });

  it("returns nothing for an unknown or empty token", () => {
    place();

    expect(getGuestOrders([], f.db)).toEqual([]);
    expect(getGuestOrders(["not-a-real-token"], f.db)).toEqual([]);
  });

  it("does not expose the guest phone number or restaurant id", () => {
    const { publicToken } = place({ guestPhone: "9876543210" });
    const view = getGuestOrders([publicToken], f.db)[0]!;

    expect(view).not.toHaveProperty("guestPhone");
    expect(view).not.toHaveProperty("restaurantId");
    expect(JSON.stringify(view)).not.toContain("9876543210");
  });

  it("echoes back the token that fetched each order", () => {
    const { publicToken } = place();
    expect(getGuestOrders([publicToken], f.db)[0]!.token).toBe(publicToken);
  });
});

describe("transitions", () => {
  it("moves new → preparing → served and stamps the times", () => {
    const { order } = place();

    const preparing = advanceOrder(order.id, f.db);
    expect(preparing.status).toBe("preparing");
    expect(preparing.acceptedAt).not.toBeNull();
    expect(preparing.servedAt).toBeNull();

    const served = advanceOrder(order.id, f.db);
    expect(served.status).toBe("served");
    expect(served.servedAt).not.toBeNull();
  });

  it("refuses to advance past served", () => {
    const { order } = place();
    advanceOrder(order.id, f.db);
    advanceOrder(order.id, f.db);

    expect(() => advanceOrder(order.id, f.db)).toThrowError(
      expect.objectContaining({ code: "order_locked" }),
    );
  });

  it("refuses to advance a cancelled order", () => {
    const { order } = place();
    cancelOrder(order.id, f.db);

    expect(() => advanceOrder(order.id, f.db)).toThrowError(
      expect.objectContaining({ code: "order_locked" }),
    );
  });

  it("throws for an unknown order", () => {
    expect(() => advanceOrder("nope", f.db)).toThrowError(
      expect.objectContaining({ code: "order_not_found" }),
    );
  });
});

describe("guest line edits", () => {
  it("adjusts a line and recomputes the total while the order is new", () => {
    const { order, publicToken } = place({ lines: [{ menuItemId: f.item.id, qty: 2 }] });

    const updated = editOrderLine(publicToken, f.item.id, 1, f.db)!;

    expect(updated.lines[0]!.qty).toBe(3);
    expect(updated.total).toBe(f.item.price * 3);
    expect(getOrder(order.id, f.db)!.total).toBe(f.item.price * 3);
  });

  it("refuses once the kitchen has started", () => {
    const { order, publicToken } = place();
    advanceOrder(order.id, f.db);

    expect(() => editOrderLine(publicToken, f.item.id, 1, f.db)).toThrowError(
      expect.objectContaining({ code: "order_locked" }),
    );
  });

  it("refuses with a token for a different order", () => {
    const mine = place();
    const other = place({ tableCode: f.tableCodes[1]! });

    // `other`'s token cannot touch a line on `mine`.
    expect(() => editOrderLine(other.publicToken, "not-on-that-order", 1, f.db)).toThrowError(
      expect.objectContaining({ code: "order_not_found" }),
    );
    expect(getOrder(mine.order.id, f.db)!.status).toBe("new");
  });

  it("cancels the order when the last line is removed", () => {
    const { order, publicToken } = place({ lines: [{ menuItemId: f.item.id, qty: 1 }] });

    expect(editOrderLine(publicToken, f.item.id, -1, f.db)).toBeNull();
    expect(getOrder(order.id, f.db)!.status).toBe("cancelled");
  });

  it("prices edits from the snapshot, not the current menu", () => {
    const { publicToken } = place({ lines: [{ menuItemId: f.item.id, qty: 1 }] });

    updateMenuItem(f.item.id, { price: 999_00 }, f.db);
    const updated = editOrderLine(publicToken, f.item.id, 1, f.db)!;

    expect(updated.total).toBe(f.item.price * 2);
  });
});

describe("the board", () => {
  it("sorts new oldest-first so the longest wait is on top", () => {
    const first = place({ guestName: "First" });
    const second = place({ guestName: "Second" });

    // Force a distinguishable ordering rather than relying on clock
    // resolution between two calls in the same millisecond.
    f.db
      .prepare("UPDATE orders SET placed_at = ? WHERE id = ?")
      .run(Date.now() - 600_000, first.order.id);

    const board = getBoardOrders(f.restaurant.id, f.db).filter((o) => o.status === "new");

    expect(board[0]!.orderCode).toBe(first.order.orderCode);
    expect(board[1]!.orderCode).toBe(second.order.orderCode);
  });

  it("excludes cancelled orders", () => {
    const { order } = place();
    cancelOrder(order.id, f.db);

    expect(getBoardOrders(f.restaurant.id, f.db)).toHaveLength(0);
  });

  it("drops a served docket after the visible window", () => {
    const { order } = place();
    advanceOrder(order.id, f.db);
    advanceOrder(order.id, f.db);

    expect(getBoardOrders(f.restaurant.id, f.db)).toHaveLength(1);

    f.db
      .prepare("UPDATE orders SET served_at = ? WHERE id = ?")
      .run(Date.now() - 31 * 60_000, order.id);

    expect(getBoardOrders(f.restaurant.id, f.db)).toHaveLength(0);
  });

  it("carries the table label the tray has to reach", () => {
    place();
    expect(getBoardOrders(f.restaurant.id, f.db)[0]!.tableLabel).toBe("Table 01");
  });
});

describe("availability", () => {
  it("removes a sold-out item from what a new order can contain", () => {
    setItemAvailability(f.item.id, false, f.db);

    expect(() => place()).toThrowError(expect.objectContaining({ code: "item_unavailable" }));
  });
});
