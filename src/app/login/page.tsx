import type { Metadata } from "next";

import { copy } from "@/lib/copy";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

/**
 * Staff sign-in. Guests never see this — the whole point of a QR menu is that
 * ordering a coffee does not require an account.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Sanitised here as well as in the action: a `next` pointing at another
  // origin would turn this form into an open redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/kitchen";

  return (
    <main className="mx-auto w-full px-6 py-8" style={{ maxWidth: 420 }}>
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
        Staff
        <br />
        sign in
      </h1>

      <div className="hr" />

      <LoginForm next={safeNext} />
    </main>
  );
}
