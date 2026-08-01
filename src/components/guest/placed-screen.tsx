"use client";

import { Thumb } from "@/components/thumb";
import { Leader, Stamp } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatINR } from "@/lib/money";
import type { GuestOrderView } from "@/lib/types";

/**
 * The confirmation.
 *
 * This is deliberately the same docket the kitchen is looking at — same
 * paper, same perforations, same order code — because that is what tells the
 * guest their order actually landed somewhere real, rather than showing them
 * a green tick and hoping.
 */

export function PlacedScreen({
  open,
  order,
  guestName,
  onTrack,
  onBackToMenu,
}: {
  open: boolean;
  order: GuestOrderView | null;
  guestName: string;
  onTrack: () => void;
  onBackToMenu: () => void;
}) {
  if (!open || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 mx-auto overflow-y-auto px-4 pt-6 pb-8"
      style={{ maxWidth: 480, background: "var(--color-neutral-200)" }}
      role="dialog"
      aria-modal="true"
      aria-label={copy.guest.placedTitle.join(" ")}
    >
      <h2
        className="m-0"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 34,
          lineHeight: 0.95,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
        }}
      >
        {copy.guest.placedTitle[0]}
        <br />
        {copy.guest.placedTitle[1]}
      </h2>

      <p className="label label-tight mt-2 mb-0" style={{ color: "var(--color-neutral-700)" }}>
        {copy.guest.placedSub}
      </p>

      <div className="docket mt-6">
        <div
          className="flex items-baseline justify-between pb-2"
          style={{ borderBottom: "2px solid var(--color-text)" }}
        >
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: "0.02em",
            }}
          >
            {order.orderCode}
          </span>
          <span className="label" style={{ fontWeight: 700, fontSize: 12 }}>
            {order.tableLabel}
          </span>
        </div>

        <p className="label label-tight py-3 mb-0" style={{ color: "var(--color-neutral-700)" }}>
          {guestName} · {order.tableLabel}
        </p>

        {order.lines.map((line) => (
          <div
            key={line.menuItemId}
            className="flex items-center gap-[10px] py-[6px]"
            style={{ borderTop: "1px solid var(--color-divider)" }}
          >
            {line.imageUrl && (
              <Thumb src={line.imageUrl} size={32} borderWidth={1.5} contrast={false} />
            )}
            <span
              style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, minWidth: 26 }}
            >
              {line.qty}×
            </span>
            <span style={{ fontSize: 14 }}>{line.name}</span>
            <Leader />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14 }}>
              {formatINR(line.lineTotal)}
            </span>
          </div>
        ))}

        <div
          className="mt-2 flex items-baseline justify-between pt-3"
          style={{ borderTop: "2px solid var(--color-text)" }}
        >
          <span className="label" style={{ fontWeight: 700, letterSpacing: "0.16em" }}>
            {copy.guest.total}
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22 }}>
            {formatINR(order.total)}
          </span>
        </div>

        <div className="mt-4">
          <Stamp>{copy.guest.sentToKitchen}</Stamp>
        </div>
      </div>

      <button
        type="button"
        onClick={onTrack}
        className="btn btn-primary btn-block mt-6"
        style={{
          minHeight: 52,
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: "0.06em",
        }}
      >
        <span>{copy.guest.trackOrder}</span>
        <span aria-hidden>→</span>
      </button>

      <button
        type="button"
        onClick={onBackToMenu}
        className="btn btn-quiet mt-3 w-full"
        style={{ minHeight: 52, fontSize: 12 }}
      >
        {copy.guest.orderSomethingElse}
      </button>
    </div>
  );
}
