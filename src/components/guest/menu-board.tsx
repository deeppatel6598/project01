"use client";

import { useEffect, useRef, useState } from "react";

import { Thumb } from "@/components/thumb";
import { Leader, Numeral, Stepper, VegDot } from "@/components/ui";
import { categoryAnchor } from "@/lib/anchors";
import { copy } from "@/lib/copy";
import { formatINR } from "@/lib/money";
import type { Cart, MenuSection } from "@/lib/types";

/**
 * The menu.
 *
 * Each dish sits on its own warm card with its photograph in a rounded frame,
 * but the dotted leader running from the name to the price is kept — it is the
 * one piece of printed-menu grammar that makes a list of items read as a menu
 * rather than as a table of data.
 *
 * Cards rather than a grid, because most cafes will not have a photograph of
 * everything: a card without an image still reads as a card, where a
 * half-populated photo grid reads as broken.
 */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function MenuBoard({
  sections,
  cart,
  accepting,
  onIncrement,
  onDecrement,
  scrollRoot,
}: {
  sections: MenuSection[];
  cart: Cart;
  accepting: boolean;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
  scrollRoot?: React.RefObject<HTMLElement | null>;
}) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    sections[0] ? categoryAnchor(sections[0].category) : null,
  );

  const anchorKey = sections.map((section) => categoryAnchor(section.category)).join("|");

  /**
   * Scroll-spy via IntersectionObserver rather than a scroll handler calling
   * `getBoundingClientRect` every frame — the browser computes intersections
   * off the main thread, so dragging a long menu on a mid-range Android stays
   * smooth.
   *
   * `rootMargin` pulls the detection line below the sticky rail, so the
   * highlighted chip is the section actually under it.
   */
  useEffect(() => {
    const root = scrollRoot?.current ?? null;
    const elements = anchorKey
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }

        let best: string | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const [id, top] of visible) {
          if (top < bestTop) {
            bestTop = top;
            best = id;
          }
        }
        if (best) setActiveAnchor(best);
      },
      { root, rootMargin: "-76px 0px -68% 0px", threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [anchorKey, scrollRoot]);

  // Left for the React Compiler to memoize — wrapping this in `useCallback`
  // would read a ref in the dependency list and make the compiler bail out of
  // optimising this component entirely.
  const jumpTo = (anchor: string) => {
    const element = document.getElementById(anchor);
    if (!element) return;

    setActiveAnchor(anchor);

    const root = scrollRoot?.current;
    if (root) {
      root.scrollTo({ top: element.offsetTop - 76, behavior: "smooth" });
    } else {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <CategoryRail sections={sections} activeAnchor={activeAnchor} onJump={jumpTo} />

      <div className="flex flex-col gap-8 px-4 pt-6">
        {sections.map((section, index) => (
          <section
            key={section.category.id}
            id={categoryAnchor(section.category)}
            aria-labelledby={`${categoryAnchor(section.category)}-heading`}
          >
            <div className="mb-4 flex items-center gap-3">
              <Numeral>{ROMAN[index] ?? String(index + 1)}</Numeral>
              <h2
                id={`${categoryAnchor(section.category)}-heading`}
                className="m-0"
                style={{ fontSize: 22 }}
              >
                {section.category.name}
              </h2>
              <span className="rule-warm flex-1" aria-hidden />
              <span className="label" style={{ color: "var(--color-text-faint)" }}>
                {copy.guest.categoryCount(section.items.length)}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {section.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  qty={cart[item.id] ?? 0}
                  accepting={accepting}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ── the sticky rail ───────────────────────────────────────────────────── */

function CategoryRail({
  sections,
  activeAnchor,
  onJump,
}: {
  sections: MenuSection[];
  activeAnchor: string | null;
  onJump: (anchor: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active chip in view — the rail is wider than a phone screen, so
  // without this the highlight regularly sits off-screen.
  useEffect(() => {
    if (!activeAnchor || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-anchor="${activeAnchor}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeAnchor]);

  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-0 z-20"
      style={{
        background: "color-mix(in srgb, var(--color-bg) 86%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        ref={railRef}
        className="flex gap-2 overflow-x-auto px-4 py-3"
        style={{ scrollbarWidth: "none" }}
      >
        {sections.map((section) => {
          const anchor = categoryAnchor(section.category);

          return (
            <button
              key={section.category.id}
              type="button"
              data-anchor={anchor}
              onClick={() => onJump(anchor)}
              aria-current={anchor === activeAnchor ? "true" : undefined}
              className="chip"
            >
              {section.category.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ── one dish ──────────────────────────────────────────────────────────── */

function ItemCard({
  item,
  qty,
  accepting,
  onIncrement,
  onDecrement,
}: {
  item: MenuSection["items"][number];
  qty: number;
  accepting: boolean;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
}) {
  // An item can sell out while this page is already open, so the card keeps a
  // blocked state rather than assuming the server-rendered menu is still true.
  const blocked = !item.isAvailable || !accepting;
  const inCart = qty > 0;

  return (
    <article
      className="card card-interactive flex gap-4 p-3"
      style={
        inCart
          ? {
              borderColor: "var(--color-primary-300)",
              background: "var(--color-primary-50)",
              boxShadow: "var(--shadow-md)",
            }
          : undefined
      }
    >
      <Thumb src={item.imageUrl} size={92} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <VegDot isVeg={item.isVeg} size={14} />
          <h3 className="m-0" style={{ fontSize: 17, lineHeight: 1.25 }}>
            {item.name}
          </h3>
          <Leader />
          <span
            className="numeric shrink-0"
            style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}
          >
            {formatINR(item.price)}
          </span>
        </div>

        {item.description && (
          <p
            className="mt-1 mb-0"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--color-text-soft)",
              textWrap: "pretty",
            }}
          >
            {item.description}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {item.badge && <span className="tag tag-gold">{item.badge}</span>}

          <span className="flex-1" />

          {blocked ? (
            <span className="tag tag-muted">{copy.guest.soldOut}</span>
          ) : inCart ? (
            <Stepper
              qty={qty}
              label={item.name}
              onDecrement={() => onDecrement(item.id)}
              onIncrement={() => onIncrement(item.id)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onIncrement(item.id)}
              className="btn btn-primary"
              style={{ minHeight: 40, padding: "0 22px" }}
            >
              {copy.guest.add}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
