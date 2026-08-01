"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { LIMITS } from "@/lib/limits";
import type { Cart } from "@/lib/types";

/**
 * The basket.
 *
 * Persisted to `sessionStorage`, keyed by table code, so a guest who
 * accidentally pulls-to-refresh halfway through ordering does not lose it.
 * Session rather than local storage on purpose: the basket should not still
 * be sitting there when they come back next Tuesday and sit at a different
 * table.
 */

type CartAction =
  | { type: "increment"; itemId: string }
  | { type: "decrement"; itemId: string }
  | { type: "set"; itemId: string; qty: number }
  | { type: "remove"; itemId: string }
  | { type: "clear" }
  | { type: "hydrate"; cart: Cart };

function reducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case "hydrate":
      return action.cart;

    case "clear":
      return {};

    case "remove": {
      if (!(action.itemId in state)) return state;
      const next = { ...state };
      delete next[action.itemId];
      return next;
    }

    case "increment":
    case "decrement":
    case "set": {
      const current = state[action.itemId] ?? 0;
      const requested =
        action.type === "set" ? action.qty : current + (action.type === "increment" ? 1 : -1);

      // The same clamp the server applies. Enforcing it here too means the UI
      // never shows a quantity the order engine would silently reduce.
      const qty = Math.min(LIMITS.maxQty, Math.max(0, requested));

      if (qty === current) return state;
      if (qty === 0) {
        const next = { ...state };
        delete next[action.itemId];
        return next;
      }
      return { ...state, [action.itemId]: qty };
    }
  }
}

function storageKey(tableCode: string): string {
  return `tablekit:cart:${tableCode}`;
}

export interface UseCart {
  cart: Cart;
  count: number;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  setQty: (itemId: string, qty: number) => void;
  remove: (itemId: string) => void;
  clear: () => void;
}

export function useCart(tableCode: string): UseCart {
  const [cart, dispatch] = useReducer(reducer, {} as Cart);

  // A ref rather than state: this guard only ever matters inside the
  // write-through effect below, and making it state would re-render the whole
  // menu once on mount for nothing.
  const hydratedRef = useRef(false);

  // Read once on mount. `sessionStorage` is unavailable during SSR and can
  // throw in a locked-down browser, so every access is guarded — a guest with
  // storage disabled gets a basket that works but does not survive a refresh,
  // which is a much better failure than a blank menu.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey(tableCode));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const clean: Cart = {};
          for (const [itemId, qty] of Object.entries(parsed as Record<string, unknown>)) {
            const n = Number(qty);
            if (Number.isInteger(n) && n > 0) clean[itemId] = Math.min(LIMITS.maxQty, n);
          }
          dispatch({ type: "hydrate", cart: clean });
        }
      }
    } catch {
      // Unreadable or corrupt — start empty rather than crash the menu.
    }
    hydratedRef.current = true;
  }, [tableCode]);

  // Write through on every change, but only after hydration, so the initial
  // empty state cannot clobber a stored basket in the gap before it loads.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      if (Object.keys(cart).length === 0) {
        window.sessionStorage.removeItem(storageKey(tableCode));
      } else {
        window.sessionStorage.setItem(storageKey(tableCode), JSON.stringify(cart));
      }
    } catch {
      // Storage full or blocked — the in-memory basket still works.
    }
  }, [cart, tableCode]);

  return {
    cart,
    count: Object.values(cart).reduce((total, qty) => total + qty, 0),
    increment: useCallback((itemId: string) => dispatch({ type: "increment", itemId }), []),
    decrement: useCallback((itemId: string) => dispatch({ type: "decrement", itemId }), []),
    setQty: useCallback((itemId: string, qty: number) => dispatch({ type: "set", itemId, qty }), []),
    remove: useCallback((itemId: string) => dispatch({ type: "remove", itemId }), []),
    clear: useCallback(() => dispatch({ type: "clear" }), []),
  };
}

/* ── order tokens ──────────────────────────────────────────────────────── */

const tokenKey = (tableCode: string) => `tablekit:tokens:${tableCode}`;

/**
 * The per-order secrets this guest holds.
 *
 * These are the only keys to reading an order back, and they live in
 * `sessionStorage` rather than the URL so they cannot leak through a shared
 * link, a screenshot, a referrer header or a server access log.
 */
export function readOrderTokens(tableCode: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(tokenKey(tableCode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function appendOrderToken(tableCode: string, token: string): string[] {
  const tokens = [...new Set([token, ...readOrderTokens(tableCode)])].slice(0, 20);
  try {
    window.sessionStorage.setItem(tokenKey(tableCode), JSON.stringify(tokens));
  } catch {
    // Non-fatal: the guest just will not see this order under "My orders"
    // after a refresh.
  }
  return tokens;
}

/* ── the guest's name ──────────────────────────────────────────────────── */

/**
 * Remembered across sessions, because a regular retyping their name on every
 * order is the kind of small friction that stops people using the thing.
 */
const NAME_KEY = "tablekit:guest-name";

export function readGuestName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeGuestName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name.slice(0, 40));
  } catch {
    // Ignored.
  }
}
