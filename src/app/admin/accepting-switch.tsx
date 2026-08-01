"use client";

import { useTransition } from "react";

import { copy } from "@/lib/copy";

import { setAcceptingOrders } from "./actions";

/**
 * The kill switch.
 *
 * When the kitchen is slammed the owner turns this off: the menu stays
 * readable — a guest can still see what the cafe serves — but `placeOrder`
 * refuses everything, and the guest's basket bar says why rather than failing
 * at the last tap.
 */
export function AcceptingSwitch({ accepting }: { accepting: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className="label" style={{ color: "var(--color-neutral-700)" }}>
        {copy.admin.acceptingOrders}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={accepting}
        disabled={pending}
        onClick={() => startTransition(() => void setAcceptingOrders(!accepting))}
        className="btn"
        style={{
          minHeight: 44,
          border: "2px solid var(--color-text)",
          background: accepting ? "var(--color-accent)" : "transparent",
          color: accepting ? "#fff" : "var(--color-text)",
        }}
      >
        {accepting ? "On" : "Paused"}
      </button>
    </div>
  );
}
