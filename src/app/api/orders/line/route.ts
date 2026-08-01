import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, NO_STORE } from "@/lib/api";
import { editOrderLine } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Adjust a line on an order the kitchen has not started yet.
 *
 * Authorised by the order's own token — a guest can only edit an order they
 * hold the secret for. `editOrderLine` re-checks the status inside the
 * transaction, so an order that flips to `preparing` between the tap and the
 * write is rejected rather than silently changed under the chef.
 */
const Body = z.object({
  token: z.string().min(1).max(256),
  menuItemId: z.string().min(1).max(64),
  delta: z.number().int().min(-20).max(20),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That change didn't look right.", code: "bad_request" },
        { status: 400, headers: NO_STORE },
      );
    }

    const order = await editOrderLine(
      parsed.data.token,
      parsed.data.menuItemId,
      parsed.data.delta,
    );

    // `null` means the guest emptied the order, which cancels it rather than
    // leaving a zero-rupee docket on the pass.
    return NextResponse.json({ order, cancelled: order === null }, { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
