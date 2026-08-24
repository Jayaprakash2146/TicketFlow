import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { OFFER_TTL_MINUTES, MAX_WAITLIST_QUANTITY } from "@/lib/constants";
import { sendWaitlistOfferEmail } from "@/lib/email";

/**
 * Waitlist auto-assignment.
 *
 * Called whenever seats become free (booking cancellation, expired
 * waitlist offer). For every affected seat category the seats are offered
 * to waiting customers in strict FIFO order:
 *   - the next entry is atomically claimed (status WAITING -> OFFERED)
 *   - the seats are locked with type=OFFER and a fresh TTL
 *   - the customer gets an email with a time-limited acceptance link
 *   - remaining seats (if any) cascade to the following entries
 *   - seats with no takers become publicly available
 */
export async function processFreedSeats(eventId: string, seatIds: string[]): Promise<void> {
  if (seatIds.length === 0) return;

  const seats = await prisma.seat.findMany({
    where: { id: { in: seatIds } },
    select: { id: true, categoryId: true },
  });
  if (seats.length === 0) return;

  const byCategory = new Map<string, string[]>();
  for (const s of seats) {
    const arr = byCategory.get(s.categoryId) ?? [];
    arr.push(s.id);
    byCategory.set(s.categoryId, arr);
  }

  const created: {
    offerId: string;
    expiresAt: Date;
    entryUserId: string;
    email: string;
    name: string;
    eventTitle: string;
    categoryName: string;
    seatLabels: string[];
    priceCents: number;
  }[] = [];

  for (const [categoryId, catSeatIds] of byCategory) {
    try {
      await prisma.$transaction(async (tx) => {
        let pool = [...catSeatIds];

        while (pool.length > 0) {
          const entry = await tx.waitlistEntry.findFirst({
            where: { eventId, categoryId, status: "WAITING" },
            orderBy: { joinedAt: "asc" },
            include: { user: { select: { id: true, name: true, email: true } } },
          });
          if (!entry) break; // no more takers: leftover seats stay public

          const give = Math.min(entry.quantity, pool.length);
          if (give <= 0) break;
          const offeredSeatIds = pool.slice(0, give);

          // Atomic claim: exactly one concurrent transaction can win.
          const claim = await tx.waitlistEntry.updateMany({
            where: { id: entry.id, status: "WAITING" },
            data: { status: "OFFERED" },
          });
          if (claim.count === 0) continue; // someone else claimed; move on

          // Safety: never offer a seat that picked up a lock meanwhile.
          const taken = await tx.seatLock.findMany({
            where: { eventId, seatId: { in: offeredSeatIds } },
            select: { id: true },
          });
          if (taken.length > 0) {
            await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "WAITING" } });
            break;
          }

          const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60_000);
          const offer = await tx.waitlistOffer.create({
            data: { entryId: entry.id, eventId, categoryId, status: "ACTIVE", expiresAt },
          });
          await tx.seatLock.createMany({
            data: offeredSeatIds.map((seatId) => ({
              eventId,
              seatId,
              type: "OFFER" as const,
              offerId: offer.id,
              expiresAt,
            })),
          });
          await tx.offerSeat.createMany({
            data: offeredSeatIds.map((seatId) => ({ offerId: offer.id, seatId })),
          });

          pool = pool.slice(give);

          const offeredSeats = await tx.seat.findMany({
            where: { id: { in: offeredSeatIds } },
            select: { number: true },
          });
          const price = await tx.eventPrice.findUnique({
            where: { eventId_categoryId: { eventId, categoryId } },
            select: { priceCents: true },
          });
          const category = await tx.seatCategory.findUnique({
            where: { id: categoryId },
            select: { name: true },
          });
          const event = await tx.event.findUnique({ where: { id: eventId }, select: { title: true } });

          created.push({
            offerId: offer.id,
            expiresAt,
            entryUserId: entry.userId,
            email: entry.user.email,
            name: entry.user.name,
            eventTitle: event?.title ?? "your event",
            categoryName: category?.name ?? "the category",
            seatLabels: offeredSeats.map((s) => s.number).sort(),
            priceCents: give * (price?.priceCents ?? 0),
          });
        }
      });
    } catch (e) {
      console.error("[waitlist] auto-assignment failed for category", categoryId, e);
    }
  }

  // Emails are sent after the transaction commits so a mail outage can
  // never block or roll back the seat allocation.
  await Promise.all(
    created.map((c) =>
      sendWaitlistOfferEmail({
        to: c.email,
        name: c.name,
        eventTitle: c.eventTitle,
        categoryName: c.categoryName,
        seatLabels: c.seatLabels,
        priceCents: c.priceCents,
        offerId: c.offerId,
        expiresAt: c.expiresAt,
      }).catch((e) => console.error("[waitlist] offer email failed:", e)),
    ),
  );
}

/** Join the waitlist for a sold-out category. Enforces one active entry per user per category. */
export async function joinWaitlist(
  userId: string,
  eventId: string,
  categoryId: string,
  quantity: number,
) {
  if (quantity < 1 || quantity > MAX_WAITLIST_QUANTITY) {
    throw new HttpError(400, `Quantity must be between 1 and ${MAX_WAITLIST_QUANTITY}.`);
  }

  const [event, category] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { id: true, venueId: true, status: true, startsAt: true } }),
    prisma.seatCategory.findUnique({ where: { id: categoryId } }),
  ]);
  if (!event) throw new HttpError(404, "Event not found.");
  if (event.status !== "PUBLISHED") throw new HttpError(400, "This event is not open for booking.");
  if (!category || category.venueId !== event.venueId) throw new HttpError(400, "Invalid seat category.");
  if (event.startsAt.getTime() < Date.now()) throw new HttpError(400, "This event has already started.");

  const total = await prisma.seat.count({ where: { venueId: event.venueId, categoryId } });
  const booked = await prisma.seatLock.count({
    where: { eventId, type: "BOOKING", seat: { categoryId } },
  });
  if (booked < total) throw new HttpError(400, "This category still has seats available.");

  const existing = await prisma.waitlistEntry.findFirst({
    where: { eventId, categoryId, userId, status: { in: ["WAITING", "OFFERED"] } },
  });
  if (existing) throw new HttpError(409, "You are already on this waitlist.");

  const entry = await prisma.waitlistEntry.create({
    data: { eventId, categoryId, userId, quantity, status: "WAITING" },
  });

  const position = await waitlistPosition(eventId, categoryId, entry.joinedAt);
  return { entry, position };
}

/** Number of WAITING entries ahead of `joinedAt` (1-based rank). */
export async function waitlistPosition(eventId: string, categoryId: string, joinedAt: Date): Promise<number> {
  const ahead = await prisma.waitlistEntry.count({
    where: { eventId, categoryId, status: "WAITING", joinedAt: { lt: joinedAt } },
  });
  return ahead + 1;
}
