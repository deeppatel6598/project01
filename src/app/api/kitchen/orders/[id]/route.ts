import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, NO_STORE } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { advanceOrder, cancelOrder, getOrder, OrderError } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["advance", "cancel"]),
});

/**
 * Move a docket. Staff only, and scoped to the signed-in user's restaurant —
 * an authenticated staff member of one cafe must not be able to advance
 * another cafe's order by pasting its id.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireStaff();
    const { id } = await context.params;

    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Unknown action.", code: "bad_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    const existing = getOrder(id);
    if (!existing || existing.restaurantId !== session.restaurantId) {
      throw new OrderError("order_not_found", "Order not found");
    }

    const order = parsed.data.action === "advance" ? advanceOrder(id) : cancelOrder(id);

    return NextResponse.json({ order }, { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
