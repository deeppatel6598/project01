import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, NO_STORE } from "@/lib/api";
import { getGuestOrders } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read back the orders this guest placed.
 *
 * POST rather than GET because the tokens are secrets: a GET would put them
 * in the query string, and from there into access logs, referrer headers and
 * browser history. Nothing here is cacheable anyway.
 *
 * A client with no tokens gets an empty array. There is no route anywhere
 * that lists orders by table — knowing a table code must not be enough to
 * read the names and notes of everyone who sat there today.
 */
const Body = z.object({
  tokens: z.array(z.string().min(1).max(256)).max(50),
});

export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ orders: [] }, { status: 200, headers: NO_STORE });
    }

    return NextResponse.json(
      { orders: await getGuestOrders(parsed.data.tokens) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return jsonError(error);
  }
}
