"use client";

import { useEffect } from "react";

import { Thumb } from "@/components/thumb";
import { EmptyCell, Stepper } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatINR } from "@/lib/money";
import { formatClock, formatElapsed } from "@/lib/time";
import { ORDER_STAGES, type GuestOrderView } from "@/lib/types";

/**
 * "Your orders" — the guest's view of what they have sent to the pass.
 *
 * The original brief skipped this screen because it would need a per-order
 * secret. The design ships it, so the secret exists: every order in this list
 * was fetched with a token held in `sessionStorage`. A guest sees their own
 * orders and nothing else — not the table's, not the room's.
 *
 * While an order is still `new` the lines carry steppers, because the kitchen
 * has not started it and changing your mind is free. The moment it flips to
 * `preparing` the steppers are replaced by a sentence explaining why.
 */

export function OrdersScreen({
  open,
  orders,
  tableLabel,
  nowMs,
  busyItemId,
  onEditLine,
  onClose,
}: {
  open: boolean;
  orders: GuestOrderView[];
  tableLabel: string;
  nowMs: number;
  busyItemId: string | null;
  onEditLine: (orderId: string, menuItemId: string, delta: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.guest.ordersTitle}
      className="fixed inset-0 z-50 mx-auto flex flex-col"
      style={{ maxWidth: 480, background: "var(--color-neutral-100)" }}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-3 p-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div>
          <div className="label label-wide" style={{ color: "var(--color-neutral-700)" }}>
            {tableLabel}
          </div>
          <h2
            className="m-0 mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 26,
              lineHeight: 1,
              
            }}
          >
            {copy.guest.ordersTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to menu"
          className="btn btn-quiet btn-icon"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {orders.length === 0 && <EmptyCell>{copy.guest.nothingOrdered}</EmptyCell>}

        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            nowMs={nowMs}
            busyItemId={busyItemId}
            onEditLine={onEditLine}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="btn btn-primary btn-block shrink-0"
        style={{
          minHeight: 60,
          borderTop: "1px solid var(--color-border)",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: "0.06em",
        }}
      >
        <span>{copy.guest.backToMenu}</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function OrderCard({
  order,
  nowMs,
  busyItemId,
  onEditLine,
}: {
  order: GuestOrderView;
  nowMs: number;
  busyItemId: string | null;
  onEditLine: (orderId: string, menuItemId: string, delta: number) => void;
}) {
  const cancelled = order.status === "cancelled";
  const editable = order.status === "new";
  const stageIndex = ORDER_STAGES.indexOf(order.status as (typeof ORDER_STAGES)[number]);

  return (
    <article className="mb-4" style={{ border: "1px solid var(--color-border)" }}>
      <div
        className="flex items-baseline justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: "0.02em",
          }}
        >
          {order.orderCode}
        </span>
        <span className="label" style={{ color: "var(--color-neutral-700)" }}>
          {copy.guest.placedAt(formatClock(order.placedAt))}
          {!cancelled && ` · ${formatElapsed(order.placedAt, nowMs)}`}
        </span>
      </div>

      {cancelled ? (
        <div
          className="label label-tight px-4 py-3"
          style={{ color: "var(--color-neutral-700)", borderBottom: "1px solid var(--color-border)" }}
        >
          Cancelled
        </div>
      ) : (
        <ol
          className="m-0 grid list-none p-0"
          style={{ gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--color-border)" }}
        >
          {copy.guest.stages.map((name, index) => {
            const reached = index <= stageIndex;
            const rule = reached ? "var(--color-accent)" : "var(--color-neutral-400)";
            const ink = reached ? "#fff" : "var(--color-neutral-600)";

            return (
              <li
                key={name}
                aria-current={index === stageIndex ? "step" : undefined}
                className="flex items-center gap-2 px-3 py-[10px]"
                style={{ borderRight: "1px solid var(--color-divider)", borderTop: `4px solid ${rule}` }}
              >
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    border: `2px solid ${rule}`,
                    background: reached ? "var(--color-accent)" : "transparent",
                    color: ink,
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {index + 1}
                </span>
                <span
                  className="label"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: reached ? "var(--color-text)" : "var(--color-neutral-600)",
                  }}
                >
                  {name}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="px-4 py-3">
        {order.lines.map((line) => (
          <div
            key={line.menuItemId}
            className="flex items-center gap-[10px] py-2"
            style={{ borderBottom: "1px solid var(--color-divider)" }}
          >
            {line.imageUrl && <Thumb src={line.imageUrl} size={40} />}

            <span className="min-w-0 flex-1" style={{ fontSize: 14, fontWeight: 600 }}>
              {!editable && `${line.qty}× `}
              {line.name}
            </span>

            {editable && (
              <Stepper
                qty={line.qty}
                label={line.name}
                disabled={busyItemId === line.menuItemId}
                onDecrement={() => onEditLine(order.id, line.menuItemId, -1)}
                onIncrement={() => onEditLine(order.id, line.menuItemId, 1)}
              />
            )}

            <span
              className="text-right"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 14,
                minWidth: 56,
              }}
            >
              {formatINR(line.lineTotal)}
            </span>
          </div>
        ))}

        {order.note && (
          <p
            className="mt-3 mb-0 px-[10px] py-2"
            style={{
              background: "var(--color-accent-100)",
              borderLeft: "4px solid var(--color-accent)",
              fontSize: 13,
            }}
          >
            {order.note}
          </p>
        )}

        <div
          className="mt-3 flex items-baseline justify-between pt-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <span className="label" style={{ fontWeight: 700, letterSpacing: "0.16em" }}>
            {copy.guest.total}
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20 }}>
            {formatINR(order.total)}
          </span>
        </div>

        {editable && (
          <p
            className="label label-tight mt-3 mb-0"
            style={{ color: "var(--color-accent-700)" }}
          >
            {copy.guest.editableUntil}
          </p>
        )}

        {!editable && !cancelled && (
          <p
            className="mt-3 mb-0"
            style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-neutral-700)" }}
          >
            {order.status === "preparing" ? copy.guest.lockedPreparing : copy.guest.lockedServed}
          </p>
        )}
      </div>
    </article>
  );
}
