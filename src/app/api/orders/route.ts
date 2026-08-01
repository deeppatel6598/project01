import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, jsonError, NO_STORE } from "@/lib/api";
import { LIMITS } from "@/lib/limits";
import { placeOrder } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The guest write surface. This one route is everything an anonymous client
 * can do to the database.
 *
 * Note what the schema does *not* accept: no price, no total, no order code,
 * no status. Those are not validated-then-trusted, they are simply not part
 * of the input — `placeOrder` reads all of them from the menu itself.
 */
const PlaceOrderBody = z.object({
  tableCode: z.string().min(1).max(32),
  guestName: z.string().max(200).optional().default(""),
  guestPhone: z.string().max(40).nullish(),
  note: z.string().max(1000).nullish(),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().min(1).max(64),
        qty: z.number().int().positive(),
      }),
    )
    .min(1)
    // Generous relative to LIMITS.maxLines — the engine merges duplicates
    // first, so this only rejects payloads that are abusive rather than
    // merely long.
    .max(LIMITS.maxLines * 4),
});

export async function POST(request: Request) {
  try {
    const parsed = PlaceOrderBody.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That order didn't look right. Try again.", code: "bad_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    const { order, publicToken } = placeOrder({
      tableCode: parsed.data.tableCode,
      guestName: parsed.data.guestName,
      guestPhone: parsed.data.guestPhone ?? null,
      note: parsed.data.note ?? null,
      lines: parsed.data.lines,
      clientIp: clientIp(request),
    });

    return NextResponse.json(
      {
        // The token is returned exactly once, to the client that placed the
        // order. It is the only key to reading this order back.
        publicToken,
        order: {
          id: order.id,
          // Echoed onto the order too, so the client can act on it (edit a
          // line, poll its status) without pairing it up itself.
          token: publicToken,
          orderCode: order.orderCode,
          tableLabel: order.tableLabel,
          status: order.status,
          guestName: order.guestName,
          note: order.note,
          total: order.total,
          placedAt: order.placedAt,
          lines: order.lines.map((line) => ({
            menuItemId: line.menuItemId,
            name: line.nameSnapshot,
            qty: line.qty,
            price: line.priceSnapshot,
            lineTotal: line.lineTotal,
            imageUrl: line.imageUrlSnapshot,
          })),
        },
      },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    return jsonError(error);
  }
}
