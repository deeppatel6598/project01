"use client";

import { useCallback, useEffect, useState } from "react";

import { Thumb } from "@/components/thumb";
import { ConnectionDot, EmptyCell, Stamp } from "@/components/ui";
import { useChime } from "@/hooks/use-chime";
import { useLiveOrders } from "@/hooks/use-live-orders";
import { copy } from "@/lib/copy";
import { formatINR } from "@/lib/money";
import { formatElapsed, minutesSince } from "@/lib/time";
import type { Order, OrderStage } from "@/lib/types";

/**
 * The pass.
 *
 * Dark, because it is a working screen in a low-light service area — but a
 * warm dark, the same espresso the guest menu is written in rather than a
 * blue-black admin panel. The split from the guest's light menu is
 * functional, not decorative.
 *
 * Three columns, each with its own status colour so a chef reads the board by
 * shape and hue from two metres away, and the one orchestrated moment in the
 * whole product: a new docket landing.
 */

/** A docket waiting longer than this turns its timer red. */
const LATE_MINUTES = 10;

const COLUMNS: Array<{
  stage: OrderStage;
  label: string;
  accent: string;
  empty: string;
}> = [
  {
    stage: "new",
    label: copy.kitchen.columns.new,
    accent: "var(--color-primary-400)",
    empty: copy.kitchen.empty.new,
  },
  {
    stage: "preparing",
    label: copy.kitchen.columns.preparing,
    accent: "var(--color-gold-300)",
    empty: copy.kitchen.empty.preparing,
  },
  {
    stage: "served",
    label: copy.kitchen.columns.served,
    accent: "var(--color-live)",
    empty: copy.kitchen.empty.served,
  },
];

export function KitchenBoard() {
  const chime = useChime();
  const { orders, connection, arrivedIds, act } = useLiveOrders(chime.play);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The elapsed timers are why this ticks. One interval for the whole board
  // rather than one per docket.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const confirmCancel = useCallback(
    (order: Order) => {
      // Cancel sits behind a confirm: it is the one action here that cannot be
      // undone, and the guest is not told, so somebody has to walk over.
      if (window.confirm(copy.kitchen.confirmCancel(order.orderCode))) {
        void act(order.id, "cancel");
      }
    },
    [act],
  );

  const byStage = (stage: OrderStage) => orders.filter((order) => order.status === stage);

  const counts = {
    new: byStage("new").length,
    preparing: byStage("preparing").length,
    served: byStage("served").length,
  };

  return (
    <main
      className="on-dark dark-wash flex min-h-dvh flex-col gap-6 p-6 md:p-8"
      style={{ color: "var(--color-dark-text)" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="label m-0" style={{ color: "var(--color-primary-300)" }}>
            {copy.kitchen.kicker}
          </p>
          <h1 className="m-0 mt-1" style={{ fontSize: 34, color: "var(--color-dark-text)" }}>
            {copy.kitchen.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatPill label={copy.kitchen.columns.new} value={counts.new} accent="var(--color-primary-400)" />
          <StatPill label={copy.kitchen.columns.preparing} value={counts.preparing} accent="var(--color-gold-300)" />
          <StatPill label={copy.kitchen.columns.served} value={counts.served} accent="var(--color-live)" />

          <ConnectionDot state={connection} />

          <button
            type="button"
            onClick={chime.enabled ? chime.disable : chime.enable}
            className="btn btn-on-dark"
            style={
              chime.enabled
                ? { borderColor: "var(--color-primary-500)", color: "var(--color-primary-300)" }
                : undefined
            }
            aria-pressed={chime.enabled}
          >
            {chime.enabled ? copy.kitchen.soundOff : copy.kitchen.soundOn}
          </button>

          <form action="/api/auth/sign-out" method="post">
            <button type="submit" className="btn btn-on-dark">
              {copy.kitchen.signOut}
            </button>
          </form>
        </div>
      </header>

      <div
        className="grid items-start gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(288px, 1fr))" }}
      >
        {COLUMNS.map((column) => {
          const columnOrders = byStage(column.stage);

          return (
            <section
              key={column.stage}
              aria-label={column.label}
              className="flex flex-col gap-4 rounded-2xl p-4"
              style={{
                background: "var(--color-dark-800)",
                border: "1px solid var(--color-dark-700)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="rounded-full"
                  style={{ width: 10, height: 10, background: column.accent }}
                />
                <h2
                  className="m-0"
                  style={{ fontSize: 15, letterSpacing: "0.04em", color: column.accent }}
                >
                  {column.label}
                </h2>
                <span className="flex-1" />
                <span
                  className="numeric label"
                  style={{ color: "var(--color-dark-faint)", fontSize: 12 }}
                >
                  {columnOrders.length}
                </span>
              </div>

              {columnOrders.map((order) => (
                <Docket
                  key={order.id}
                  order={order}
                  nowMs={nowMs}
                  isNew={arrivedIds.has(order.id)}
                  onAdvance={() => void act(order.id, "advance")}
                  onCancel={() => confirmCancel(order)}
                />
              ))}

              {columnOrders.length === 0 && <EmptyCell tone="dark">{column.empty}</EmptyCell>}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function StatPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{ background: "var(--color-dark-700)" }}
    >
      <span className="label" style={{ color: "var(--color-dark-faint)", fontSize: 10 }}>
        {label}
      </span>
      <span className="numeric" style={{ color: accent, fontWeight: 700, fontSize: 14 }}>
        {value}
      </span>
    </span>
  );
}

/* ── one docket ────────────────────────────────────────────────────────── */

function Docket({
  order,
  nowMs,
  isNew,
  onAdvance,
  onCancel,
}: {
  order: Order;
  nowMs: number;
  isNew: boolean;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const served = order.status === "served";
  const late = !served && minutesSince(order.placedAt, nowMs) > LATE_MINUTES;

  return (
    <article className={`docket ${isNew ? "docket-in" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span
          className="numeric"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}
        >
          {order.orderCode}
        </span>
        <span
          className="numeric tag"
          style={
            late
              ? { background: "var(--color-primary-100)", color: "var(--color-primary-800)" }
              : { background: "var(--color-surface-2)", color: "var(--color-text-faint)" }
          }
        >
          {formatElapsed(order.placedAt, nowMs)}
        </span>
      </div>

      {/* The table label is the single most-read thing on this screen —
          somebody is carrying a tray and looking for where it goes. */}
      <div className="mt-2" style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
        {order.tableLabel}
      </div>

      <div className="label mt-0.5 pb-3" style={{ color: "var(--color-text-faint)" }}>
        {order.guestName}
      </div>

      <div className="flex flex-col gap-1.5">
        {order.lines.map((line) => (
          <div
            key={line.id}
            className="flex items-center gap-2.5 rounded-lg p-1.5"
            style={{ background: "var(--color-surface-2)" }}
          >
            {line.imageUrlSnapshot && (
              <Thumb src={line.imageUrlSnapshot} size={34} radius="var(--radius-xs)" />
            )}
            <span
              className="numeric inline-flex items-center justify-center rounded-md px-1.5"
              style={{
                minWidth: 26,
                fontSize: 13,
                fontWeight: 700,
                background: "var(--color-primary-100)",
                color: "var(--color-primary-800)",
              }}
            >
              {line.qty}×
            </span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{line.nameSnapshot}</span>
          </div>
        ))}
      </div>

      {order.note && (
        <p
          className="mt-3 mb-0 rounded-lg px-3 py-2"
          style={{
            background: "var(--color-gold-50)",
            borderLeft: "3px solid var(--color-gold-400)",
            color: "var(--color-gold-700)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {order.note}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="label" style={{ color: "var(--color-text-faint)" }}>
          {copy.kitchen.total}
        </span>
        <span
          className="numeric"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}
        >
          {formatINR(order.total)}
        </span>
      </div>

      {served ? (
        <div className="mt-4">
          <Stamp>{copy.kitchen.served}</Stamp>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onAdvance} className="btn btn-primary flex-1">
            {order.status === "new" ? copy.kitchen.start : copy.kitchen.markServed}
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label={copy.kitchen.cancel}
            className="btn btn-quiet btn-icon shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </article>
  );
}
