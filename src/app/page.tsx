import Link from "next/link";

import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";
import { listTables } from "@/lib/tables";

export const dynamic = "force-dynamic";

/**
 * The front door.
 *
 * Nobody in the cafe ever lands here — guests arrive at `/t/<code>` from a
 * sticker and staff bookmark `/kitchen`. This exists for the person setting
 * the system up, so the two surfaces and the table codes are one click away
 * instead of buried in a seed script's output.
 *
 * It deliberately shows no order data. Everything on this page is public by
 * construction.
 */
export default async function HomePage() {
  const restaurant = await getRestaurant();
  const tables = (await listTables(restaurant.id)).filter((table) => table.isActive);
  const sample = tables[3] ?? tables[0];

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="flex flex-wrap items-baseline justify-between gap-6 px-8 pt-6 pb-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex flex-wrap items-baseline gap-4">
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              
            }}
          >
            {copy.brand.product}
          </span>
          <span className="label label-wide" style={{ color: "var(--color-neutral-700)" }}>
            {copy.brand.tagline} · {restaurant.name}
          </span>
        </div>

        <span className="label" style={{ color: "var(--color-neutral-700)" }}>
          {restaurant.isAcceptingOrders ? copy.guest.open(restaurant.hoursLabel) : copy.guest.closed}
        </span>
      </header>

      <main className="grid flex-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <section
          className="flex flex-col gap-4 p-8"
          style={{ borderRight: "1px solid var(--color-border)" }}
        >
          <p className="label label-wide m-0" style={{ color: "var(--color-neutral-700)" }}>
            Guest — /t/&lt;code&gt;
          </p>

          <h1
            className="m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 0.88,
              
            }}
          >
            Scan
            <br />
            the table
          </h1>

          <p className="m-0" style={{ maxWidth: "42ch", textWrap: "pretty" }}>
            A guest sits down, scans the sticker, and lands on that table&rsquo;s menu. No app, no
            login, no typing a table number. They pick items, enter their name, and the order is on
            the pass in under a second.
          </p>

          {sample && (
            <Link href={`/t/${sample.code}`} className="btn btn-primary" style={{ alignSelf: "start" }}>
              Open {sample.label} →
            </Link>
          )}

          <div className="hr" />

          <p className="label m-0" style={{ color: "var(--color-neutral-700)" }}>
            All tables
          </p>

          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {tables.map((table) => (
              <li key={table.id}>
                <Link
                  href={`/t/${table.code}`}
                  className="btn btn-quiet"
                  style={{ minHeight: 36, padding: "0 10px", fontSize: 10 }}
                >
                  {table.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="on-dark flex flex-col gap-4 p-8"
          style={{ background: "var(--color-neutral-900)", color: "var(--color-neutral-100)" }}
        >
          <p className="label label-wide m-0" style={{ color: "var(--color-neutral-400)" }}>
            {copy.kitchen.kicker}
          </p>

          <h2
            className="m-0"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 0.88,
              
            }}
          >
            {copy.kitchen.title}
          </h2>

          <p className="m-0" style={{ maxWidth: "42ch", textWrap: "pretty" }}>
            Three columns — New, Preparing, Served. Dockets land live, the longest wait sits on top,
            and the connection dot says whether the board is streaming, polling or offline. Staff
            sign-in required.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link href="/kitchen" className="btn btn-primary" style={{ alignSelf: "start" }}>
              Open the pass →
            </Link>
            <Link
              href="/admin"
              className="btn"
              style={{
                border: "1px solid var(--color-dark-700)",
                color: "var(--color-neutral-100)",
                alignSelf: "start",
              }}
            >
              Admin
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
