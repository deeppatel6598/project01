"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConnectionState } from "@/components/ui";
import type { Order } from "@/lib/types";

/**
 * The pass board's data feed.
 *
 * Realtime will drop. Cafe wifi is cafe wifi, and a kitchen board that
 * silently stops updating is worse than no board at all — staff trust it,
 * stop refreshing, and orders sit. So this hook runs two mechanisms at once:
 *
 *   1. **A stream.** SSE carries individual events the instant they happen.
 *   2. **A poll, every 20 seconds, unconditionally.** It replaces the whole
 *      list with the server's answer.
 *
 * The poll is not a fallback that engages when the stream fails — it always
 * runs. That is what makes the board self-healing: however many events were
 * missed while the wifi was out, the next poll rebuilds the list from scratch
 * and no amount of missed or duplicated events can survive it.
 *
 * The connection dot reports which mechanism is actually carrying the board,
 * so nobody has to guess.
 */

const POLL_MS = 20_000;
/** Treat the board as stale if nothing has landed in this long. */
const STALE_MS = 45_000;

/**
 * Whether to attempt the SSE stream at all.
 *
 * Serverless functions cannot hold a connection open for more than a few
 * seconds, so on Netlify or Vercel `EventSource` would fail, reconnect, fail
 * again — a retry loop that burns a function invocation every few seconds and
 * never succeeds. `NEXT_PUBLIC_TABLEKIT_STREAM=off` turns it off at build
 * time, and the board runs on its reconciling poll alone, which is exactly the
 * mode it was already designed to survive.
 */
const STREAM_ENABLED = process.env.NEXT_PUBLIC_TABLEKIT_STREAM !== "off";

export interface UseLiveOrders {
  orders: Order[];
  connection: ConnectionState;
  /** Ids that arrived since the last render — drives the docket animation. */
  arrivedIds: Set<string>;
  refresh: () => Promise<void>;
  act: (orderId: string, action: "advance" | "cancel") => Promise<void>;
}

export function useLiveOrders(onNewOrder?: () => void): UseLiveOrders {
  const [orders, setOrders] = useState<Order[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("polling");
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(new Set());

  const streamOpen = useRef(false);
  /** Zero until the first effect runs — `Date.now()` is not a render-time value. */
  const lastContact = useRef(0);
  const knownIds = useRef<Set<string>>(new Set());
  const onNewOrderRef = useRef(onNewOrder);

  // Kept current in an effect rather than assigned during render, so the
  // board can accept a fresh callback each render without the hook's other
  // effects tearing down and re-subscribing the stream.
  useEffect(() => {
    onNewOrderRef.current = onNewOrder;
  }, [onNewOrder]);

  useEffect(() => {
    lastContact.current = Date.now();
  }, []);

  /** Recompute the dot from what is actually happening. */
  const settleConnection = useCallback(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnection("offline");
      return;
    }
    if (Date.now() - lastContact.current > STALE_MS) {
      setConnection("offline");
      return;
    }
    setConnection(streamOpen.current ? "live" : "polling");
  }, []);

  /** Note which orders are new to us, so they can animate in exactly once. */
  const noteArrivals = useCallback((next: Order[]) => {
    const fresh = new Set<string>();
    for (const order of next) {
      if (!knownIds.current.has(order.id)) fresh.add(order.id);
    }
    knownIds.current = new Set(next.map((order) => order.id));

    if (fresh.size > 0) {
      setArrivedIds(fresh);
      // Clear the marker after the animation so a re-render does not replay
      // it.
      setTimeout(() => setArrivedIds(new Set()), 400);
    }
    return fresh;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/kitchen/orders", { cache: "no-store" });
      if (!response.ok) {
        settleConnection();
        return;
      }

      const data = (await response.json()) as { orders: Order[] };
      lastContact.current = Date.now();

      // Wholesale replacement, never a merge. This is the reconciliation step.
      const isFirstLoad = knownIds.current.size === 0;
      const fresh = noteArrivals(data.orders);
      setOrders(data.orders);

      // Only chime for orders that appeared while we were watching — not for
      // the twelve already on the board when the screen was switched on.
      if (!isFirstLoad && fresh.size > 0) onNewOrderRef.current?.();

      settleConnection();
    } catch {
      settleConnection();
    }
  }, [noteArrivals, settleConnection]);

  /* ── the stream ──────────────────────────────────────────────────────── */

  useEffect(() => {
    // Nothing to set up, and nothing to correct: the connection state already
    // starts at "polling", and the poll's own `settleConnection` keeps it
    // honest from there.
    if (!STREAM_ENABLED) return;

    let source: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      source = new EventSource("/api/kitchen/stream");

      source.addEventListener("ready", () => {
        streamOpen.current = true;
        lastContact.current = Date.now();
        settleConnection();
      });

      source.addEventListener("order", (event) => {
        lastContact.current = Date.now();

        // The event says *that* something changed. Rather than patching local
        // state from the payload and risking a divergent view, re-read the
        // board — it is one cheap request and it can only ever be right.
        void refresh();

        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { type: string };
          if (payload.type === "order.placed") onNewOrderRef.current?.();
        } catch {
          // Malformed frame — the refresh above still ran.
        }
      });

      source.onopen = () => {
        streamOpen.current = true;
        lastContact.current = Date.now();
        settleConnection();
      };

      source.onerror = () => {
        streamOpen.current = false;
        settleConnection();
        // EventSource reconnects on its own; the poll covers the gap.
      };
    };

    connect();

    return () => {
      cancelled = true;
      streamOpen.current = false;
      source?.close();
    };
  }, [refresh, settleConnection]);

  /* ── the poll floor ──────────────────────────────────────────────────── */

  useEffect(() => {
    // `refresh` is async: it awaits a fetch before touching state, so this is
    // not the synchronous setState-in-effect the rule is guarding against.
    // The immediate call is the board's first paint — waiting a full 20s for
    // the interval would leave the pass blank at the start of service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  /* ── connectivity ────────────────────────────────────────────────────── */

  useEffect(() => {
    const onOnline = () => {
      // Do not wait up to 20s for the next tick — the staff are watching.
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", settleConnection);
    document.addEventListener("visibilitychange", onVisible);

    // Re-evaluate staleness on a slow tick, so the dot goes red on its own
    // when nothing at all is arriving.
    const watchdog = setInterval(settleConnection, 5000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", settleConnection);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(watchdog);
    };
  }, [refresh, settleConnection]);

  /* ── actions ─────────────────────────────────────────────────────────── */

  const act = useCallback(
    async (orderId: string, action: "advance" | "cancel") => {
      // Optimistic: the chef tapped "Start" and the card should move now, not
      // after a round trip. `refresh` immediately after is the correction.
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status:
                  action === "cancel"
                    ? "cancelled"
                    : order.status === "new"
                      ? "preparing"
                      : "served",
              }
            : order,
        ),
      );

      try {
        await fetch(`/api/kitchen/orders/${orderId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  return { orders, connection, arrivedIds, refresh, act };
}
