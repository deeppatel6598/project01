import Link from "next/link";

import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";
import { publicOrigin, qrDataUrl } from "@/lib/qr";
import { listTables, tableUrl } from "@/lib/tables";

import { AddTableForm, TableRow } from "./table-row";

export const dynamic = "force-dynamic";

/** `/admin/tables` — the tables, their codes, and the QR artwork. */
export default async function AdminTablesPage() {
  const restaurant = getRestaurant();
  const tables = listTables(restaurant.id);
  const origin = await publicOrigin();

  const rows = await Promise.all(
    tables.map(async (table) => {
      const url = tableUrl(table.code, origin);
      return { table, url, qr: await qrDataUrl(url, 320) };
    }),
  );

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
          {copy.admin.nav.tables}
        </h1>

        <Link href="/admin/tables/print" className="btn btn-primary" prefetch={false}>
          {copy.admin.printSheet} →
        </Link>
      </div>

      <AddTableForm />

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>QR</th>
              <th>Table</th>
              <th>Link</th>
              <th style={{ width: 220 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ table, url, qr }) => (
              <TableRow key={table.id} table={table} url={url} qr={qr} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
