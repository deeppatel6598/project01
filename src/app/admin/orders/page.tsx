import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";
import { formatINR } from "@/lib/money";
import { getOrderHistory } from "@/lib/orders";
import { cafeDayKey, CAFE_TIMEZONE, dayRange, formatClock, formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * `/admin/orders` — history with a date filter and a CSV export.
 *
 * The filter is a plain GET form, so a filtered view is a URL the owner can
 * bookmark or send to their accountant.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const restaurant = await getRestaurant();

  // A server component rendered per request (`dynamic = "force-dynamic"`),
  // not a client render the compiler has to keep pure.
  // eslint-disable-next-line react-hooks/purity
  const today = cafeDayKey(Date.now());
  const fromKey = from ?? today;
  const toKey = to ?? today;

  const range = dayRange(fromKey, toKey);
  const orders = await getOrderHistory(restaurant.id, range);

  const revenue = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.total, 0);

  const exportHref = `/api/admin/orders.csv?from=${encodeURIComponent(fromKey)}&to=${encodeURIComponent(toKey)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 34,
            
          }}
        >
          {copy.admin.nav.orders}
        </h1>

        <a href={exportHref} className="btn btn-primary" download>
          {copy.admin.exportCsv} →
        </a>
      </div>

      <form
        className="panel flex flex-wrap items-end gap-3 p-4"
      >
        <label className="field">
          <span>From</span>
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={fromKey}
            style={{ minHeight: 40 }}
          />
        </label>

        <label className="field">
          <span>To</span>
          <input
            className="input"
            type="date"
            name="to"
            defaultValue={toKey}
            style={{ minHeight: 40 }}
          />
        </label>

        <button type="submit" className="btn btn-quiet" style={{ minHeight: 40 }}>
          Apply
        </button>

        <span className="label" style={{ color: "var(--color-neutral-700)" }}>
          {orders.length} orders · {formatINR(revenue)} · times in {CAFE_TIMEZONE}
        </span>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Date</th>
              <th>Time</th>
              <th>Table</th>
              <th>Guest</th>
              <th>Items</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>
                  {order.orderCode}
                </td>
                <td>{formatDate(order.placedAt)}</td>
                <td>{formatClock(order.placedAt)}</td>
                <td>{order.tableLabel}</td>
                <td>{order.guestName}</td>
                <td>
                  {order.lines.map((line) => `${line.qty}× ${line.nameSnapshot}`).join(", ")}
                </td>
                <td className="label label-tight">{order.status}</td>
                <td style={{ textAlign: "right" }}>{formatINR(order.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {orders.length === 0 && (
          <p className="label label-tight mt-4" style={{ color: "var(--color-neutral-700)" }}>
            No orders in that range
          </p>
        )}
      </div>
    </div>
  );
}
