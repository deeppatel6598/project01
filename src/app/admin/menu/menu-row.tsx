"use client";

import { useActionState, useTransition } from "react";

import { VegDot } from "@/components/ui";
import { copy } from "@/lib/copy";
import { paiseToRupees } from "@/lib/money";
import type { MenuItem } from "@/lib/types";

import { saveItemPrice, toggleItemAvailability, type FieldState } from "../actions";

/**
 * One editable menu row.
 *
 * The price field is a form rather than a live-saving input: prices are the
 * one thing here that changes what a guest is charged, so committing them
 * takes a deliberate act. Availability is the opposite — the kitchen runs out
 * of nachos mid-service and wants one tap.
 */
export function MenuRow({ item }: { item: MenuItem }) {
  const [priceState, priceAction, pricePending] = useActionState<FieldState, FormData>(
    saveItemPrice,
    { error: null, ok: false },
  );
  const [togglePending, startToggle] = useTransition();

  return (
    <tr>
      <td>
        <span className="flex items-center gap-2">
          <VegDot isVeg={item.isVeg} />
          <span style={{ fontWeight: 600 }}>{item.name}</span>
        </span>
        {item.description && (
          <span className="block" style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
            {item.description}
          </span>
        )}
        {priceState.error && (
          <span role="alert" className="block" style={{ fontSize: 12, color: "var(--color-accent-700)" }}>
            {priceState.error}
          </span>
        )}
      </td>

      <td>
        <form action={priceAction} className="flex items-center gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <input
            className="input"
            name="price"
            inputMode="decimal"
            defaultValue={String(paiseToRupees(item.price))}
            aria-label={`Price for ${item.name} in rupees`}
            style={{ minHeight: 36, padding: "6px 10px", fontSize: 14, width: 90 }}
          />
          <button type="submit" className="btn btn-quiet" style={{ minHeight: 36, padding: "0 10px" }}>
            {pricePending ? copy.admin.saving : priceState.ok ? copy.admin.saved : copy.admin.save}
          </button>
        </form>
      </td>

      <td>
        <button
          type="button"
          role="switch"
          aria-checked={item.isAvailable}
          disabled={togglePending}
          onClick={() =>
            startToggle(() => void toggleItemAvailability(item.id, !item.isAvailable))
          }
          className="btn"
          style={{
            minHeight: 36,
            padding: "0 12px",
            border: "2px solid var(--color-text)",
            background: item.isAvailable ? "transparent" : "var(--color-text)",
            color: item.isAvailable ? "var(--color-text)" : "var(--color-neutral-100)",
          }}
        >
          {item.isAvailable ? copy.admin.available : copy.admin.soldOut}
        </button>
      </td>
    </tr>
  );
}
