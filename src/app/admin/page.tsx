import Link from "next/link";

import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";
import { formatINR } from "@/lib/money";
import { getBoardOrders, getDayStats } from "@/lib/orders";
import { cafeDayKey, formatClock } from "@/lib/time";

import { AcceptingSwitch } from "./accepting-switch";

export const dynamic = "force-dynamic";

/** `/admin` — today at a glance, and the kill switch. */
export default async function AdminOverview() {
  const restaurant = getRestaurant();
  // A server component rendered per request (`dynamic = "force-dynamic"`),
  // not a client render the compiler has to keep pure.
  // eslint-disable-next-line react-hooks/purity
  const today = cafeDayKey(Date.now());
  const stats = getDayStats(restaurant.id, today);
  const live = getBoardOrders(restaurant.id);

  const open = live.filter((order) => order.status !== "served");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 34,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
          }}
        >
          {copy.admin.today}
        </h1>
        <AcceptingSwitch accepting={restaurant.isAcceptingOrders} />
      </div>

      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          borderTop: "2px solid var(--color-text)",
        }}
      >
        <Stat label="Orders" value={String(stats.orders)} />
        <Stat label="Revenue" value={formatINR(stats.revenue)} />
        <Stat label="Items" value={String(stats.items)} />
        <Stat
          label="Median to serve"
          value={stats.medianMinutesToServe === null ? "—" : `${stats.medianMinutesToServe} min`}
        />
      </div>

      <section>
        <div className="flex items-baseline justify-between">
          <h2
            className="m-0"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 16,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            On the pass now
          </h2>
          <Link href="/kitchen" className="label">
            Open the board →
          </Link>
        </div>

        <div className="hr" />

        {open.length === 0 ? (
          <p className="label label-tight m-0" style={{ color: "var(--color-neutral-700)" }}>
            Nothing waiting
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Table</th>
                  <th>Guest</th>
                  <th>Status</th>
                  <th>Placed</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {open.map((order) => (
                  <tr key={order.id}>
                    <td style={{ fontFamily: "var(--font-heading)", fontWeight: 800 }}>
                      {order.orderCode}
                    </td>
                    <td>{order.tableLabel}</td>
                    <td>{order.guestName}</td>
                    <td className="label label-tight">{order.status}</td>
                    <td>{formatClock(order.placedAt)}</td>
                    <td style={{ textAlign: "right" }}>{formatINR(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-4"
      style={{ borderRight: "1px solid var(--color-divider)" }}
    >
      <div className="label" style={{ color: "var(--color-neutral-700)" }}>
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 30,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
