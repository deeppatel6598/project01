import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { getRestaurant } from "@/lib/menu";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: copy.admin.nav.overview },
  { href: "/admin/menu", label: copy.admin.nav.menu },
  { href: "/admin/tables", label: copy.admin.nav.tables },
  { href: "/admin/orders", label: copy.admin.nav.orders },
  { href: "/admin/settings", label: copy.admin.nav.settings },
];

/**
 * `/admin` — owner only.
 *
 * Guarded once here for the whole section, and again inside every server
 * action it hosts. A layout guard alone stops the page rendering; it does
 * nothing to stop a hand-rolled POST to an action, which is where the actual
 * writes happen.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "owner") redirect("/kitchen");

  const restaurant = getRestaurant();

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="flex flex-wrap items-baseline justify-between gap-4 px-8 py-4"
        style={{ borderBottom: "2px solid var(--color-text)" }}
      >
        <div className="flex flex-wrap items-baseline gap-4">
          <Link
            href="/admin"
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: "var(--color-text)",
              textDecoration: "none",
            }}
          >
            {copy.brand.product}
          </Link>
          <span className="label label-wide" style={{ color: "var(--color-neutral-700)" }}>
            {restaurant.name}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <nav className="flex flex-wrap gap-4" aria-label="Admin">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="label"
                style={{ color: "var(--color-text)", textDecoration: "none" }}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/kitchen"
              className="label"
              style={{ color: "var(--color-accent-700)", textDecoration: "none" }}
            >
              {copy.kitchen.title}
            </Link>
          </nav>

          <form action="/api/auth/sign-out" method="post">
            <button type="submit" className="btn btn-quiet" style={{ minHeight: 36 }}>
              {copy.admin.signOut}
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
