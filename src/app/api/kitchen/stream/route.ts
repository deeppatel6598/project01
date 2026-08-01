import { jsonError } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { subscribe } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events for the kitchen board.
 *
 * SSE rather than WebSockets: the traffic is one-directional (the board only
 * listens; its actions go over ordinary POSTs), it survives proxies that
 * mangle upgrade headers, and `EventSource` reconnects on its own. On cafe
 * wifi that last property matters more than the protocol.
 *
 * Every event is filtered to the subscriber's restaurant before it is
 * written, so this stream cannot become a side channel onto another cafe's
 * orders.
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireStaff();
  } catch (error) {
    return jsonError(error);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (payload: unknown, event = "message") => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          // The client hung up between the check and the write.
          closed = true;
        }
      };

      // Tell the client it is live straight away, so the connection dot can
      // go green without waiting for the first order of the day.
      send({ serverNow: Date.now() }, "ready");

      const unsubscribe = subscribe((event) => {
        const restaurantId =
          "order" in event ? event.order.restaurantId : event.restaurantId;
        if (restaurantId !== session.restaurantId) return;
        send(event, "order");
      });

      // Comment frames every 25s. They keep proxies and load balancers from
      // reaping an idle stream during a quiet afternoon, and they are how the
      // browser notices a connection that died without a FIN.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keep-alive ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold events
      // until the buffer fills — turning a live board into a batch one.
      "X-Accel-Buffering": "no",
    },
  });
}
