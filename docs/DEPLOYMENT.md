# Deployment

Tablekit runs on **Netlify + Supabase Postgres**. This document is the
walkthrough; if you only want the checklist, it is §1–§4.

## Why this shape

The app was first built on SQLite, which is excellent for a single-process
server and impossible on Netlify: Functions have no persistent writable disk,
so the database file vanishes between invocations and every page returns 500.

The data layer is now Postgres over the `postgres` driver, connected through
Supabase's **transaction pooler**. That combination is what makes serverless
work — see §2, which is the single most common way this deploy breaks.

---

## 1. Create the database

Supabase → **New project** (the free tier is enough for one cafe). Pick a
region near the cafe; for Gandhinagar that is `ap-south-1` (Mumbai).

Then apply the schema, either with the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push          # applies supabase/migrations/0001_init.sql
```

…or by pasting `supabase/migrations/0001_init.sql` into the SQL editor. It is
idempotent, so running it twice is safe.

## 2. Get the right connection string

Supabase → **Project Settings → Database → Connection string**. Three are
offered and **only one works from a serverless function**:

| String | Host | Works on Netlify? |
| --- | --- | --- |
| Direct | `db.<ref>.supabase.co:5432` | ❌ IPv6-only. Netlify Functions are IPv4, so it cannot even resolve — you get `ENETUNREACH` or a connect timeout on every request. |
| Session pooler | `...pooler.supabase.com:5432` | ⚠️ IPv4, but holds one server connection per client for its whole life. A burst of cold starts exhausts the pool. |
| **Transaction pooler** | `...pooler.supabase.com:6543` | ✅ Borrows a connection per statement and returns it. Use this one. |

Copy the **Transaction pooler** URI and substitute your database password.

The app checks this for you: on Netlify it refuses to start with a clear
message if `DATABASE_URL` points at the direct connection or the session
pooler, rather than half-working and timing out under load.

## 3. Set the environment variables

Netlify → **Site configuration → Environment variables**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The transaction-pooler URI from §2 |
| `TABLEKIT_SECRET` | `openssl rand -base64 32` |
| `TABLEKIT_PUBLIC_ORIGIN` | `https://<your-site>.netlify.app` |

`TABLEKIT_SECRET` signs staff session cookies and keys the IP hash in the
rate-limit log. **The app deliberately refuses to boot in production without
it** — signing sessions with a public default would let anyone mint themselves
a staff login.

`TABLEKIT_PUBLIC_ORIGIN` is the origin printed into the QR codes. Without it
they are built from the request `Host` header, which behind Netlify's proxy is
not always the address a guest's phone can reach — and a sticker with the wrong
URL on it is scrap paper.

## 4. Deploy and seed

Connect the repository and deploy. `netlify.toml` already pins Node 22 and
enables `@netlify/plugin-nextjs`, which is what routes server components, API
routes and server actions through Functions. Without that plugin Netlify
publishes raw build output and the site renders as unstyled fragments.

Then seed the menu and tables, once, from your machine:

```bash
DATABASE_URL='<transaction pooler URI>' npm run seed
```

It prints the twelve table codes and the owner login. It is idempotent: an
existing restaurant row makes it a no-op, so re-running it cannot duplicate the
menu or hand out fresh table codes while the old stickers are still on tables.

---

## Realtime on serverless

`netlify.toml` sets `NEXT_PUBLIC_TABLEKIT_STREAM=off`, which stops the kitchen
board attempting the SSE stream. Functions cannot hold a connection open for
more than a few seconds, so `EventSource` would fail, reconnect and fail again
— a retry loop that burns an invocation every few seconds and never succeeds.

With the stream off, the board runs on its **20-second reconciling poll**,
which is the mode it was designed to survive on: it replaces the whole list
with the server's answer every tick, so it cannot hold a duplicate or a
phantom. The connection dot shows amber "Polling · 20s" rather than green, and
that is accurate rather than a defect.

**Invocation budget.** One pass screen polling every 20s over a 12-hour day is
about 2,200 invocations a day, ~65k a month — inside Netlify's free tier. Two
screens run at roughly 130k and will exceed it. If the cafe runs more than one
board, either raise the poll interval or move to a paid tier.

To get true realtime back, run the app on a long-lived Node process (see below)
and drop the `NEXT_PUBLIC_TABLEKIT_STREAM` variable — SSE then works as built.

## Running it on a normal server instead

Everything also runs on any host with a persistent Node process — Fly, Railway,
Render, a VPS:

```bash
npm ci && npm run build
DATABASE_URL=... TABLEKIT_SECRET=... npm start
```

There you can use the **direct** connection string, SSE works, and the board
goes green. Nothing else changes.

## Images

A fresh install ships with **no external image dependency**. `public/menu/`
holds one piece of monochrome-on-warm artwork per category and the seed points
every item at its category's piece, so the guest menu paints completely with
nothing to fetch — the point on cafe wifi, and it means the menu cannot show
empty frames because a CDN is unreachable.

To use the cafe's real photographs, in order of preference:

1. **Local files.** Drop them in `public/menu/`, then set `image_url` on each
   row to e.g. `/menu/cold-brew.jpg`. Square crops, ~400px, look best — they
   render at 92px on the menu and 34px on dockets.
2. **A remote host.** Write any absolute URL to `image_url` and add the host to
   `images.remotePatterns` in `next.config.ts` (Unsplash is already listed).

`next/image` optimization is bypassed for `.svg` sources: the bundled artwork
is ~1KB of vector needing no resizing, and enabling `dangerouslyAllowSVG` to
optimize it would also permit remote SVG, which can carry script. Raster
photographs go through the optimizer normally.

Missing or failing images degrade to a plain warm tile, never a broken-image
icon, so none of this is release-blocking.

## Backups

Supabase takes daily backups on paid tiers. On free, take your own before
anything risky:

```bash
pg_dump "$DATABASE_URL" --data-only --inserts > backup-$(date +%F).sql
```

Order history is the only thing that cannot be regenerated — the menu and
tables can be re-seeded, though re-seeding rotates every table code and
invalidates the printed stickers.

## Health checks

- `GET /` — renders from the database, so a 200 means the connection works.
- `GET /api/kitchen/orders` — should be **401** without a session. If it ever
  returns 200, stop and investigate.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Every page 500s, log shows `ENETUNREACH` or connect timeout | `DATABASE_URL` is the direct connection. Use the transaction pooler (§2). |
| `TABLEKIT_SECRET must be set…` | The variable is missing. Generate one (§3). |
| `No restaurant row found. Run npm run seed` | The schema exists but is empty. Run the seed (§4). |
| Site renders as unstyled HTML fragments | `@netlify/plugin-nextjs` did not run. Check the deploy log for "Using Next.js Runtime"; `netlify.toml` must be at the repository root. |
| QR codes point at the wrong host | `TABLEKIT_PUBLIC_ORIGIN` is unset (§3). |
| Board dot is amber, not green | Expected on Netlify — the stream is off by design. See "Realtime on serverless". |
