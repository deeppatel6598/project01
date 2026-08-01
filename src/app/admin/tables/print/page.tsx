/* eslint-disable @next/next/no-img-element -- inline data: URLs, see below. */

import Link from "next/link";

import { getRestaurant } from "@/lib/menu";
import { publicOrigin, qrDataUrl } from "@/lib/qr";
import { listTables, tableUrl } from "@/lib/tables";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * The QR print sheet.
 *
 * A4, six to a page, table label under each code, cut lines between. This is
 * the artifact that decides whether the system actually gets deployed on
 * tables — an owner who has to screenshot codes one at a time will do it once
 * and give up, so the whole set comes off one Cmd-P.
 *
 * Every code is an inline data URL: no image requests means no half-rendered
 * sheet, which matters because a sheet that prints three blank cells still
 * gets cut up and taped down.
 *
 * Retired tables are excluded — printing a sticker that dead-ends is worse
 * than not printing one.
 */
export default async function PrintSheetPage() {
  const restaurant = getRestaurant();
  const tables = listTables(restaurant.id).filter((table) => table.isActive);
  const origin = await publicOrigin();

  const cells = await Promise.all(
    tables.map(async (table) => ({
      table,
      qr: await qrDataUrl(tableUrl(table.code, origin), 600),
    })),
  );

  return (
    <>
      <div
        className="no-print mb-6 flex flex-wrap items-center justify-between gap-4 p-4"
        style={{ border: "2px solid var(--color-text)" }}
      >
        <div>
          <p className="label label-wide m-0" style={{ color: "var(--color-neutral-700)" }}>
            {cells.length} active tables · A4 · 6 per page
          </p>
          <p className="m-0 mt-1" style={{ fontSize: 13 }}>
            Print at 100% scale — do not use “fit to page”, it shrinks the codes. Cut along the
            rules.
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/admin/tables" className="btn btn-quiet">
            Back
          </Link>
          <PrintButton />
        </div>
      </div>

      <div
        className="qr-sheet grid"
        style={{ gridTemplateColumns: "repeat(2, 1fr)", background: "#fff" }}
      >
        {cells.map(({ table, qr }) => (
          <figure
            key={table.id}
            className="qr-cell m-0 flex flex-col items-center gap-2 p-6 text-center"
            style={{ border: "1px dashed var(--color-neutral-400)", breakInside: "avoid" }}
          >
            <div
              className="label label-wide"
              style={{ color: "var(--color-neutral-700)", fontSize: 10 }}
            >
              Scan to order
            </div>

            <img
              src={qr}
              alt=""
              width={180}
              height={180}
              style={{ width: 180, height: 180, border: "2px solid var(--color-text)" }}
            />

            <figcaption
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 22,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              {table.label}
            </figcaption>

            <div className="label" style={{ fontSize: 9, color: "var(--color-neutral-600)" }}>
              {restaurant.name}
            </div>
          </figure>
        ))}
      </div>
    </>
  );
}
