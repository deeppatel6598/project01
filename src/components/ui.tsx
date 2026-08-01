import type { CSSProperties, ReactNode } from "react";

import { copy } from "@/lib/copy";

/**
 * The small shared pieces of the Modernist system that both surfaces use.
 *
 * Anything larger lives with the surface that owns it — these are the parts
 * that would otherwise be copy-pasted between the guest menu and the pass.
 */

/* ── the FSSAI veg mark ────────────────────────────────────────────────── */

/**
 * The square-with-a-dot every packaged and served food item carries in India:
 * green for vegetarian, brown-red for non-vegetarian. It is a legal marking,
 * not decoration, which is why its colors sit outside the mono palette.
 */
export function VegDot({ isVeg, className = "" }: { isVeg: boolean; className?: string }) {
  const color = isVeg ? "var(--color-veg)" : "var(--color-nonveg)";

  return (
    <span
      className={`inline-flex items-center justify-center bg-white ${className}`}
      style={{ width: 11, height: 11, border: `1.5px solid ${color}` }}
      role="img"
      aria-label={isVeg ? copy.guest.veg : copy.guest.nonVeg}
    >
      <span className="rounded-full" style={{ width: 4, height: 4, background: color }} />
    </span>
  );
}

/* ── connection state ──────────────────────────────────────────────────── */

export type ConnectionState = "live" | "polling" | "offline";

/**
 * A board that has silently stopped updating is worse than no board, so the
 * pass always says which of the three states it is in rather than looking
 * identical whether or not events are arriving.
 */
export function ConnectionDot({ state }: { state: ConnectionState }) {
  const color =
    state === "live"
      ? "var(--color-accent)"
      : state === "polling"
        ? "var(--color-polling)"
        : "var(--color-neutral-500)";

  return (
    <span className="label inline-flex items-center gap-3" style={{ fontSize: 11 }}>
      <span style={{ width: 8, height: 8, background: color }} aria-hidden />
      <span>{copy.connection[state]}</span>
      <span className="sr-only">{`Connection: ${state}`}</span>
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
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`Remove one ${label}`}
      >
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

/** A section number set in the system's inverted numeral block. */
export function Numeral({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-white"
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: "0.06em",
        background: "var(--color-text)",
        padding: "3px 7px",
      }}
    >
      {children}
    </span>
  );
}

/** The dotted leader running from a name to its price. */
export function Leader({ solid = false }: { solid?: boolean }) {
  return <span className={solid ? "leader-solid" : "leader"} aria-hidden />;
}

/** An empty state drawn as a dashed cell rather than centred grey text. */
export function EmptyCell({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  const style: CSSProperties =
    tone === "dark"
      ? { border: "2px dashed var(--color-neutral-700)", color: "var(--color-neutral-500)" }
      : { border: "2px dashed var(--color-neutral-400)", color: "var(--color-neutral-700)" };

  return (
    <div className="label label-tight p-6" style={style}>
      {children}
    </div>
  );
}

/** The angled status stamp. */
export function Stamp({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <div className="stamp" style={{ fontSize: size, padding: "5px 10px" }}>
      {children}
    </div>
  );
}
