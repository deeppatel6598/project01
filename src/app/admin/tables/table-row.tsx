"use client";

/* eslint-disable @next/next/no-img-element -- QR artwork is an inline data:
   URL generated per request. next/image would round-trip it through the
   optimizer for no benefit and cannot be used as a download href. */

import { useActionState, useTransition } from "react";

import { copy } from "@/lib/copy";
import type { DiningTable } from "@/lib/types";

import { addTable, rotateCode, setTableActive, type FieldState } from "../actions";

export function TableRow({
  table,
  url,
  qr,
}: {
  table: DiningTable;
  url: string;
  qr: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <tr style={{ opacity: table.isActive ? 1 : 0.5 }}>
      <td>
        <img
          src={qr}
          alt={`QR code for ${table.label}`}
          width={64}
          height={64}
          // Square, deliberately. A QR code's three finder patterns sit in its
          // corners — rounding the image would clip exactly the marks a
          // scanner locks onto.
          style={{ border: "1px solid var(--color-border)", background: "#fff" }}
        />
      </td>

      <td>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16 }}>
          {table.label}
        </div>
        {table.seats !== null && (
          <div className="label" style={{ color: "var(--color-neutral-700)" }}>
            {table.seats} seats
          </div>
        )}
      </td>

      <td>
        <code style={{ fontSize: 13 }}>{url}</code>
      </td>

      <td>
        <div className="flex flex-wrap gap-2">
          <a
            href={qr}
            download={`tablekit-${table.code}.png`}
            className="btn btn-quiet"
            style={{ minHeight: 36, padding: "0 10px" }}
          >
            {copy.admin.downloadPng}
          </a>

          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void setTableActive(table.id, !table.isActive))}
            className="btn btn-quiet"
            style={{ minHeight: 36, padding: "0 10px" }}
          >
            {table.isActive ? "Retire" : "Restore"}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              // Rotating invalidates the sticker already on the table, so this
              // one asks first — otherwise the fix for a leaked code silently
              // becomes a table nobody can order from.
              if (
                window.confirm(
                  `Issue a new code for ${table.label}? The printed sticker will stop working and has to be replaced.`,
                )
              ) {
                startTransition(() => void rotateCode(table.id));
              }
            }}
            className="btn btn-quiet"
            style={{ minHeight: 36, padding: "0 10px" }}
          >
            New code
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AddTableForm() {
  const [state, formAction, pending] = useActionState<FieldState, FormData>(addTable, {
    error: null,
    ok: false,
  });

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 p-4"
      style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", background: "var(--color-surface)" }}
    >
      <label className="field">
        <span>Label</span>
        <input
          className="input"
          name="label"
          placeholder="Table 13"
          required
          style={{ minHeight: 40, width: 180 }}
        />
      </label>

      <label className="field">
        <span>Seats</span>
        <input
          className="input"
          name="seats"
          inputMode="numeric"
          placeholder="4"
          style={{ minHeight: 40, width: 90 }}
        />
      </label>

      <button type="submit" className="btn btn-primary" disabled={pending} style={{ minHeight: 40 }}>
        {pending ? copy.admin.saving : copy.admin.add}
      </button>

      {state.error && (
        <span role="alert" style={{ fontSize: 13, color: "var(--color-accent-700)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
