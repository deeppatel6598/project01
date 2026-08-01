import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KitchenBoard } from "@/components/kitchen/board";
import { getSession } from "@/lib/auth";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.kitchen.title };
export const dynamic = "force-dynamic";

/**
 * `/kitchen` — the live order board. Both roles reach it; only `owner`
 * reaches `/admin`.
 *
 * The guard is here and again on every API route the board calls. Hiding the
 * page alone would be theatre — the data is only actually protected because
 * `/api/kitchen/*` refuses to answer without a session.
 */
export default async function KitchenPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/kitchen");

  return <KitchenBoard />;
}
