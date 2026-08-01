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
 * Dark, because it is a working screen in a low-light service area, and the
 * split from the guest's light menu is functional rather than decorative.
 * Three columns, and the one orchestrated moment in the whole product — a new
 * docket sliding in.
 */

/** A docket waiting longer than this turns its timer accent-red. */
const LATE_MINUTES = 10;

const COLUMNS: Array<{ stage: OrderStage; label: string; rule: string; empty: string }> = [
  {
    stage: "new",
    label: copy.kitchen.columns.new,
    rule: "var(--color-accent)",
    empty: copy.kitchen.empty.new,
  },
  {
    stage: "preparing",
    label: copy.kitchen.columns.preparing,
    rule: "var(--color-neutral-100)",
    empty: copy.kitchen.empty.preparing,
  },
  {
    stage: "served",
    label: copy.kitchen.columns.served,
    rule: "var(--color-neutral-500)",
    empty: copy.kitchen.empty.served,
  },
];

export function KitchenBoard() {
  const chime = useChime();
  const { orders, connection, arrivedIds, act } = useLiveOrders(chime.play);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The elapsed timers are the reason this ticks. One interval for the whole
  // board rather than one per docket.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const confirmCancel = useCallback(
    (order: Order) => {
      // Cancel sits behind a confirm: it is the one action on this screen that
      // cannot be undone, and the guest is not told, so somebody has to walk
      // over and say so.
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
      className="on-dark flex min-h-dvh flex-col gap-6 p-8"
      style={{ background: "var(--color-neutral-900)", color: "var(--color-neutral-100)" }}
    >
      <header
        className="flex flex-wrap items-end justify-between gap-6 pb-4"
        style={{ borderBottom: "2px solid var(--color-neutral-100)" }}
      >
        <div>
          <p className="label label-wide m-0" style={{ color: "var(--color-neutral-400)" }}>
            {copy.kitchen.kicker}
          </p>
          <h1
            className="m-0 mt-1"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 34,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            {copy.kitchen.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="label flex gap-6" style={{ color: "var(--color-neutral-400)" }}>
            <span>
              {copy.kitchen.columns.new}{" "}
              <b style={{ color: "var(--color-neutral-100)" }}>{counts.new}</b>
            </span>
            <span>
              {copy.kitchen.columns.preparing}{" "}
              <b style={{ color: "var(--color-neutral-100)" }}>{counts.preparing}</b>
            </span>
            <span>
              {copy.kitchen.columns.served}{" "}
              <b style={{ color: "var(--color-neutral-100)" }}>{counts.served}</b>
            </span>
          </div>

          {!chime.enabled ? (
            <button
              type="button"
              onClick={chime.enable}
              className="btn"
              style={{
                border: "2px solid var(--color-neutral-100)",
                color: "var(--color-neutral-100)",
                background: "transparent",
              }}
            >
              {copy.kitchen.soundOn}
            </button>
          ) : (
            <button
              type="button"
              onClick={chime.disable}
              className="btn"
              style={{
                border: "2px solid var(--color-accent)",
                color: "var(--color-accent-400)",
                background: "transparent",
              }}
            >
              {copy.kitchen.soundOff}
            </button>
          )}

          <ConnectionDot state={connection} />

          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="btn"
              style={{
                border: "2px solid var(--color-neutral-700)",
                color: "var(--color-neutral-400)",
                background: "transparent",
              }}
            >
              {copy.kitchen.signOut}
            </button>
          </form>
        </div>
      </header>

      <div
        className="grid items-start gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
      >
        {COLUMNS.map((column) => {
          const columnOrders = byStage(column.stage);

          return (
            <section
              key={column.stage}
              aria-label={column.label}
              className="flex flex-col gap-4 pt-3"
              style={{ borderTop: `2px solid ${column.rule}` }}
            >
              <div className="flex items-baseline justify-between">
                <h2
                  className="m-0"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 14,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: column.rule,
                  }}
                >
                  {column.label}
                </h2>
                <span className="label" style={{ color: "var(--color-neutral-500)" }}>
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
      <div className="flex items-baseline justify-between gap-3">
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: "0.02em",
          }}
        >
          {order.orderCode}
        </span>
        <span
          className="label"
          style={{
            fontWeight: 700,
            fontSize: 12,
            color: late ? "var(--color-accent)" : "var(--color-neutral-700)",
          }}
        >
          {formatElapsed(order.placedAt, nowMs)}
        </span>
      </div>

      {/* The table number is the single most-read thing on this screen —
          somebody is carrying a tray and looking for where it goes. */}
      <div
        className="mt-2"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 30,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
        }}
      >
        {order.tableLabel}
      </div>

      <div
        className="label label-tight mt-1 pb-3"
        style={{ color: "var(--color-neutral-700)", borderBottom: "2px solid var(--color-text)" }}
      >
        {order.guestName}
      </div>

      {order.lines.map((line) => (
        <div
          key={line.id}
          className="flex items-center gap-[10px] py-[6px]"
          style={{ borderBottom: "1px solid var(--color-divider)" }}
        >
          {line.imageUrlSnapshot && (
            <Thumb src={line.imageUrlSnapshot} size={36} borderWidth={1.5} contrast={false} />
          )}
          <span
            style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, minWidth: 26 }}
          >
            {line.qty}×
          </span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{line.nameSnapshot}</span>
        </div>
      ))}

      {order.note && (
        <p
          className="mt-3 mb-0 px-[10px] py-2"
          style={{
            background: "var(--color-accent-100)",
            borderLeft: "4px solid var(--color-accent)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {order.note}
        </p>
      )}

      <div className="mt-3 flex items-baseline justify-between">
        <span className="label" style={{ fontWeight: 700, letterSpacing: "0.16em" }}>
          {copy.kitchen.total}
        </span>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 18 }}>
          {formatINR(order.total)}
        </span>
      </div>

      {served ? (
        <div className="mt-4">
          <Stamp size={13}>{copy.kitchen.served}</Stamp>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onAdvance} className="btn btn-primary flex-1" style={{ minHeight: 48 }}>
            {order.status === "new" ? copy.kitchen.start : copy.kitchen.markServed}
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label={copy.kitchen.cancel}
            className="btn btn-quiet btn-icon shrink-0"
            style={{ width: 48, height: 48 }}
          >
            ✕
          </button>
        </div>
      )}
    </article>
  );
}
