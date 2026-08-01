"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  appendOrderToken,
  readGuestName,
  readOrderTokens,
  useCart,
  writeGuestName,
} from "@/hooks/use-cart";
import { copy } from "@/lib/copy";
import { formatINR, sumPaise } from "@/lib/money";
import type { DiningTable, GuestOrderView, MenuSection, Restaurant } from "@/lib/types";

import { CartSheet } from "./cart-sheet";
import { HeroImage } from "./hero-image";
import { MenuBoard } from "./menu-board";
import { OrdersScreen } from "./orders-screen";
import { PlacedScreen } from "./placed-screen";

/**
 * The guest surface.
 *
 * The menu itself is server-rendered and passed in as props — it is public,
 * identical for everyone and cacheable, so it paints before this component
 * hydrates. Everything that is specific to *this* guest (basket, name, the
 * orders they have placed) lives here in the client.
 */

/** How often the placed orders re-check their status. */
const ORDER_POLL_MS = 10_000;

/**
 * The remembered guest name is read through `useSyncExternalStore` rather
 * than in an effect: `localStorage` does not exist during SSR, and this is
 * the API built for exactly that — a server snapshot of `""` and a client
 * snapshot from storage, with no post-hydration setState and no double
 * render.
 *
 * Nothing else in the app writes it mid-session, so the subscribe function
 * has nothing to listen to.
 */
const noopSubscribe = () => () => {};
const emptyName = () => "";

export function GuestApp({
  restaurant,
  table,
  sections,
}: {
  restaurant: Restaurant;
  table: DiningTable;
  sections: MenuSection[];
}) {
  const cart = useCart(table.code);

  // `typedName` wins once the guest has touched the field; until then the
  // remembered name shows through.
  const storedName = useSyncExternalStore(noopSubscribe, readGuestName, emptyName);
  const [typedName, setTypedName] = useState<string | null>(null);
  const guestName = typedName ?? storedName;

  const [note, setNote] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [placedOpen, setPlacedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<GuestOrderView[]>([]);
  const [lastOrder, setLastOrder] = useState<GuestOrderView | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const tokensRef = useRef<string[]>([]);
  const scrollRootRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const cartTotal = useMemo(
    () =>
      sumPaise(
        Object.entries(cart.cart).map(([itemId, qty]) => (itemsById.get(itemId)?.price ?? 0) * qty),
      ),
    [cart.cart, itemsById],
  );

  /* ── my orders ───────────────────────────────────────────────────────── */

  const refreshOrders = useCallback(async () => {
    const tokens = tokensRef.current;
    if (tokens.length === 0) return;

    try {
      const response = await fetch("/api/orders/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!response.ok) return;

      const data = (await response.json()) as { orders: GuestOrderView[] };
      setMyOrders(data.orders);

      // Keep the confirmation docket in step if the kitchen starts the order
      // while the guest is still looking at it.
      setLastOrder((current) =>
        current ? (data.orders.find((order) => order.id === current.id) ?? current) : current,
      );
    } catch {
      // Offline or a flaky connection — the next tick tries again. The screen
      // keeps showing the last known state rather than blanking.
    }
  }, []);

  // Restore this guest's order tokens on mount.
  useEffect(() => {
    tokensRef.current = readOrderTokens(table.code);
    void refreshOrders();
  }, [table.code, refreshOrders]);

  // Poll for status changes, but only while a screen is actually showing one.
  // A guest reading the menu does not need a request every ten seconds.
  useEffect(() => {
    if (!ordersOpen && !placedOpen) return;

    const poll = setInterval(() => void refreshOrders(), ORDER_POLL_MS);
    // Called immediately as well as on the interval, so opening the screen
    // shows current status rather than a ten-second-old one.
    void refreshOrders();
    return () => clearInterval(poll);
  }, [ordersOpen, placedOpen, refreshOrders]);

  // The ticking elapsed timers.
  useEffect(() => {
    if (!ordersOpen) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [ordersOpen]);

  // Re-check as soon as the phone comes back — a guest who locked their
  // screen for five minutes should not be looking at a stale status.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshOrders]);

  /* ── actions ─────────────────────────────────────────────────────────── */

  const handleChangeName = useCallback((value: string) => {
    setTypedName(value);
    writeGuestName(value);
  }, []);

  const placeOrder = useCallback(async () => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableCode: table.code,
          guestName,
          note,
          lines: Object.entries(cart.cart).map(([menuItemId, qty]) => ({ menuItemId, qty })),
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        publicToken?: string;
        order?: GuestOrderView;
      };

      if (!response.ok || !data.publicToken || !data.order) {
        setError(data.error ?? copy.errors.generic);
        return;
      }

      tokensRef.current = appendOrderToken(table.code, data.publicToken);

      setLastOrder(data.order);
      setMyOrders((current) => [data.order!, ...current]);
      cart.clear();
      setNote("");
      setSheetOpen(false);
      setPlacedOpen(true);
    } catch {
      setError(copy.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, table.code, guestName, note, cart]);

  const editLine = useCallback(
    async (orderId: string, menuItemId: string, delta: number) => {
      // The token, not the order id, is what authorises the edit — an id
      // alone is not a credential. Each order carries back the token that
      // fetched it, so there is no mapping to maintain here.
      const order = myOrders.find((candidate) => candidate.id === orderId);
      if (!order) return;

      setBusyItemId(menuItemId);
      try {
        await fetch("/api/orders/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: order.token, menuItemId, delta }),
        });
        await refreshOrders();
      } catch {
        // Leave the list as-is; the next poll reconciles it.
      } finally {
        setBusyItemId(null);
      }
    },
    [myOrders, refreshOrders],
  );

  /* ── render ──────────────────────────────────────────────────────────── */

  const cartBarVisible = cart.count > 0 && !sheetOpen && !ordersOpen && !placedOpen;
  const accepting = restaurant.isAcceptingOrders;

  return (
    <div
      className="relative mx-auto flex min-h-dvh w-full flex-col"
      style={{
        maxWidth: 480,
        background: "var(--color-neutral-100)",
        borderLeft: "2px solid var(--color-text)",
        borderRight: "2px solid var(--color-text)",
      }}
    >
      <div ref={scrollRootRef} className="flex-1">
        {/* hero */}
        <div
          className="relative overflow-hidden"
          style={{ height: 150, borderBottom: "2px solid var(--color-text)", background: "var(--color-neutral-300)" }}
        >
          <HeroImage
            src={restaurant.heroImageUrl}
            alt={`${restaurant.name} dining room`}
          />

          <div
            className="absolute bottom-0 left-0 text-white"
            style={{
              background: "var(--color-accent)",
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              padding: "7px 12px",
            }}
          >
            {copy.guest.scanStrip}
          </div>

          <button
            type="button"
            onClick={() => setOrdersOpen(true)}
            className="btn btn-secondary absolute"
            style={{ right: 12, top: 12, background: "var(--color-neutral-100)", padding: "0 12px" }}
          >
            <span>{copy.guest.myOrders}</span>
            {myOrders.length > 0 && (
              <span
                className="text-white"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: 12,
                  background: "var(--color-accent)",
                  padding: "2px 6px",
                }}
              >
                {myOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* masthead */}
        <div className="px-4 pt-6 pb-3" style={{ borderBottom: "2px solid var(--color-text)" }}>
          <div
            className="label label-wide flex items-baseline justify-between gap-3"
            style={{ color: "var(--color-neutral-700)" }}
          >
            <span>{restaurant.name}</span>
            <span>Est. 2019</span>
          </div>

          <h1
            className="m-0 mt-3"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 0.88,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
            }}
          >
            {copy.guest.menuTitle[0]}
            <br />
            {copy.guest.menuTitle[1]}
          </h1>

          <div
            className="label mt-3 flex items-baseline justify-between gap-3 pt-2"
            style={{ borderTop: "2px solid var(--color-text)", fontWeight: 700 }}
          >
            <span>{table.label}</span>
            <span style={{ color: "var(--color-accent-700)" }}>
              {accepting ? copy.guest.open(restaurant.hoursLabel) : copy.guest.closed}
            </span>
          </div>
        </div>

        <MenuBoard
          sections={sections}
          cart={cart.cart}
          accepting={accepting}
          onIncrement={cart.increment}
          onDecrement={cart.decrement}
          scrollRoot={scrollRootRef}
        />

        <p
          className="label label-tight px-4 pt-6 mb-0"
          style={{ color: "var(--color-neutral-600)", paddingBottom: cartBarVisible ? 120 : 32 }}
        >
          {copy.guest.payAtCounter}
        </p>
      </div>

      {/* the cart bar — always visible once something is in the basket */}
      {cartBarVisible && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="btn btn-primary btn-block fixed bottom-0 z-30"
          style={{
            maxWidth: 480,
            width: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            minHeight: 60,
            borderTop: "2px solid var(--color-text)",
          }}
        >
          <span style={{ fontSize: 12 }}>
            {copy.guest.itemCount(cart.count)} · {formatINR(cartTotal)}
          </span>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 16,
              letterSpacing: "0.06em",
            }}
          >
            {copy.guest.reviewOrder} →
          </span>
        </button>
      )}

      <CartSheet
        open={sheetOpen}
        items={items}
        cart={cart.cart}
        guestName={guestName}
        note={note}
        accepting={accepting}
        submitting={submitting}
        error={error}
        onChangeName={handleChangeName}
        onChangeNote={setNote}
        onClose={() => setSheetOpen(false)}
        onSubmit={() => void placeOrder()}
      />

      <PlacedScreen
        open={placedOpen}
        order={lastOrder}
        guestName={guestName || "Guest"}
        onTrack={() => {
          setPlacedOpen(false);
          setOrdersOpen(true);
        }}
        onBackToMenu={() => setPlacedOpen(false)}
      />

      <OrdersScreen
        open={ordersOpen}
        orders={myOrders}
        tableLabel={table.label}
        nowMs={nowMs}
        busyItemId={busyItemId}
        onEditLine={(orderId, menuItemId, delta) => void editLine(orderId, menuItemId, delta)}
        onClose={() => setOrdersOpen(false)}
      />
    </div>
  );
}
