# TicketFlow - System Design Write-up

**Word count: ~760**

## Seat hold and TTL mechanism

Every seat that is unavailable for an event is unavailable for exactly one reason: a row exists in the
`SeatLock` table for that `(eventId, seatId)` pair. A lock has a type — `HOLD`, `BOOKING`, or `OFFER` —
and an optional `expiresAt`. Seats with no lock row are, by definition, available.

When a customer confirms a seat selection, `POST /api/events/:id/holds` opens a single Prisma
interactive transaction that (1) writes a `Hold` record with `expiresAt = now + SEAT_HOLD_TTL_MINUTES`
(configurable, default 10), and (2) inserts one `HOLD` lock per seat carrying the same deadline.
Other customers immediately see those seats as "held" (amber) on the live map, which refreshes every
four seconds.

TTL enforcement is **lazy-first, scheduler-assisted**. Every request that touches availability — seat-map
reads, hold placement, booking confirmation, waitlist joins, offer acceptance — first calls
`releaseExpired()`, which deletes every `HOLD`/`OFFER` lock whose deadline has passed and marks the
corresponding hold/offer records expired. Because the seat map polls continuously while anyone is
looking at an event, abandoned checkouts are released within seconds in practice. For idle events,
`/api/cron/expire` (registered in `vercel.json` for Vercel Cron, or any external minute-level
scheduler, or `npm run worker` when self-hosting) drives the same sweep. This design keeps expiry
correct on serverless platforms where in-process timers cannot be trusted, without ever requiring a
customer to see a stale seat.

## Concurrency prevention

The `SeatLock` table carries a database-level `UNIQUE(eventId, seatId)` constraint, making PostgreSQL
itself the arbiter of every race. Two customers tapping the same seat simultaneously produce two
transactions that both try to insert a lock for that pair; only one commit succeeds. The loser receives
a unique-violation, which the API translates into a clean `409` naming the seats that were just taken,
and the UI refreshes the map automatically. The same guarantee covers bookings and waitlist offers,
since they occupy the same table.

State transitions are equally atomic. Confirming a booking happens in one transaction that verifies the
caller's hold is still active and unexpired, creates the `Booking` and priced `BookingSeat` rows,
deletes the `HOLD` locks, and inserts permanent `BOOKING` locks — all or nothing. Accepting a waitlist
offer additionally claims the offer with a conditional `updateMany({ status: "ACTIVE" })` so two
concurrent accepts cannot both win. There is no code path that can mark a seat sold without owning its
lock row, and no lock row can exist twice for one seat.

## Waitlist auto-assignment flow

Customers join a per-category waitlist only when that category is genuinely sold out (every seat locked
as `BOOKING`), enforced server-side. An entry stores a desired quantity (1–6) and its FIFO position is
derived from `joinedAt`.

When a booking is cancelled, its `BOOKING` locks are deleted and `processFreedSeats()` runs for the
freed seats. Seats are grouped by category; for each category, the engine repeatedly takes the earliest
`WAITING` entry and, inside one transaction, atomically claims it (`WAITING → OFFERED` via a conditional
update — concurrent cancellations can never double-assign), inserts `OFFER` locks for up to the entry's
requested quantity, records a `WaitlistOffer`, and continues down the queue while seats remain. Seats
with no takers simply become publicly available. The customer then receives an email with a deep link
to `/offers/:id` showing a live countdown.

## Time-limited offer handling

Offers carry their own TTL (`WAITLIST_OFFER_TTL_MINUTES`, default 15). Accepting converts `OFFER` locks
into `BOOKING` locks transactionally, marks the entry `BOOKED`, and sends the QR ticket email. If the
deadline passes, `releaseExpired()` marks the offer and its waitlist entry `EXPIRED` — the customer
forfeits their turn and may rejoin — and immediately feeds the freed seats back through
`processFreedSeats()`, offering them to the next customer in line. Cascading is recursive and
idempotent: each new offer receives a fresh TTL, and lock ownership is re-checked at every step, so the
queue drains strictly in order regardless of how many customers ignore their offers.

## Seat map data model and real-time updates

Layouts are painted per venue by the admin (rows A–Z, up to 40 columns, per-cell category colors) and
stored as concrete `Seat` rows; events inherit the venue's grid, so per-show status is derived, never
duplicated. `GET /api/events/:id/seats` returns the grid with per-seat status (`AVAILABLE / HELD /
BOOKED / OFFERED`), per-category price and availability, the viewer's own active hold (enabling
"resume checkout"), and their waitlist positions — after first running the TTL sweep, so responses are
always truthful. The frontend polls every four seconds, pauses on hidden tabs, and reconciles
optimistic selections with fresh server state, giving real-time semantics on plain serverless
infrastructure.

## QR generation and email delivery

Booking references (`TF-XXXXXXXX`, unambiguous alphabet) are generated with collision checks and
encoded as PNG QR data-URLs via the `qrcode` package. Nodemailer delivers a styled confirmation email
with the QR attached (CID) plus the reference in text; the identical HTML is stored in an `EmailLog`
"system mailbox" so the flow is fully demonstrable before any SMTP credentials are configured.
