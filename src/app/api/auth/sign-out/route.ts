import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Sign out.
 *
 * POST only. A GET would let any page log a staff member out with an
 * `<img src="/api/auth/sign-out">` — harmless as attacks go, but it would
 * happen mid-service.
 */
export async function POST(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
