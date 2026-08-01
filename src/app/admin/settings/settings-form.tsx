"use client";

import { useActionState } from "react";

import { copy } from "@/lib/copy";
import type { Restaurant } from "@/lib/types";

import { saveSettings, type FieldState } from "../actions";

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, pending] = useActionState<FieldState, FormData>(saveSettings, {
    error: null,
    ok: false,
  });

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 p-4"
      style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
    >
      <label className="field">
        <span>Cafe name</span>
        <input className="input" name="name" defaultValue={restaurant.name} required />
      </label>

      <label className="field">
        <span>Address</span>
        <textarea className="input" name="address" defaultValue={restaurant.address} rows={3} />
      </label>

      <label className="field">
        <span>Phone</span>
        <input className="input" name="phone" defaultValue={restaurant.phone} inputMode="tel" />
      </label>

      <label className="field">
        <span>Hours</span>
        <input className="input" name="hoursLabel" defaultValue={restaurant.hoursLabel} />
        <span className="label label-tight" style={{ color: "var(--color-neutral-600)", fontWeight: 400 }}>
          Shown on the guest menu, e.g. 11:00–23:00
        </span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="m-0 p-3"
          style={{
            background: "var(--color-accent-100)",
            borderLeft: "4px solid var(--color-accent)",
            color: "var(--color-accent-800)",
            fontSize: 13,
          }}
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? copy.admin.saving : copy.admin.save}
        </button>
        {state.ok && !pending && (
          <span className="label" style={{ color: "var(--color-accent-700)" }}>
            {copy.admin.saved}
          </span>
        )}
      </div>
    </form>
  );
}
