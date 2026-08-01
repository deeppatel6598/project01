import type { ReactNode } from "react";

import { copy } from "@/lib/copy";

/**
 * Shared pieces of the Warm Cafe system — the parts both surfaces use.
 * Anything larger lives with the surface that owns it.
 */

/* ── the FSSAI veg mark ────────────────────────────────────────────────── */

/**
 * The square-with-a-dot every served food item carries in India: green for
 * vegetarian, brown-red for non-vegetarian. It is a legal marking, which is
 * why its colours sit outside the palette and why it keeps a hard square in
 * a design that otherwise rounds everything.
 */
export function VegDot({ isVeg, size = 16 }: { isVeg: boolean; size?: number }) {
  const color = isVeg ? "var(--color-veg)" : "var(--color-nonveg)";

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center bg-white"
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${color}`,
        borderRadius: 3,
      }}
      role="img"
      aria-label={isVeg ? copy.guest.veg : copy.guest.nonVeg}
    >
      <span
        className="rounded-full"
        style={{ width: size * 0.4, height: size * 0.4, background: color }}
      />
    </span>
  );
}

/* ── connection state ──────────────────────────────────────────────────── */

export type ConnectionState = "live" | "polling" | "offline";

/**
 * A board that has silently stopped updating is worse than no board, so the
 * pass always says which of the three states it is in. The dot pulses only
 * when live — motion here means "data is arriving", not decoration.
 */
export function ConnectionDot({ state }: { state: ConnectionState }) {
  const color =
    state === "live"
      ? "var(--color-live)"
      : state === "polling"
        ? "var(--color-polling)"
        : "var(--color-offline)";

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{ background: "var(--color-dark-700)" }}
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{
          width: 8,
          height: 8,
          background: color,
          boxShadow: state === "live" ? `0 0 0 3px color-mix(in srgb, ${color} 28%, transparent)` : undefined,
        }}
      />
      <span className="label" style={{ color: "var(--color-dark-soft)", fontSize: 10 }}>
        {copy.connection[state]}
      </span>
    </span>
  );
}

/* ── the stepper ───────────────────────────────────────────────────────── */

export function Stepper({
  qty,
  onDecrement,
  onIncrement,
  disabled = false,
  max = 20,
  label,
}: {
  qty: number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
  max?: number;
  label: string;
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={onDecrement} disabled={disabled} aria-label={`Remove one ${label}`}>
        −
      </button>
      <span className="qty" aria-live="polite" aria-label={`${qty} ${label}`}>
        {qty}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled || qty >= max}
        aria-label={`Add one ${label}`}
      >
        +
      </button>
    </div>
  );
}

/* ── structure ─────────────────────────────────────────────────────────── */

/** A section number, set in the gold as a small filled disc. */
export function Numeral({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 26,
        height: 26,
        background: "var(--color-gold-100)",
        color: "var(--color-gold-700)",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}

/** The dotted leader running from a dish name to its price. */
export function Leader() {
  return <span className="leader" aria-hidden />;
}

/** An empty state — a soft dashed well rather than a hard box. */
export function EmptyCell({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  return (
    <div
      className="rounded-2xl px-5 py-8 text-center text-sm"
      style={{
        border: `1.5px dashed ${dark ? "var(--color-dark-600)" : "var(--color-border-strong)"}`,
        color: dark ? "var(--color-dark-faint)" : "var(--color-text-faint)",
        background: dark ? "transparent" : "var(--color-surface-2)",
      }}
    >
      {children}
    </div>
  );
}

/** The angled status stamp. */
export function Stamp({ children, size = 13 }: { children: ReactNode; size?: number }) {
  return (
    <div className="stamp" style={{ fontSize: size, padding: "6px 12px" }}>
      {children}
    </div>
  );
}
