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
cp .env.example .env.local     # fill in DATABASE_URL — see docs/DEPLOYMENT.md
npm run seed                   # creates the schema, pilot data, and table codes
npm run dev
```

Any Postgres works for local development:

```bash
docker run -e POSTGRES_HOST_AUTH_METHOD=trust -p 5433:5432 -d postgres:16
export DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres DATABASE_SSL=disable
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
npm test               # vitest (needs TEST_DATABASE_URL — a real Postgres)
npm run test:coverage  # with coverage
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run verify         # typecheck + lint + test + build
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · **Postgres**
(Supabase) · deployed on **Netlify**.

The data layer talks to Postgres through the `postgres` driver over Supabase's
**transaction pooler**, which is what makes it work on serverless — the direct
connection is IPv6-only and unreachable from a Netlify Function, and the
session pooler exhausts its pool under cold starts. The app checks this at
startup and refuses to boot with a clear message rather than half-working.

Realtime is the one thing serverless costs you: functions cannot hold an SSE
connection open, so on Netlify the board runs on its 20-second reconciling
poll and the connection dot reads amber rather than green. On a long-lived
Node process the stream works as built. Both paths are covered in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
    db/                  schema, pooled connection, row mappers
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

## Design — Warm Cafe

The original build shipped the **Modernist** system from the design file: flat,
mono red on grey, zero corner radius, 2px hard rules, photography printed in
black and white. It was coherent, but it read as a wireframe — and greyscale
food is the wrong call for a menu.

The current theme keeps every functional decision that system got right and
replaces the surface treatment:

| | Before | Now |
| --- | --- | --- |
| Ground | Neutral grey `#f3f2f2` | Warm cream `#fdf7f1`, no neutral greys anywhere |
| Ink | Near-black | Espresso `#2b1d16` |
| Accent | One red | Ember ramp (`#ea5310`) + a crema gold for badges |
| Type | Archivo throughout | **Playfair Display** for dish names, prices and headlines; **Karla** for everything functional |
| Shape | `radius: 0` | A real radius scale, pills on every control |
| Depth | None | Warm brown-tinted shadows, never neutral black |
| Imagery | Forced greyscale | A light warm grade |
| Menu | Hard-ruled rows | Cards that lift on hover and tint ember when in the basket |
| Pass | Grey-black | Warm espresso ground with an ember wash, colour-coded columns |

The serif/sans pairing is the point: it is the oldest convention in restaurant
print, and it is what makes a list of items read as a menu rather than as a
table of data.

Tokens live at the top of `src/app/globals.css` and are the source of truth.
A `:root` block below them bridges the old Modernist names onto the new palette
so staff-facing screens picked up the theme without every inline style being
rewritten at once — new work should use the new tokens.

**What did not change:** the docket is still the signature element and is still
shared by both surfaces, so the guest's confirmation is the same docket the
kitchen sees. The light-guest / dark-pass split is still functional rather than
decorative. 44px targets, AA contrast, visible focus rings, and
`prefers-reduced-motion` all still hold. Motion is still one orchestrated
moment — a docket landing — plus short state transitions.

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
