# TicketFlow - API Reference

Base URL: `http://localhost:3000` (dev) or your deployment URL.

Authentication uses an httpOnly session cookie (`tf_session`, JWT, 7-day expiry) set by
`POST /api/auth/login`. Roles: `CUSTOMER`, `ORGANIZER`, `ADMIN`. Guarded endpoints return
`401` (not signed in) or `403` (wrong role). Business-rule failures return `409` (conflict) or
`410` (expired hold/offer).

Error shape: `{ "error": "human readable message", ...extras }`

---

## Auth

### POST /api/auth/register
Create a customer or organizer account.
```json
{ "name": "Jane Doe", "email": "jane@x.com", "password": "min8chars", "role": "CUSTOMER" }
```
`201 { "user": { "id", "name", "email", "role" } }` - `409` if email exists.

### POST /api/auth/login
```json
{ "email": "priya@ticketflow.dev", "password": "Customer@123" }
```
`200 { "user": { ... } }` + sets session cookie. `401` on bad credentials.

### POST /api/auth/logout
Clears the session cookie. `200 { "ok": true }`

### GET /api/auth/me
`200 { "user": SessionUser | null }`

---

## Events

### GET /api/events?q=&type=MOVIE|CONCERT&city=
List published, upcoming events with live availability.
```json
{ "events": [ { "id", "title", "type", "startsAt", "venue": {"name","city"},
  "minPriceCents", "capacity", "booked", "available", "soldOut", "fewLeft" } ] }
```

### POST /api/events  (ORGANIZER, ADMIN)
Create an event with per-category pricing.
```json
{
  "title": "Interstellar", "type": "MOVIE", "description": "...",
  "posterUrl": "https://...",            // optional
  "venueId": "venue_id", "startsAt": "2026-09-01T19:30:00.000Z",
  "durationMin": 169,
  "prices": [ { "categoryId": "cat_id", "priceCents": 55000 } ]
}
```
`201 { "event": { "id", ... } }` - `409` on venue time-slot overlap.

### GET /api/events/:id
Full event detail incl. venue, organizer, prices per category.

### DELETE /api/events/:id  (ORGANIZER owner, ADMIN)
`409` if the event has confirmed bookings.

### GET /api/events/:id/seats
**The seat map payload.** Runs TTL expiry first, then returns:
```json
{
  "event": { "id", "title", "type", "startsAt", "venue": { "name", "city", "seatRows", "seatCols" }, ... },
  "categories": [ { "id", "name", "color", "priceCents", "total", "available", "booked", "soldOut" } ],
  "rows": [ { "label": "A", "seats": [ { "id", "number", "colIndex", "categoryId", "status" } ] } ],
  "stats": { "totalSeats", "availableSeats" },
  "soldOut": false,
  "mine": { "holdId", "expiresAt", "seatIds" } | null,
  "myWaitlist": [ { "categoryId", "status", "quantity", "position", "offer": { "id", "expiresAt" } } ],
  "holdTtlMinutes": 10
}
```
`status` per seat: `AVAILABLE | HELD | BOOKED | OFFERED`.

---

## Holds

### POST /api/events/:id/holds  (signed in)
Place a TTL hold on selected seats (max 10). Replaces any previous active hold of the caller.
```json
{ "seatIds": ["seat1", "seat2"] }
```
`201 { "holdId", "expiresAt", "seatLabels": ["C4","C5"] }`
- `409 { "error": "...", "seats": ["C5"] }` if another customer just took a seat.

### DELETE /api/events/:id/holds?holdId=...  (signed in)
Voluntarily release a hold (checkout abandonment). `200 { "released": true }`

---

## Bookings

### POST /api/bookings  (signed in)
Confirm a hold into a booking. Sends the QR ticket email.
```json
{ "holdId": "..." }
```
`201 { "bookingId", "reference": "TF-XXXXXX" }`
- `410` if the hold expired/was released. `409` if seats became unavailable.

### GET /api/bookings  (signed in)
Booking history of the caller with seats and event summaries.

### GET /api/bookings/:id  (owner or ADMIN)
Full booking incl. `qr` (data-URL PNG encoding the reference).

### POST /api/bookings/:id/cancel  (owner)
Cancel a confirmed booking. Frees the seats, offers them to the waitlist (see below) and
emails a cancellation notice. `200 { "cancelled": true }`

---

## Waitlist

### POST /api/events/:id/waitlist  (signed in)
Join the waitlist for a **sold-out** category.
```json
{ "categoryId": "cat_id", "quantity": 2 }
```
`201 { "joined": true, "position": 3 }` - `400` if the category still has seats,
`409` if already queued.

---

## Waitlist offers

### GET /api/offers/:id
Offer details with live expiry state. `offer.mine` tells whether the caller owns it.
```json
{ "offer": { "id", "status", "expired", "expiresAt", "mine", "event": {...},
             "categoryName", "seats": ["F2","F3"], "totalCents" }, "offerTtlMinutes": 15 }
```

### POST /api/offers/:id/accept  (offer owner)
Accept within the TTL; converts the offer into a confirmed booking and emails the QR ticket.
`201 { "bookingId", "reference" }` - `410` if expired (seats were cascaded to the next customer).

---

## Venues (ADMIN manages, ORGANIZER reads)

### GET /api/venues  (ORGANIZER, ADMIN)
Venues with categories, seat counts, event counts.

### POST /api/venues  (ADMIN)
Create a venue with a painted layout. `grid[row][col]` holds the category index or `null` (aisle).
```json
{
  "name": "Lumo Grand", "address": "42 MG Road", "city": "Bengaluru",
  "categories": [ { "name": "Premium", "color": "#f59e0b" } ],
  "grid": [ ["0","0",null], ["0","0","0"] ]
}
```

### GET /api/venues/:id  (ORGANIZER, ADMIN) / PUT /api/venues/:id (ADMIN, layout locked once events exist) / DELETE (ADMIN, only without events)

---

## Organizer analytics

### GET /api/organizer/stats  (ORGANIZER, ADMIN)
Portfolio stats + per-event capacity/seats-sold/revenue.

### GET /api/organizer/events/:id/stats  (owner or ADMIN)
Per-event summary: totals, revenue by category, recent bookings (masked emails).

---

## Admin utilities

- `GET /api/admin/users` - user list with roles and booking counts.
- `GET /api/admin/emails` - last 50 system emails (dev mailbox).
- `GET /api/admin/emails/:id` - raw HTML of one email (QR embedded).

## Scheduler

### GET|POST /api/cron/expire
TTL sweeper (releases expired holds + expired waitlist offers and cascades freed seats to
the next waiters). Protect with `Authorization: Bearer <CRON_SECRET>` (open when
`CRON_SECRET` is unset for local use). Vercel Cron calls it daily; any external scheduler
can call it every minute.

### GET /api/health
`{ "ok": true, "db": "up" | "down" }`
