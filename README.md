# Tablekit

QR table ordering for **Roast & Toast** — Sargasan, Gandhinagar.

A guest sits down, scans the sticker on their table, and lands on that table's
menu. No app, no login, no typing a table number. They pick items, enter their
name, and the order appears on a kitchen screen behind the counter within a
second, tagged with the table and the guest. Staff move it through
**New → Preparing → Served**.

Payment is at the counter. There is no online payment in v1 and none is
stubbed.

---

## Quick start

```bash
npm install
npm run seed     # creates the pilot data and prints the table codes
npm run dev
```

Then open:

| URL | What it is | Auth |
| --- | --- | --- |
| `/` | Setup front door — links to every table and both staff surfaces | none |
| `/t/<code>` | **Guest menu.** The surface a QR sticker points at | none |
| `/kitchen` | **The pass.** Live order board | staff |
| `/admin` | Menu, tables, QR sheet, order history, settings | owner |

`npm run seed` prints the twelve table codes and the owner login it created
(`owner@roastandtoast.test` / `roast-and-toast` unless you set
`TABLEKIT_OWNER_EMAIL` and `TABLEKIT_OWNER_PASSWORD`). **Change that password
before the cafe goes live.**

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm start              # serve the production build
npm run seed           # seed pilot data (idempotent — safe to re-run)
npm run seed:reset     # wipe and re-seed; DESTROYS order history and rotates every table code
npm test               # vitest
npm run test:coverage  # with coverage
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run verify         # typecheck + lint + test + build
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · SQLite
(better-sqlite3) · SSE for realtime.

The brief named Supabase and Netlify. This repo ships a **runnable**
single-process implementation instead: `npm install && npm run seed && npm run
dev` gives you a working cafe with no accounts to create and no credentials to
paste. The Postgres path is not abandoned —
`supabase/migrations/0001_init.sql` contains the full schema, the RLS policies,
and a `place_order` function that enforces the same rules as
`src/lib/orders.ts`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the swap.

---

## How it is put together

```
src/
  app/
    t/[code]/            guest menu — server component, renders before JS loads
    kitchen/             the pass — client, SSE + polling
    admin/               owner tools; every action re-checks the session
    api/
      orders/            place · mine · line       (the guest's entire write surface)
      kitchen/           orders · orders/[id] · stream
      admin/orders.csv   line-level export
  components/
    guest/ kitchen/      the two surfaces
    ui.tsx thumb.tsx     shared system pieces
  hooks/
    use-cart             basket, sessionStorage-backed
    use-live-orders      the board's feed — stream + reconciling poll
    use-chime            new-order sound, behind the autoplay gesture
  lib/
    orders.ts            the order engine — read this one first
    db/                  schema, connection, row mappers
    money.ts             integer paise; never a float
    copy.ts              every user-facing string, for the v2 translation
```

### The order engine

`src/lib/orders.ts` is the security boundary and the best place to start. It
is written assuming the guest has devtools open:

- **Prices are re-read from the menu.** The API schema has no price field at
  all — a client that posts `{"price": 1}` is charged the menu price.
- **Quantities are clamped** to 1–20 rather than rejected; a fat-fingered 200
  becomes 20.
- **Duplicate lines merge** before the 30-line cap is applied.
- **Placement is one transaction** — the counter bump, the order, its lines
  and the rate-limit row all land or none do.
- **Snapshots, not joins.** Raising a price today does not change the total on
  an order placed yesterday.

### Realtime, and what happens when it drops

Cafe wifi is cafe wifi, and a board that silently stops updating is worse than
no board. So the pass runs two mechanisms at once:

1. **SSE** carries each event the moment it happens.
2. **A 20-second poll runs unconditionally** — not as a fallback — and
   replaces the board wholesale with the server's list.

The poll is what makes "kill the wifi for 30 seconds and restore it" leave the
board correct: however many events were missed, a board rebuilt from the
server's answer cannot hold a duplicate or a phantom. The connection dot says
which mechanism is carrying it — **live** / **polling** / **offline** — so
nobody has to guess.

### Money

Every amount is an integer count of paise. `0.1 + 0.2` is the oldest bug in
billing software and a sixteen-line order gives it plenty of chances.
Rupee-denominated display and owner-facing input go through `formatINR` /
`parseRupeeInput`.

---

## Design

The visual system is **Modernist**, ported from the Claude Design project that
specified this build: flat and architectural, set entirely in Archivo,
near-mono red (`#ec3013`) on a light ground, visible modular grid, **zero
corner radius**, strong 2px rules, and photography printed in pure black and
white.

Tokens live at the top of `src/app/globals.css` and are the source of truth —
retune there rather than hard-coding a hex or a px value a token already
carries.

The signature element is the **docket**: paper stock, perforated top and bottom
edge, order code, status stamped at an angle. It appears in both surfaces — the
guest's confirmation screen is the same docket the kitchen sees, which is what
quietly tells a guest their order really landed.

The guest surface is light (read in daylight, part of the room); the pass is
dark (a low-light working screen). That split is functional, not decorative.

Motion is one orchestrated moment: a new docket sliding onto the board.
Everything else is still, and `prefers-reduced-motion` turns even that off.

**Two deliberate departures from the source files:**

1. The design's perforated edge used `repeating-radial-gradient`, which draws
   concentric rings inside each tile and reads as a comb of hairlines. It is
   one circle per tile here, which gives the half-round scallops a torn docket
   actually has.
2. The brief said to skip the guest order-status screen because it "would need
   a per-order secret token in the URL". The design ships that screen, so the
   token exists — but it lives in `sessionStorage`, never the URL. See
   [docs/SECURITY.md](docs/SECURITY.md).

---

## Accessibility

- 44px minimum on every tap target.
- Themed `:focus-visible` rings throughout; the pass steps the ring up the
  accent ramp so it stays visible on the dark ground.
- Sheets and screens are labelled dialogs, take focus on open, and close on
  Escape.
- The veg/non-veg FSSAI mark carries a text label for screen readers.
- Pinch-zoom is not disabled.
- Works down to 360px.

## Testing

81 tests, focused on the order engine's security rules and the money math:
price re-reading, quantity clamping, line merging, sold-out rejection, the
rate limiter, transaction atomicity on failure, token scoping (including that
the guest projection leaks neither phone nor restaurant id), snapshot
stability across price changes, board ordering and the served window.

```bash
npm test
```

## Known limitations

- **The event bus is in-process.** Realtime works on one long-lived Node
  instance. On serverless, subscribers and publishers land in different
  instances and the board degrades to its 20-second poll — correct, just not
  instant. `docs/DEPLOYMENT.md` covers the swap.
- **Seed prices are estimates** pulled from the cafe's reviews. The admin menu
  page repeats that warning. Confirm every one with the owner before launch.
- **Menu imagery is drawn, not photographed.** `public/menu/` holds flat
  monochrome artwork in the Modernist idiom, one piece per category, bundled
  with the repo — so the menu paints completely with zero external requests
  and cannot end up full of empty frames because an image CDN is unreachable.
  Set `imageId` in `src/lib/seed-data.ts` (or `image_url` in the database) to
  use the cafe's real photographs instead. Either way a failed image degrades
  to a plain framed square, never a broken-image icon.
- `npm audit` reports advisories in `postcss` and `sharp`, both transitive
  dependencies of `next` itself. `npm audit fix --force` would downgrade Next;
  they clear when Next ships updated pins.

Out of scope for v1, per the brief: online payment, bill splitting, guest
accounts, waiter call, multi-tenant signup, analytics dashboards, thermal
printer integration, Hindi/Gujarati translation (every string is in
`src/lib/copy.ts` so that is a swap, not a hunt).

## Docs

- [docs/SECURITY.md](docs/SECURITY.md) — the threat model and every control
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — tables, snapshots, order codes
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — going live, and the Postgres path
