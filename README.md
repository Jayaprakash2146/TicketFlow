# TicketFlow

A full-stack, real-time ticket booking platform for **movies and concerts**. Customers pick seats from a live visual seat map, seats are held with a configurable TTL and auto-released on checkout abandonment, sold-out events open per-category waitlists with automatic seat assignment on cancellation, and every confirmed booking emails a QR-code ticket.

| | |
|---|---|
| **Stack** | Next.js 14 (App Router, TypeScript) - API + frontend in one deployable unit |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | JWT sessions in httpOnly cookies, bcrypt hashing, role-based (Customer / Organizer / single Admin) |
| **Email** | Nodemailer over SMTP (Gmail tested); built-in admin mailbox fallback |
| **Tickets** | QR PNG (data-URL) encoding the booking reference, emailed + downloadable |
| **Deployment** | Vercel / Render ready, cron endpoint for TTL sweeps |

---

## Table of contents

1. [Setup guide](#1-setup-guide)
2. [Environment variables (.env.example)](#2-environment-variables-envexample)
3. [API documentation](#3-api-documentation)
4. [Database schema](#4-database-schema)
5. [Seat hold & TTL logic](#5-seat-hold--ttl-logic)
6. [Waitlist & auto-assignment logic](#6-waitlist--auto-assignment-logic)
7. [Roles & demo accounts](#7-roles--demo-accounts)
8. [Deployment](#8-deployment)

---

## 1. Setup guide

**Prerequisites:** Node.js 18+, npm, and a PostgreSQL database (local install, Docker, or a free hosted instance from Neon / Render / Supabase).

```bash
# 1. clone and install (postinstall runs `prisma generate`)
git clone https://github.com/Jayaprakash2146/TicketFlow.git
cd TicketFlow
npm install

# 2. configure environment
cp .env.example .env
#    -> edit .env: set DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
#    -> optionally set SMTP_* to enable real email delivery

# 3. create the database schema (15 tables, no migration files needed)
npm run db:push

# 4. seed: single admin account + 2 sample events (no demo bookings/emails)
npm run db:seed

# 5. run
npm run dev          # http://localhost:3000
```

Other useful scripts:

| Script | Purpose |
|---|---|
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm run typecheck` | Strict TypeScript check, zero errors |
| `npm run db:push` | Sync `prisma/schema.prisma` to the database |
| `npm run db:seed` | Reset + seed (admin, organizer, 2 events) |
| `npm run worker` | Optional background TTL sweeper loop (self-hosting only) |

**Quick functional test after setup:**

1. Register a customer account (`/register`), open an event, pick seats on the live map.
2. Confirm checkout within the hold TTL - the QR ticket appears under **My Bookings** and is emailed (with SMTP configured; otherwise archived in **Admin -> System mailbox**).
3. With a second account, book out a category, have the other account join the waitlist, then cancel - the freed seat is auto-offered to the next in line with a time-limited email link.

---

## 2. Environment variables (.env.example)

The committed `.env.example` (`.env` itself is git-ignored):

```ini
# ------------------------------------------------------------------
# Database (PostgreSQL)
# ------------------------------------------------------------------
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketflow?schema=public"
# Neon hosted example (use the pooled connection string):
# DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1"

# ------------------------------------------------------------------
# Auth
# ------------------------------------------------------------------
# Secret used to sign session JWTs (openssl rand -base64 32)
AUTH_SECRET="change-me-to-a-long-random-string"
# The single admin account created by `npm run db:seed`.
# This platform intentionally has exactly one admin - there is no admin signup.
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-me-strong-password"

# ------------------------------------------------------------------
# Seat hold TTL (minutes) - held seats auto-release after this
# ------------------------------------------------------------------
SEAT_HOLD_TTL_MINUTES="10"

# ------------------------------------------------------------------
# Waitlist offer TTL (minutes) - time given to accept an offered seat
# ------------------------------------------------------------------
WAITLIST_OFFER_TTL_MINUTES="15"

# ------------------------------------------------------------------
# Cron endpoint secret (protects /api/cron/expire)
# ------------------------------------------------------------------
CRON_SECRET="change-me-cron-secret"

# ------------------------------------------------------------------
# App URL (used inside waitlist offer emails / QR links)
# ------------------------------------------------------------------
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ------------------------------------------------------------------
# Email delivery via SMTP (any provider: Gmail, Brevo, Resend SMTP...)
# If left empty, emails are logged to the console and stored in the
# EmailLog table (viewable at /admin/emails) - great for development.
# ------------------------------------------------------------------
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="TicketFlow <you@example.com>"
```

Notes:

- **Gmail** requires a 16-character **App Password** (Google Account -> Security -> 2-Step Verification -> App passwords), not the login password. Verified working configuration: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` (SSL) or `587` (STARTTLS).
- The sender display name in `SMTP_FROM` is what recipients see (e.g. "TicketFlow"); the raw address is never shown anywhere in the UI.
- Without SMTP, nothing silently fails - every email is stored with its QR embedded in the admin mailbox, and failures record the exact provider error (`EAUTH`, host-not-found, timeout, etc.) with the **Send test email** tool at Admin -> System mailbox.

---

## 3. API documentation

Base URL: your deployment URL. Authentication uses an httpOnly session cookie (`tf_session`, signed JWT, 7-day expiry) returned by `POST /api/auth/login`.

Roles: `CUSTOMER`, `ORGANIZER`, `ADMIN`. Guarded endpoints return `401` (not signed in) or `403` (wrong role). Business-rule conflicts return `409`; expired holds/offers return `410`.

Error shape: `{ "error": "human readable message", ...extras }`

### Auth

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `POST /api/auth/register` | public | `{ name, email, password (min 8), role: CUSTOMER\|ORGANIZER }` | `201 { user }` - `409` if email exists. The ADMIN role is rejected: the platform has exactly one admin, provisioned by the seed |
| `POST /api/auth/login` | public | `{ email, password }` | `200 { user }` + session cookie - `401` on bad credentials |
| `POST /api/auth/logout` | session | - | `200 { ok: true }` (clears cookie) |
| `GET /api/auth/me` | public | - | `200 { user \| null }` |

### Events & seat map

| Method & path | Access | Description |
|---|---|---|
| `GET /api/events?q=&type=MOVIE\|CONCERT&city=` | public | Upcoming published events with live availability. `q` searches title, venue name, city and description; the keywords "movie"/"concert" map to type filters |
| `GET /api/events/cities` | public | All cities that have venues (feeds the searchable city filter) |
| `POST /api/events` | ORGANIZER, ADMIN | Create event with per-category pricing: `{ title, type, description, posterUrl?, venueId, startsAt, durationMin, prices: [{ categoryId, priceCents }] }` - `409` on venue time-slot overlap |
| `GET /api/events/:id` | public | Event detail incl. venue, organizer, prices |
| `DELETE /api/events/:id` | ORGANIZER owner, ADMIN | Refuses (`409`) if confirmed bookings exist |
| `GET /api/events/:id/seats` | public | **The seat map payload** - see below |

Seat-map response (runs TTL expiry first, so statuses are always fresh):

```jsonc
{
  "event":   { "id", "title", "type", "startsAt", "venue": { "name", "city", "seatRows", "seatCols" } },
  "categories": [ { "id", "name", "color", "priceCents", "total", "available", "booked", "soldOut" } ],
  "rows":    [ { "label": "A", "seats": [ { "id", "number", "colIndex", "categoryId", "status" } ] } ],
  "stats":   { "totalSeats", "availableSeats" },
  "soldOut": false,
  "mine":    { "holdId", "expiresAt", "seatIds" } | null,   // viewer's live hold
  "myWaitlist": [ { "categoryId", "status", "quantity", "position", "offer": { "id", "expiresAt" } } ],
  "holdTtlMinutes": 10
}
// seat.status: AVAILABLE | HELD | BOOKED | OFFERED
```

### Holds, bookings, tickets

| Method & path | Access | Description |
|---|---|---|
| `POST /api/events/:id/holds` | session | `{ seatIds: [] }` (max 10). Replaces caller's previous hold. `201 { holdId, expiresAt, seatLabels }`; `409 { seats: [...] }` if another customer just took a seat |
| `DELETE /api/events/:id/holds?holdId=` | session | Voluntary release (checkout abandonment) |
| `POST /api/bookings` | session | `{ holdId }` -> `201 { bookingId, reference }`; `410` if the hold expired; `409` if seats became unavailable. Sends the QR ticket email |
| `GET /api/bookings` | session | Caller's booking history |
| `GET /api/bookings/:id` | owner, ADMIN | Full booking incl. `qr` (data-URL PNG of the reference) |
| `POST /api/bookings/:id/cancel` | owner | Cancels, frees seats to the waitlist (see section 6), emails cancellation notice |

### Waitlist & offers

| Method & path | Access | Description |
|---|---|---|
| `POST /api/events/:id/waitlist` | session | `{ categoryId, quantity (1-6) }` - only allowed when the category is genuinely sold out (`400` otherwise, `409` if already queued). `201 { joined, position }` |
| `GET /api/offers/:id` | session | Offer detail with live expiry state, `offer.mine` ownership flag |
| `POST /api/offers/:id/accept` | offer owner | Accepts within the TTL -> booking + QR email. `410` if expired (seats were cascaded to the next customer); `403` if not the owner |

### Venues (ADMIN manages, ORGANIZER reads/creates own)

| Method & path | Access | Description |
|---|---|---|
| `GET /api/venues` | ORGANIZER, ADMIN | Venues with categories, seat/event counts, `mine` ownership flag |
| `POST /api/venues` | ORGANIZER, ADMIN | Create venue with painted layout: `{ name, address, city, categories: [{ name, color }], grid: rows x cols of category-index-or-null }` (max 26 rows, 40 cols, 1000 seats) |
| `GET /api/venues/:id` | ORGANIZER, ADMIN | Full layout |
| `PUT /api/venues/:id` | ADMIN or creator | Full layout replace; locked (`409`) once the venue hosts events |
| `DELETE /api/venues/:id` | ADMIN or creator | Only if no events |

### Organizer analytics, admin, scheduler

| Method & path | Access | Description |
|---|---|---|
| `GET /api/organizer/stats` | ORGANIZER, ADMIN | Portfolio totals + per-event capacity / seats sold / revenue |
| `GET /api/organizer/events/:id/stats` | owner, ADMIN | Per-event: totals, revenue by category, recent bookings (masked emails) |
| `GET /api/admin/users` | ADMIN | User list with roles and booking counts |
| `PATCH /api/admin/users/:id` | ADMIN | Switch customer <-> organizer. Assigning ADMIN is refused (`400`) - single-admin policy |
| `GET /api/admin/emails` | ADMIN | Last 50 system emails with sent/failed state and error reasons |
| `GET /api/admin/emails/:id` | ADMIN | Raw HTML of one email (QR embedded) |
| `GET /api/admin/smtp` | ADMIN | Live SMTP configuration status |
| `POST /api/admin/smtp` | ADMIN | `{ to }` - send a real test email; `502` with the translated provider error on failure |
| `GET\|POST /api/cron/expire` | bearer `CRON_SECRET` | TTL sweeper: releases expired holds, expires stale offers and cascades freed seats to the next waiters |
| `GET /api/health` | public | `{ ok, db: "up" \| "down" }` |
| `GET /api/config` | public | `{ smtpConfigured, appUrl }` for client-side messaging |

Full request/response examples: [`docs/API.md`](./docs/API.md).

---

## 4. Database schema

Defined in [`prisma/schema.prisma`](./prisma/schema.prisma), pushed with `prisma db push`.

```text
┌─────────────┐      ┌────────────────┐      ┌──────────────┐
│    User     │      │     Venue      │     │ SeatCategory │
│─────────────│      │────────────────│      │──────────────│
│ id (cuid)   │◇─────│ createdById ───│◇────▶│ id           │
│ name        │      │ id             │      │ venueId      │
│ email  uniq │      │ name, address  │      │ name, color  │
│ passwordHash│      │ city           │      │ uniq(venueId,│
│ role        │      │ seatRows,      │      │        name) │
│  CUSTOMER / │      │ seatCols       │      └──────┬───────┘
│  ORGANIZER/ │      └───────┬────────┘             │
│  ADMIN      │              │                      │
└──┬──────────┘         ┌────▼─────┐          ┌─────▼──────┐
   │                    │   Seat   │          │ EventPrice │
   │ organizer          │──────────│          │────────────│
   │                    │ id       │          │ eventId ───│──┐
   │                    │ venueId  │          │ categoryId │  │
   │                    │ rowLabel │          │ priceCents │  │
   │                    │ rowIndex │          │ uniq(event │  │
   │                    │ colIndex │          │  ,category)│  │
   │                    │ number   │          └────────────┘  │
   │                    │ categoryId              ▲          │
   │                    │ uniq(venueId,           │          │
   │                    │  rowIndex, colIndex)    │          │
   │                    └────┬───────────────────┘          │
   │                         │                              │
   │  ┌──────────────────────▼──────────────────────────────▼──┐
   │  │                        Event                           │
   │  │────────────────────────────────────────────────────────│
   │  │ id, title, type (MOVIE|CONCERT), description, posterUrl│
   │  │ venueId, organizerId, startsAt, durationMin,           │
   │  │ status (PUBLISHED|CANCELLED)                           │
   │  └──┬──────────────┬───────────────┬──────────────┬───────┘
   │     │              │               │              │
   │  ┌──▼───┐       ┌──▼────────┐   ┌──▼──────────┐ ┌─▼──────────────┐
   │  │ Hold │       │ SeatLock  │   │  Booking    │ │ WaitlistEntry  │
   │  │──────│       │───────────│   │─────────────│ │────────────────│
   │  │ id   │       │ id        │   │ id          │ │ id             │
   │  │evenId│       │ eventId   │   │ reference   │ │ eventId        │
   │  │userId│       │ seatId    │   │  (uniq, in  │ │ categoryId     │
   │  │status│       │ type      │   │   QR code)  │ │ userId         │
   │  │ACTIVE│       │  HOLD /   │   │ userId      │ │ quantity (1-6) │
   │  │RELEAS│       │  BOOKING /│   │ status      │ │ status WAITING/│
   │  │EXPIRE│       │  OFFER    │   │ CONFIRMED/  │ │  OFFERED/BOOKED│
   │  │CONVRT│       │ holdId?   │   │  CANCELLED  │ │  /EXPIRED/LEFT │
   │  │expire│       │ bookingId?│   │ totalCents  │ │ joinedAt       │
   │  └──┬───┘       │ offerId?  │   └──────┬──────┘ └──────┬─────────┘
   │     │           │ expiresAt?│          │               │
   │  ┌──▼──────┐    │  (null =  │       ┌──▼─────────┐  ┌──▼─────────────┐
   │  │HoldSeat │    │  permanent│       │BookingSeat │  │ WaitlistOffer  │
   │  │─────────│    │  BOOKING) │       │────────────│  │────────────────│
   │  │ holdId  │    │ UNIQUE    │       │ bookingId  │  │ id, entryId    │
   │  │ seatId  │    │ (eventId, │       │ seatId     │  │ eventId,       │
   │  └─────────┘    │  seatId)  │◄──────│ priceCents │  │  categoryId    │
   │                └─────┬─────┘  the  └────────────┘  │ status ACTIVE/ │
   │                      │        unique  ┌────────────┐│  ACCEPTED/     │
   │                 ┌────▼────┐   index   │ OfferSeat  ││  EXPIRED       │
   │                 │1 row per│   is the │──────────── ││ expiresAt      │
   │                 │unavail- │   concur-│ offerId    ││ acceptedBooking│
   │                 │able seat│   rency  │ seatId     ││ Id?            │
   │                 │for show │   arbiter└────────────┘└────────────────┘
   │                 └─────────┘
   │
   │  ┌────────────┐   ┌──────────────┐
   ├─▶│  Booking   │   │  EmailLog    │ (every email produced: to, subject,
   │  │  Waitlist  │   │  sent bool,  │  html w/ embedded QR, error reason)
   │  │  Offer     │   │  createdAt   │  doubles as dev mailbox
   │  └────────────┘   └──────────────┘

   enums: Role, EventType (MOVIE|CONCERT), EventStatus, HoldStatus,
          LockType (HOLD|BOOKING|OFFER), BookingStatus, WaitlistStatus, OfferStatus
```

Key design decisions:

- **`SeatLock` is the single source of truth for unavailability.** A seat is unavailable for an event **iff** a lock row exists for `(eventId, seatId)`. The database-level `UNIQUE(eventId, seatId)` index is the concurrency arbiter - no two holds/bookings/offers can coexist for one seat.
- **Per-show status is derived, never duplicated.** Seats belong to the venue; events inherit the grid; statuses come from locks. No denormalized counters to drift.
- **Money is stored in integer cents** (`priceCents`, `totalCents`) - no floating-point errors.
- **`EmailLog` doubles as the dev mailbox**, storing the exact HTML (with inline QR) plus the delivery error, if any.

---

## 5. Seat hold & TTL logic

### Placing a hold

When a customer taps **Hold & checkout**, `POST /api/events/:id/holds` runs **one Prisma interactive transaction**:

1. Replace the caller's previous active hold on this event (delete its locks, mark `RELEASED`) - one live hold per user per event.
2. Fail fast if any requested seat already has a lock.
3. Create a `Hold` row with `expiresAt = now + SEAT_HOLD_TTL_MINUTES` (default 10, env-configurable) and one `SeatLock` row per seat with `type=HOLD` carrying the same deadline.

The moment the transaction commits, every other customer sees those seats as **HELD** (amber) on the live map, which polls `/api/events/:id/seats` every 4 seconds. The customer gets a countdown-driven checkout modal.

### Concurrency protection (why two customers can never hold the same seat)

Three independent layers, innermost wins:

1. **Database unique index** - `UNIQUE(eventId, seatId)` on `SeatLock`. Two racing `INSERT`s for the same seat cannot both commit; PostgreSQL rejects the loser with a unique violation.
2. **Transaction-level check** - the hold transaction first `SELECT`s existing locks for the requested seats and returns a friendly `409 { seats: [...] }` naming the just-taken seats.
3. **API translation** - a caught unique violation is converted into the same `409`; the UI refreshes the map and clears the dead selection.

Booking confirmation is equally atomic: one transaction verifies the hold is still `ACTIVE` and unexpired, creates the `Booking` + priced `BookingSeat` rows, **deletes the `HOLD` locks and inserts permanent `BOOKING` locks** - all or nothing. There is no code path that can mark a seat sold without owning its lock row.

### TTL enforcement - lazy-first, scheduler-assisted

Every request that touches availability (seat-map reads, hold placement, booking confirmation, waitlist joins, offer acceptance) first calls `releaseExpired()`:

```text
releaseExpired():
  1. find SeatLocks where expiresAt < now  AND type in (HOLD, OFFER)
  2. in one transaction:
       - HOLD locks   -> hold.status = EXPIRED,   locks deleted
       - OFFER locks  -> offer.status = EXPIRED,  waitlist entry = EXPIRED,
                         locks deleted
  3. seats freed by expired OFFERs are immediately re-offered
     to the next waitlist customer (section 6)
```

Because the seat map polls continuously while anyone is watching an event, abandoned checkouts are released within seconds in practice - **without any scheduler**. This makes expiry correct on serverless platforms (Vercel/Render free tiers) where in-process timers cannot be trusted.

On top of the lazy sweep:

- `GET|POST /api/cron/expire` (secret-protected) runs the same sweep - wired to Vercel Cron in `vercel.json`, or any external scheduler, or Render Cron Jobs.
- `npm run worker` provides a 20-second loop for long-lived self-hosted processes.

Voluntary abandonment (closing the checkout modal) releases the hold explicitly via `DELETE /api/events/:id/holds` - seats return to AVAILABLE for everyone within seconds.

---

## 6. Waitlist & auto-assignment logic

### Joining

A customer may join a waitlist **only for a genuinely sold-out category** (server-verified: every seat of that category locked as `BOOKING`). The entry stores a desired quantity (1-6); FIFO position derives from `joinedAt`. One active entry per user per category.

### Auto-assignment on cancellation

When a booking is cancelled, its `BOOKING` locks are deleted and `processFreedSeats(eventId, seatIds)` runs **before** the seats become publicly visible:

```text
processFreedSeats():
  group freed seats by category
  for each category (inside one transaction per group):
    while seats remain in the pool:
      1. take the earliest WAITING entry (FIFO by joinedAt)
         - none left  -> leftover seats become publicly AVAILABLE
      2. atomically claim it:  UPDATE ... WHERE status = 'WAITING'
         (a conditional updateMany - concurrent cancellations
          can never double-assign the same entry)
      3. re-check no lock appeared on the offered seats meanwhile;
         if it did, roll the entry back to WAITING and stop
      4. give it min(entry.quantity, pool) seats:
           - WaitlistOffer  { status: ACTIVE, expiresAt: now + TTL }
           - SeatLock rows  { type: OFFER, expiresAt }   <- seats vanish
                                                           from the map
           - OfferSeat rows
      5. shrink the pool; continue down the queue
  after commit: send each offered customer an email with a
  time-limited acceptance link (/offers/:id)
```

Emails are sent after the transaction commits, so a mail outage can never block or roll back the seat allocation.

### Time-limited offers

- The offer email links to `/offers/:id`, which shows the seats, total price and a **live countdown** (`WAITLIST_OFFER_TTL_MINUTES`, default 15).
- **Accept** - one transaction: atomically claim the offer (`WHERE status='ACTIVE'`), verify its `OFFER` locks still exist, create the `Booking` + `BOOKING` locks, mark the entry `BOOKED`, then email the QR ticket. Concurrent accepts cannot both win; a second attempt gets `410`.
- **Expire** - when the deadline passes, the next `releaseExpired()` sweep marks the offer and its entry `EXPIRED` (the customer forfeits their turn; they may rejoin) and **recursively feeds the freed seats back through `processFreedSeats`**, offering them to the following customer with a fresh TTL. The cascade repeats until someone accepts or the queue drains - strictly in order, no matter how many customers ignore their offers.
- Offers are ownership-checked: another customer attempting to accept gets `403`.

### End-to-end example

1. Concert sells out; Karan joins the Regular waitlist (position #1), Vikram #2.
2. Priya cancels her 2 Regular seats -> `processFreedSeats` offers both to Karan (email link, 15-min TTL), seats show violet OFFERED on the map.
3. Karan ignores it -> 15 minutes later the sweep expires his offer and instantly re-offers the seats to Vikram.
4. Vikram accepts within his window -> `BOOKING` locks replace the `OFFER` locks, QR email goes out, seats turn slate BOOKED.

---

## 7. Roles & demo accounts

| Role | Capabilities | Account |
|---|---|---|
| **ADMIN** (exactly one) | Venue layout builder, user role management (customer <-> organizer), system mailbox + SMTP test, full organizer powers | provisioned by the seed from `ADMIN_EMAIL` / `ADMIN_PASSWORD` - no admin signup, no admin role assignment anywhere |
| **ORGANIZER** | Create events, create own venues (paint layouts inline), pricing per category, revenue dashboards, cancel own eventless venues | register at `/register` |
| **CUSTOMER** | Browse/search/filter events, live seat map, holds, bookings + QR tickets, cancellation, waitlists, offer acceptance | register at `/register` |

After `npm run db:seed`: the single admin (from your `.env`), one sample organizer (`organiser@ticketflow.dev` / `Password@123`) owning **exactly 2 sample events** (one movie, one concert), and **no demo customers, bookings, waitlists or emails** - history and the mailbox contain only real activity. Page-level access is enforced by route middleware (`/admin/*`, `/organizer/*`, `/bookings/*`, `/offers/*`) and every API route re-checks roles server-side.

---

## 8. Deployment

### Render (verified working)

1. **PostgreSQL**: New -> PostgreSQL, copy the **External Database URL**.
2. **Web service**: New -> Web Service -> connect the GitHub repo. Build `npm install && npm run build`, start `npm start`.
3. **Environment variables**: all values from section 2, with:
   - `DATABASE_URL` = external DB URL + `?sslmode=require`
   - `NEXT_PUBLIC_APP_URL` = your Render URL (`https://<app>.onrender.com`)
   - `SMTP_PORT=465` (Render free tier blocks outbound 587)
4. **One-time from your machine**:
   ```powershell
   $env:DATABASE_URL = "<external url>?sslmode=require"
   $env:ADMIN_EMAIL = "..."; $env:ADMIN_PASSWORD = "..."
   npm run db:push
   npm run db:seed
   ```
5. Optional: Render Cron Job hitting `/api/cron/expire?secret=<CRON_SECRET>` every 10 minutes.
6. Verify: `/api/health` -> `db: "up"`; landing shows 2 events; admin login; Admin -> System mailbox -> Send test email.

### Render Deployment Live Link


Live Link(Render) :https://ticketflow-2-fazx.onrender.com
