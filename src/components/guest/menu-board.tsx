"use client";

import { useEffect, useRef, useState } from "react";

import { Thumb } from "@/components/thumb";
import { Leader, Numeral, Stepper, VegDot } from "@/components/ui";
import { copy } from "@/lib/copy";
import { categoryAnchor } from "@/lib/anchors";
import { formatINR } from "@/lib/money";
import type { Cart, MenuSection } from "@/lib/types";

/**
 * The menu, set as a printed menu board: rows with dotted leaders running to
 * the price, not a grid of cards. Most cafes do not have a photograph of
 * everything, and a half-populated card grid looks broken in a way a row list
 * never does.
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
  /** The scrolling element the rail spies on. */
  scrollRoot?: React.RefObject<HTMLElement | null>;
}) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    sections[0] ? categoryAnchor(sections[0].category) : null,
  );

  const anchors = sections.map((section) => categoryAnchor(section.category));
  const anchorKey = anchors.join("|");

  /**
   * Scroll-spy.
   *
   * Tracked with an IntersectionObserver rather than a scroll handler doing
   * `getBoundingClientRect` on every frame: the browser computes the
   * intersections off the main thread, so dragging through a long menu on a
   * mid-range Android stays smooth.
   *
   * The `rootMargin` pulls the detection line down to just below the sticky
   * rail, so the highlighted category is the one actually under the rail
   * rather than the one about to leave the top of the screen.
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

        // Whichever visible section starts highest on screen wins.
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
      { root, rootMargin: "-52px 0px -70% 0px", threshold: 0 },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [anchorKey, scrollRoot]);

  // Left for the React Compiler to memoize. Wrapping it in `useCallback`
  // here reads a ref inside the dependency list, which makes the compiler
  // bail out of optimising this component entirely.
  const jumpTo = (anchor: string) => {
    const element = document.getElementById(anchor);
    if (!element) return;

    setActiveAnchor(anchor);

    const root = scrollRoot?.current;
    if (root) {
      // Offset by the rail's height so the section heading is not hidden
      // underneath it.
      root.scrollTo({ top: element.offsetTop - 44, behavior: "smooth" });
    } else {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <CategoryRail
        sections={sections}
        activeAnchor={activeAnchor}
        onJump={jumpTo}
      />

      {sections.map((section, index) => (
        <section
          key={section.category.id}
          id={categoryAnchor(section.category)}
          className="px-4 pt-6 pb-4"
          style={{ borderBottom: "2px solid var(--color-text)" }}
          aria-labelledby={`${categoryAnchor(section.category)}-heading`}
        >
          <div className="mb-4 flex items-baseline gap-[10px]">
            <Numeral>{ROMAN[index] ?? String(index + 1)}</Numeral>
            <h2
              id={`${categoryAnchor(section.category)}-heading`}
              className="m-0"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {section.category.name}
            </h2>
            <Leader solid />
            <span
              className="label label-tight"
              style={{ fontSize: 10, color: "var(--color-neutral-600)" }}
            >
              {copy.guest.categoryCount(section.items.length)}
            </span>
          </div>

          {section.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              qty={cart[item.id] ?? 0}
              accepting={accepting}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </section>
      ))}
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

  // Keep the active chip in view as the guest scrolls the menu — on a phone
  // the rail is wider than the screen, so without this the highlight
  // regularly sits off-screen.
  useEffect(() => {
    if (!activeAnchor || !railRef.current) return;
    const chip = railRef.current.querySelector<HTMLElement>(`[data-anchor="${activeAnchor}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeAnchor]);

  return (
    <nav
      ref={railRef}
      aria-label="Menu categories"
      className="sticky top-0 z-10 flex overflow-x-auto"
      style={{
        background: "var(--color-neutral-100)",
        borderBottom: "2px solid var(--color-text)",
        scrollbarWidth: "none",
      }}
    >
      {sections.map((section) => {
        const anchor = categoryAnchor(section.category);
        const active = anchor === activeAnchor;

        return (
          <button
            key={section.category.id}
            type="button"
            data-anchor={anchor}
            onClick={() => onJump(anchor)}
            aria-current={active ? "true" : undefined}
            className="shrink-0 cursor-pointer px-[14px] py-3"
            style={{
              appearance: "none",
              border: 0,
              borderRight: "1px solid var(--color-divider)",
              background: active ? "var(--color-text)" : "transparent",
              color: active ? "var(--color-neutral-100)" : "var(--color-text)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {section.category.name}
          </button>
        );
      })}
    </nav>
  );
}

/* ── one menu row ──────────────────────────────────────────────────────── */

function ItemRow({
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
  // An item can sell out while this page is already open, so the row keeps a
  // blocked state rather than assuming the server-rendered menu is still
  // true.
  const blocked = !item.isAvailable || !accepting;

  return (
    <div
      className="flex items-start gap-4 py-4"
      style={{
        borderTop: "1px solid var(--color-divider)",
        opacity: item.isAvailable ? 1 : 0.45,
      }}
    >
      <div className="relative shrink-0">
        <Thumb src={item.imageUrl} size={76} />
        <VegDot isVeg={item.isVeg} className="absolute bottom-0 left-0" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[6px]">
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            {item.name}
          </span>
          <Leader />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 16 }}>
            {formatINR(item.price)}
          </span>
        </div>

        {item.description && (
          <p
            className="mt-[3px] mb-0"
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: "var(--color-neutral-700)",
              textWrap: "pretty",
            }}
          >
            {item.description}
          </p>
        )}

        {item.badge && <div className="tag tag-outline mt-[6px]">{item.badge}</div>}

        <div className="mt-2">
          {blocked ? (
            <span className="tag tag-neutral" style={{ padding: "8px 10px", fontSize: 11 }}>
              {copy.guest.soldOut}
            </span>
          ) : qty > 0 ? (
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
              className="btn btn-secondary"
              style={{ minHeight: 36, minWidth: 88, padding: "0 14px" }}
            >
              {copy.guest.add}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
