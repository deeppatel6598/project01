"use client";

import { useEffect, useRef } from "react";

import { Thumb } from "@/components/thumb";
import { Leader } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatINR, sumPaise } from "@/lib/money";
import type { Cart, MenuItem } from "@/lib/types";

/**
 * The basket, as a bottom sheet.
 *
 * A sheet rather than a route: the guest is mid-decision, and pushing them to
 * a separate page costs the menu's scroll position and makes "actually, one
 * more coffee" feel like a detour.
 */

export interface CartSheetProps {
  open: boolean;
  items: MenuItem[];
  cart: Cart;
  guestName: string;
  note: string;
  accepting: boolean;
  submitting: boolean;
  error: string | null;
  onChangeName: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CartSheet({
  open,
  items,
  cart,
  guestName,
  note,
  accepting,
  submitting,
  error,
  onChangeName,
  onChangeNote,
  onClose,
  onSubmit,
}: CartSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const lines = items
    .filter((item) => (cart[item.id] ?? 0) > 0)
    .map((item) => ({ item, qty: cart[item.id]!, lineTotal: item.price * cart[item.id]! }));

  const total = sumPaise(lines.map((line) => line.lineTotal));
  const empty = lines.length === 0;

  // Move focus into the sheet when it opens, and close it on Escape. Without
  // this a keyboard or screen-reader user stays parked on the menu behind an
  // overlay they cannot see past.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      style={{ background: "color-mix(in srgb, #201e1d 45%, transparent)" }}
      onClick={(event) => {
        // Tapping the scrim closes; taps inside the panel must not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.guest.yourOrder}
        className="mx-auto w-full overflow-y-auto"
        style={{
          maxWidth: 480,
          maxHeight: "92%",
          background: "var(--color-neutral-100)",
          borderTop: "2px solid var(--color-text)",
        }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "2px solid var(--color-text)" }}
        >
          <h2
            className="m-0"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            {copy.guest.yourOrder}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-quiet btn-icon"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {lines.map(({ item, qty, lineTotal }) => (
            <div
              key={item.id}
              className="flex items-center gap-[10px] py-[10px]"
              style={{ borderBottom: "1px solid var(--color-divider)" }}
            >
              {item.imageUrl && <Thumb src={item.imageUrl} size={40} />}
              <span
                style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, minWidth: 26 }}
              >
                {qty}×
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</span>
              <Leader />
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14 }}>
                {formatINR(lineTotal)}
              </span>
            </div>
          ))}

          {empty && (
            <p className="label label-tight py-6" style={{ color: "var(--color-neutral-700)" }}>
              {copy.errors.emptyBasket}
            </p>
          )}

          <div
            className="flex items-baseline justify-between py-4"
            style={{ borderBottom: "2px solid var(--color-text)" }}
          >
            <span className="label" style={{ fontWeight: 700, letterSpacing: "0.16em" }}>
              {copy.guest.total}
            </span>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 26 }}>
              {formatINR(total)}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <label className="field">
              <span>{copy.guest.nameLabel}</span>
              <input
                className="input"
                value={guestName}
                maxLength={40}
                autoComplete="given-name"
                enterKeyHint="next"
                placeholder={copy.guest.namePlaceholder}
                onChange={(event) => onChangeName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>{copy.guest.noteLabel}</span>
              <input
                className="input"
                value={note}
                maxLength={200}
                enterKeyHint="done"
                placeholder={copy.guest.notePlaceholder}
                onChange={(event) => onChangeNote(event.target.value)}
              />
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 mb-0 p-3"
              style={{
                background: "var(--color-accent-100)",
                borderLeft: "4px solid var(--color-accent)",
                color: "var(--color-accent-800)",
                fontSize: 13,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!accepting || empty || submitting}
            className="btn btn-primary btn-block mt-4"
            style={{
              minHeight: 60,
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 16,
              letterSpacing: "0.06em",
            }}
          >
            <span>
              {!accepting
                ? copy.guest.kitchenPaused
                : submitting
                  ? copy.guest.placing
                  : copy.guest.placeOrder(formatINR(total))}
            </span>
            <span aria-hidden>→</span>
          </button>

          <p
            className="label label-tight mt-3 pb-4"
            style={{ color: "var(--color-neutral-600)" }}
          >
            {copy.guest.payAtCounterShort}
          </p>
        </div>
      </div>
    </div>
  );
}
