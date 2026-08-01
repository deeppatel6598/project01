import type { Metadata } from "next";

import { GuestApp } from "@/components/guest/guest-app";
import { copy } from "@/lib/copy";
import { getGuestMenu, getRestaurant } from "@/lib/menu";
import { findTableByCode } from "@/lib/tables";

/**
 * `/t/[code]` — the surface a guest reaches by scanning the sticker on their
 * table.
 *
 * A server component on purpose. The menu is public and identical for every
 * guest, so it is read straight from the database and streamed as HTML: on
 * cafe wifi the menu is legible before any JavaScript has finished parsing,
 * which is what the two-second acceptance target actually depends on.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const table = findTableByCode(code);

  if (!table) return { title: copy.errors.tableNotLinkedTitle };
  return { title: `${table.label} — menu` };
}

export default async function TablePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const table = findTableByCode(code);

  // A dead sticker gets a real answer, not a framework 404. Someone is
  // standing in the cafe holding a phone, and "This QR isn't linked to a
  // table yet. Show it to the counter." tells them exactly what to do next.
  if (!table || !table.isActive) {
    return <NotLinked />;
  }

  const restaurant = getRestaurant();
  const sections = getGuestMenu(restaurant.id);

  return <GuestApp restaurant={restaurant} table={table} sections={sections} />;
}

function NotLinked() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full flex-col justify-center px-6"
      style={{
        maxWidth: 480,
        background: "var(--color-neutral-100)",
        borderLeft: "2px solid var(--color-text)",
        borderRight: "2px solid var(--color-text)",
      }}
    >
      <p className="label label-wide m-0" style={{ color: "var(--color-neutral-700)" }}>
        {copy.brand.product}
      </p>

      <h1
        className="m-0 mt-3"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 40,
          lineHeight: 0.9,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
        }}
      >
        Not
        <br />
        linked
      </h1>

      <div className="hr" />

      <p className="m-0" style={{ fontSize: 15, lineHeight: 1.5, textWrap: "pretty" }}>
        {copy.errors.tableNotLinked}
      </p>
    </main>
  );
}
