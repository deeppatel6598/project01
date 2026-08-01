# Deployment

## What this build needs

**A single long-lived Node process with a writable disk.** A small VM, a
container on Fly/Railway/Render, or a box in the back office all work. Two
things drive that:

- `better-sqlite3` writes to a file, so the disk must persist across restarts.
- The realtime event bus is in-process, so publisher and subscriber have to be
  the same process.

Neither is a dead end on serverless — see [Serverless](#serverless) below.

## Going live

```bash
npm ci
npm run build
npm run seed          # once, on the real box
TABLEKIT_SECRET=... npm start
```

### 1. Set the secret

```bash
openssl rand -base64 32
```

into `TABLEKIT_SECRET`. **The app refuses to start in production without it** —
a public default would let anyone mint themselves a staff session.

### 2. Point the database at a real volume

```bash
TABLEKIT_DB_PATH=/var/lib/tablekit/tablekit.db
```

The default (`data/tablekit.db`) sits inside the deployment directory and is
lost on every redeploy. On a container, mount a volume.

### 3. Set the public origin

```bash
TABLEKIT_PUBLIC_ORIGIN=https://order.roastandtoast.example
```

This is the origin printed into the QR codes. Behind a proxy the request's own
`Host` header can be an internal name, and a sticker printed with
`http://10.0.0.4:3000` on it is scrap paper.

### 4. Change the owner password

The seed prints whatever it used. Change it before the cafe opens.

### 5. Confirm the prices

Every seeded price is an estimate pulled from the cafe's reviews. Sit with the
owner and go through `/admin/menu` before a single sticker goes on a table.

### 6. Print the stickers

`/admin/tables/print` — A4, six per page, level-H error correction (these get
spilled on). Print at **100% scale**; "fit to page" shrinks the codes.

### Reverse proxy

The kitchen board holds an open SSE connection, so buffering must be off:

```nginx
location /api/kitchen/stream {
    proxy_pass              http://127.0.0.1:3000;
    proxy_http_version      1.1;
    proxy_set_header        Connection '';
    proxy_buffering         off;
    proxy_read_timeout      1h;
}
```

The route already sends `X-Accel-Buffering: no`, which nginx honours, but the
read timeout still needs raising or the stream is reaped hourly. (It would
reconnect — but the board would flicker to amber every hour for no reason.)

Also forward `X-Forwarded-For` and `X-Forwarded-Proto`; the rate limiter and
the QR origin both read them.

## Backups

The database is one file. With WAL journaling, copy it *with* its sidecars or
use SQLite's own backup so you get a consistent snapshot:

```bash
sqlite3 /var/lib/tablekit/tablekit.db ".backup '/backups/tablekit-$(date +%F).db'"
```

Nightly is plenty for one cafe. Order history is the only thing that cannot be
regenerated — the menu and tables can be re-seeded, though re-seeding rotates
every table code and invalidates the printed stickers.

## Images

A fresh install ships with **no external image dependency**. `public/menu/`
holds one piece of flat monochrome artwork per category, drawn in the
Modernist idiom, and the seed points every item at its category's piece. The
guest menu therefore paints completely on first load with nothing to fetch —
which is the point on cafe wifi, and which means a deployment cannot end up
showing a menu full of empty frames because someone's CDN is unreachable.

Replacing them with the cafe's real photographs, in order of preference:

1. **Local files.** Drop them in `public/menu/`, then set `image_url` on each
   row to e.g. `/menu/cold-brew.jpg`. Still no external requests. Square
   crops, ~400px, look best — they render at 76px on the menu and 32–40px on
   dockets.
2. **A remote host.** Set `imageId` in `src/lib/seed-data.ts` for the bundled
   Unsplash ids, or write any absolute URL to `image_url`, and add the host to
   `images.remotePatterns` in `next.config.ts` (Unsplash is already listed).

Note that `next/image` optimization is bypassed for `.svg` sources — the
bundled artwork is already ~1KB of vector and needs no resizing, and turning
on `dangerouslyAllowSVG` to optimize it would also permit remote SVG, which
can carry script. Raster photographs go through the optimizer normally.

Missing or failing images degrade to plain framed squares, never a
broken-image icon, so none of this is release-blocking.

## Serverless

Deploying to Vercel/Netlify functions changes two things:

**The database.** `better-sqlite3` needs a persistent writable disk that
serverless does not have. Swap it for the Postgres path: apply
`supabase/migrations/0001_init.sql` and reimplement `src/lib/db` and
`src/lib/orders.ts` against it. The migration already contains the schema, the
RLS policies and a `place_order` function enforcing the same rules — re-reading
prices, clamping quantities, merging duplicates, rate limiting — so the port is
mechanical rather than a redesign.

**Realtime.** `src/lib/events.ts` is an in-process `EventEmitter`. Across
instances, a guest's order and the pass's stream land in different processes
and no event is delivered. Replace it with one of:

- Postgres `LISTEN`/`NOTIFY`
- Supabase Realtime on `postgres_changes` for `orders`, filtered by
  `restaurant_id`
- Any pub/sub the platform offers

`events.ts` is the only file that has to change — `publish()` and
`subscribe()` are the whole interface.

Until then the board **degrades correctly rather than silently**: the
unconditional 20-second poll keeps it accurate, and the connection dot shows
amber "Polling · 20s" instead of green. That is a real trade, not a bug, but a
kitchen that sees new orders up to twenty seconds late is worth knowing about
before you choose the platform.

## Health checks

- `GET /` — renders from the database, so a 200 means the DB is readable.
- `GET /api/kitchen/orders` — should be **401** without a session. If it ever
  returns 200, stop and investigate.

## Monitoring

Worth alerting on:

- 5xx on `POST /api/orders` — a guest could not order.
- A sustained rise in 429s on the same route — either a real burst or the rate
  limiter is set too tight for a busy Sunday.
- Disk usage on the database volume.
