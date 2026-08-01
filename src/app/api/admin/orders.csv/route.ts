import { jsonError } from "@/lib/api";
import { requireOwner } from "@/lib/auth";
import { getRestaurant } from "@/lib/menu";
import { paiseToRupees } from "@/lib/money";
import { getOrderHistory } from "@/lib/orders";
import { cafeDayKey, dayRange, formatClock, formatDate } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Order history as CSV, one row per line item.
 *
 * Line-level rather than order-level because that is what the owner's
 * accountant actually wants — per-item totals for the month, not a column of
 * order sums they have to unpack.
 *
 * Amounts are written in rupees with two decimals: this file is read by a
 * human in a spreadsheet, and paise counts are exactly the readability
 * problem the brief warned about.
 */

/**
 * Escape a CSV field.
 *
 * The leading-character check is the important part. A value beginning
 * `=`, `+`, `-` or `@` is interpreted by Excel and Sheets as a *formula* —
 * a guest who names themselves `=HYPERLINK(...)` would otherwise get their
 * text executed when the owner opens the export. Prefixing a single quote
 * neutralises it while still displaying the original text.
 */
function csvField(value: string | number): string {
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    await requireOwner();

    const url = new URL(request.url);
    const today = cafeDayKey(Date.now());
    const fromKey = url.searchParams.get("from") ?? today;
    const toKey = url.searchParams.get("to") ?? today;

    const restaurant = await getRestaurant();
    const orders = await getOrderHistory(restaurant.id, {
      ...dayRange(fromKey, toKey),
      limit: 2000,
    });

    const header = [
      "order_code",
      "date",
      "time",
      "table",
      "guest",
      "status",
      "item",
      "qty",
      "unit_price_inr",
      "line_total_inr",
      "order_total_inr",
      "note",
    ];

    const rows = orders.flatMap((order) =>
      order.lines.map((line) =>
        [
          order.orderCode,
          formatDate(order.placedAt),
          formatClock(order.placedAt),
          order.tableLabel,
          order.guestName,
          order.status,
          line.nameSnapshot,
          line.qty,
          paiseToRupees(line.priceSnapshot).toFixed(2),
          paiseToRupees(line.lineTotal).toFixed(2),
          paiseToRupees(order.total).toFixed(2),
          order.note ?? "",
        ]
          .map(csvField)
          .join(","),
      ),
    );

    // CRLF and a UTF-8 BOM: without the BOM, Excel on Windows renders the ₹
    // sign and any Gujarati in a guest's name as mojibake.
    const body = `﻿${[header.map(csvField).join(","), ...rows].join("\r\n")}\r\n`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tablekit-orders-${fromKey}-to-${toKey}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
