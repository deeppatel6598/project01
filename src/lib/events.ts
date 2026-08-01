import { EventEmitter } from "node:events";

import type { Order } from "./types";

/**
 * The in-process event bus behind the kitchen board's live updates.
 *
 * A guest placing an order and the pass watching for one are two requests in
 * the same Node process, so a plain emitter is all the plumbing realtime
 * needs here — no broker, no polling loop on the server side.
 *
 * This is the one piece with a deployment constraint: it works on a single
 * long-lived Node instance (`next start`, a container, a VM) and not across
 * serverless instances that each hold their own memory. The board is built to
 * survive that anyway — it reconciles on a 20s poll and shows an amber dot
 * when the stream is not carrying it — so a serverless deploy degrades to
 * polling rather than going quiet. `docs/DEPLOYMENT.md` covers swapping this
 * for Postgres `LISTEN/NOTIFY` or Supabase Realtime.
 */

export type OrderEvent =
  | { type: "order.placed"; order: Order }
  | { type: "order.updated"; order: Order }
  | { type: "order.cancelled"; orderId: string; restaurantId: string };

type Listener = (event: OrderEvent) => void;

declare global {
  var __tablekitBus: EventEmitter | undefined;
}

function bus(): EventEmitter {
  if (!globalThis.__tablekitBus) {
    const emitter = new EventEmitter();
    // One listener per open kitchen tab. A cafe might have the pass screen,
    // the counter, and the owner's phone all watching; the default cap of 10
    // would start printing warnings well before that is unreasonable.
    emitter.setMaxListeners(200);
    globalThis.__tablekitBus = emitter;
  }
  return globalThis.__tablekitBus;
}

export function publish(event: OrderEvent): void {
  bus().emit("order", event);
}

/** Subscribe to order events. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  const emitter = bus();
  emitter.on("order", listener);
  return () => {
    emitter.off("order", listener);
  };
}
