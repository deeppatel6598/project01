import { NextResponse } from "next/server";

import { jsonError, NO_STORE } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { getBoardOrders } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pass board, staff only.
 *
 * This is also the reconciliation endpoint: the board polls it every 20
 * seconds regardless of stream health and replaces its state wholesale with
 * the response. That is what makes "kill the wifi for 30 seconds and restore
 * it" leave the board correct — a board rebuilt from the server's list cannot
 * hold a duplicate or a phantom, however many events it missed.
 */
export async function GET() {
  try {
    const session = await requireStaff();

    return NextResponse.json(
      { orders: getBoardOrders(session.restaurantId), serverNow: Date.now() },
      { headers: NO_STORE },
    );
  } catch (error) {
    return jsonError(error);
  }
}
