import { NextResponse } from "next/server";

import { AuthError } from "./auth";
import { copy } from "./copy";
import { OrderError, type OrderErrorCode } from "./orders";

/**
 * The boundary between thrown domain errors and HTTP.
 *
 * Route handlers stay free of try/catch ladders: they throw `OrderError` or
 * `AuthError` and this maps each to a status and a sentence a guest can read.
 * Anything else is a bug, so it becomes a 500 with a generic message — the
 * stack goes to the server log, never to the client.
 */

const STATUS: Record<OrderErrorCode, number> = {
  table_not_found: 404,
  table_inactive: 404,
  not_accepting: 409,
  empty_basket: 400,
  too_many_lines: 400,
  item_unavailable: 409,
  rate_limited: 429,
  order_not_found: 404,
  order_locked: 409,
};

function messageFor(error: OrderError): string {
  switch (error.code) {
    case "table_not_found":
    case "table_inactive":
      return copy.errors.tableNotLinked;
    case "not_accepting":
      return copy.errors.notAccepting;
    case "empty_basket":
      return copy.errors.emptyBasket;
    case "too_many_lines":
      return copy.errors.tooManyLines;
    case "item_unavailable":
      return error.itemName ? copy.errors.itemUnavailable(error.itemName) : copy.errors.generic;
    case "rate_limited":
      return copy.errors.rateLimited;
    case "order_locked":
      return copy.errors.orderLocked;
    case "order_not_found":
      return copy.errors.notFound;
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof OrderError) {
    return NextResponse.json(
      { error: messageFor(error), code: error.code },
      { status: STATUS[error.code] },
    );
  }

  if (error instanceof AuthError) {
    return NextResponse.json(
      {
        error: error.code === "forbidden" ? copy.errors.forbidden : copy.errors.signInFailed,
        code: error.code,
      },
      { status: error.code === "forbidden" ? 403 : 401 },
    );
  }

  console.error("[tablekit] unhandled route error", error);
  return NextResponse.json({ error: copy.errors.generic, code: "internal" }, { status: 500 });
}

/**
 * Best-effort client IP for the rate limiter.
 *
 * Behind a proxy this is the left-most `x-forwarded-for` entry. It is
 * spoofable by a determined client, which is why it is only ever one input to
 * the limiter — the table id is the other, and that one cannot be forged
 * without a real table code.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

/** Guest endpoints must never be cached — availability and status change. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;
