# Security

The guest is anonymous, sitting in a public room, holding a phone. Everything
here is designed on the assumption that they have devtools open — because one
of them eventually will.

## The threat model

| Someone could try to… | What stops them |
| --- | --- |
| Change a price before ordering | Prices are never a client input. `placeOrder` takes `{menuItemId, qty}` and reads the price from `menu_items`. The API schema has no price field to tamper with. |
| Order for someone else's table | Table codes are 6 random characters from a 31-symbol alphabet (~30 bits), not `/t/1`…`/t/12`. Guessing is impractical and rate-limited. |
| Read the room's orders | There is no endpoint that lists orders by table, and no anon read path at all. `/api/orders/mine` requires the per-order token. `/api/kitchen/*` requires a staff session. |
| Harvest guest names and phone numbers | Same as above, plus the guest projection (`GuestOrderView`) omits `guestPhone` and `restaurantId` entirely. A test asserts this. |
| Send 400 dockets to the pass | 5 placements per table per 2 minutes, checked before any other work. |
| Order a sold-out item | Availability is re-checked inside the placement transaction, not trusted from the page the guest loaded. |
| Change an order the kitchen already started | The status is re-checked inside the edit transaction; `preparing` and later are rejected. |
| Forge a staff session | Cookies are HMAC-signed with `TABLEKIT_SECRET` and compared in constant time. The app refuses to boot in production without a real secret. |
| Enumerate staff accounts via the login form | Unknown email and wrong password return the same message and burn the same scrypt work. |
| Advance another cafe's order | Every kitchen mutation checks the order's `restaurantId` against the session's. |
| Execute a formula in the CSV export | Fields starting `= + - @` are prefixed with `'` so Excel and Sheets display them instead of running them. |

## The guest's read access

The original brief skipped a guest order-status screen, reasoning that it
"would need a per-order secret token in the URL, and the guest is sitting ten
feet from the kitchen". The design ships that screen, so the token exists —
built the way the objection implies it should be:

- 32 random bytes, base64url, unique per order.
- Returned **once**, in the placement response, to the client that placed it.
- Stored in **`sessionStorage`**, never in the URL — so it cannot leak through
  a shared link, a screenshot, a `Referer` header, browser history, or a
  server access log.
- Read back over **POST**, not GET, so it never lands in a query string.
- The only key to reading that order. Without it there is no query anywhere in
  the system that returns an order to an anonymous client.

Presenting a token also authorises editing that order's lines — but only while
its status is still `new`.

## Passwords and sessions

Passwords: **scrypt** (Node's `N=16384, r=8, p=1`), 16-byte random salt per
password, verified with `timingSafeEqual`. Inputs are NFKC-normalised so the
same password typed on two keyboards still verifies.

Sessions: an HMAC-SHA256-signed cookie — `httpOnly`, `sameSite=lax`, `secure`
in production, 12-hour expiry (one long shift). The signature is verified in
constant time and the expiry is checked server-side.

Both are dependency-free implementations of two well-understood primitives.
That is a deliberate call for a single-cafe pilot with three logins: it is
easier to audit forty lines than to go and read a framework's defaults. It is
also the first thing to replace if this ever serves many tenants — see below.

## Defence in depth

The guards are duplicated on purpose:

- `/kitchen` and `/admin` redirect unauthenticated visitors, **and** every
  `/api/kitchen/*` route calls `requireStaff()`, **and** every admin server
  action calls `requireOwner()`. Hiding a page is not access control; server
  actions are POST endpoints reachable by anyone who reads the page source.
- The basket clamps quantities to 1–20 in the browser so the UI never shows a
  number the server would silently reduce — but the server clamps again, and
  only the server's clamp counts.

## Response headers

Set in `next.config.ts` for every route: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options:
SAMEORIGIN`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`
— a menu page has no business asking for any of those, and a compromised
dependency asking is exactly what you want blocked.

## Privacy

The rate-limit log stores an HMAC of the client IP, truncated to 128 bits, not
the address. It only needs to answer "was this the same client, in the last two
minutes"; it does not need to be a list of everyone's IP sitting on disk.

Guest names and kitchen notes are stored in plain text — the kitchen has to
read them. They are only ever exposed to authenticated staff and to the guest
holding the order's token.

## Before this serves more than one cafe

The current model is single-tenant with the application as the only gatekeeper.
Every row already carries `restaurant_id` and every query already filters on
it, so the migration is additive rather than a rewrite — but three things
should change:

1. **Move to Postgres with RLS on.** `supabase/migrations/0001_init.sql` has
   the policies. With RLS, isolation stops depending on the application
   remembering to filter and starts being enforced by the database.
2. **Move sessions to a real auth provider** with rotation, revocation and
   MFA. The HMAC cookie has no revocation list; signing out clears the cookie
   but a copied cookie stays valid until it expires.
3. **Move rate limiting to the edge.** The current limiter is per-table and
   lives behind the app; a shared cafe IP or a distributed client is not
   modelled.

## Reporting

This is a pilot deployment for one cafe. Send anything you find to the
repository owner directly rather than opening a public issue.
