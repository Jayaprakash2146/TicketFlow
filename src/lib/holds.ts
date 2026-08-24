import crypto from "crypto";
import { prisma } from "@/lib/db";
import { HttpError, isUniqueViolation } from "@/lib/http";
import { MAX_SEATS_PER_BOOKING } from "@/lib/constants";
import { releaseExpired } from "@/lib/expire";
import { processFreedSeats } from "@/lib/waitlist";
import { sendBookingConfirmationEmail, sendCancellationEmail } from "@/lib/email";
import { qrDataUrl } from "@/lib/qr";
import type { SessionUser } from "@/lib/auth";

/**
 * Seat hold + booking lifecycle.
 *
 * Every state change goes through the SeatLock table whose
 * UNIQUE(eventId, seatId) index is the concurrency arbiter: two
 * customers racing for the same seat cannot both insert a lock row,
 * so at most one hold/booking/offer ever wins.
 */

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

async function genReference(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    let code = "";
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 8; j++) code += REF_ALPHABET[bytes[j] % REF_ALPHABET.length];
    const reference = `TF-${code}`;
    const clash = await prisma.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  throw new HttpError(500, "Could not allocate a booking reference.");
}

async function loadEventOrThrow(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { venue: true, prices: true },
  });
  if (!event) throw new HttpError(404, "Event not found.");
  if (event.status !== "PUBLISHED") throw new HttpError(400, "This event is not open for booking.");
  if (event.startsAt.getTime() < Date.now()) throw new HttpError(400, "This event has already started.");
  return event;
}

/** Place a time-limited hold on the selected seats. */
export async function createHold(user: SessionUser, eventId: string, requestedSeatIds: string[]) {
  await releaseExpired();

  const seatIds = Array.from(new Set(requestedSeatIds));
  if (seatIds.length === 0) throw new HttpError(400, "Select at least one seat.");
  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    throw new HttpError(400, `You can book up to ${MAX_SEATS_PER_BOOKING} seats at a time.`);
  }

  const event = await loadEventOrThrow(eventId);

  const seats = await prisma.seat.findMany({
    where: { id: { in: seatIds }, venueId: event.venueId },
    select: { id: true, number: true },
  });
  if (seats.length !== seatIds.length) throw new HttpError(400, "Invalid seat selection.");

  const expiresAt = new Date(Date.now() + holdTtlMs());

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Replace the user's previous active hold on this event.
      const prev = await tx.hold.findFirst({
        where: { eventId, userId: user.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (prev) {
        await tx.seatLock.deleteMany({ where: { holdId: prev.id } });
        await tx.hold.update({ where: { id: prev.id }, data: { status: "RELEASED" } });
      }

      // Fail fast if any seat is already taken.
      const taken = await tx.seatLock.findMany({
        where: { eventId, seatId: { in: seatIds } },
        select: { seatId: true },
      });
      if (taken.length > 0) return { conflictSeatIds: taken.map((t) => t.seatId) };

      const hold = await tx.hold.create({
        data: { eventId, userId: user.id, status: "ACTIVE", expiresAt },
      });
      await tx.holdSeat.createMany({ data: seatIds.map((seatId) => ({ holdId: hold.id, seatId })) });
      await tx.seatLock.createMany({
        data: seatIds.map((seatId) => ({
          eventId,
          seatId,
          type: "HOLD" as const,
          holdId: hold.id,
          expiresAt,
        })),
      });
      return { hold };
    });

    if ("conflictSeatIds" in result && result.conflictSeatIds) {
      const labels = seats.filter((s) => result.conflictSeatIds!.includes(s.id)).map((s) => s.number);
      throw new HttpError(409, "Some seats were just taken by another customer.", { seats: labels });
    }
    return { hold: result.hold!, seatLabels: seats.map((s) => s.number).sort() };
  } catch (e) {
    // Concurrent insert lost the race at the DB unique index.
    if (isUniqueViolation(e)) {
      throw new HttpError(409, "Some seats were just taken by another customer.");
    }
    throw e;
  }
}

/** Voluntarily release a hold (checkout abandonment / deselect). */
export async function releaseHold(user: SessionUser, holdId: string) {
  const hold = await prisma.hold.findUnique({ where: { id: holdId } });
  if (!hold || hold.userId !== user.id) throw new HttpError(404, "Hold not found.");
  if (hold.status !== "ACTIVE") return { released: true };

  await prisma.$transaction(async (tx) => {
    await tx.seatLock.deleteMany({ where: { holdId } });
    await tx.hold.update({ where: { id: holdId }, data: { status: "RELEASED" } });
  });
  return { released: true };
}

/** Convert an active hold into a confirmed booking + QR ticket email. */
export async function confirmBooking(user: SessionUser, holdId: string) {
  await releaseExpired();

  const hold = await prisma.hold.findUnique({
    where: { id: holdId },
    include: {
      seats: { include: { seat: { include: { category: true } } } },
      event: { include: { venue: true, prices: true } },
    },
  });
  if (!hold || hold.userId !== user.id) throw new HttpError(404, "Hold not found.");
  if (hold.status !== "ACTIVE") {
    throw new HttpError(410, "This hold is no longer active. Please select your seats again.");
  }
  if (hold.expiresAt.getTime() <= Date.now()) {
    await prisma.$transaction(async (tx) => {
      await tx.seatLock.deleteMany({ where: { holdId } });
      await tx.hold.update({ where: { id: holdId }, data: { status: "EXPIRED" } });
    });
    throw new HttpError(410, "Your seat hold expired. Please select your seats again.");
  }

  const priceByCategory = new Map(hold.event.prices.map((p) => [p.categoryId, p.priceCents]));
  const seatIds = hold.seats.map((s) => s.seatId);
  const totalCents = hold.seats.reduce((sum, s) => sum + (priceByCategory.get(s.seat.categoryId) ?? 0), 0);
  const reference = await genReference();

  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      const locks = await tx.seatLock.findMany({
        where: { holdId, seatId: { in: seatIds } },
        select: { id: true, seatId: true },
      });
      if (locks.length !== seatIds.length) {
        throw new HttpError(409, "Some of your seats are no longer available.");
      }

      const booking = await tx.booking.create({
        data: { reference, eventId: hold.eventId, userId: user.id, status: "CONFIRMED", totalCents },
      });
      await tx.bookingSeat.createMany({
        data: hold.seats.map((s) => ({
          bookingId: booking.id,
          seatId: s.seatId,
          priceCents: priceByCategory.get(s.seat.categoryId) ?? 0,
        })),
      });

      // Atomically swap HOLD locks for permanent BOOKING locks.
      await tx.seatLock.deleteMany({ where: { id: { in: locks.map((l) => l.id) } } });
      await tx.seatLock.createMany({
        data: seatIds.map((seatId) => ({
          eventId: hold.eventId,
          seatId,
          type: "BOOKING" as const,
          bookingId: booking.id,
        })),
      });
      await tx.hold.update({ where: { id: holdId }, data: { status: "CONVERTED" } });
      return booking.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "Some of your seats are no longer available.");
    throw e;
  }

  // QR + email after commit; failures never invalidate the booking.
  const qr = await qrDataUrl(reference).catch(() => "");
  await sendBookingConfirmationEmail({
    to: user.email,
    name: user.name,
    reference,
    eventTitle: hold.event.title,
    eventStartsAt: hold.event.startsAt,
    venue: hold.event.venue.name,
    city: hold.event.venue.city,
    seats: hold.seats.map((s) => s.seat.number).sort(),
    totalCents,
    qr,
  }).catch((e) => console.error("[booking] confirmation email failed:", e));

  return { bookingId, reference };
}

/** Cancel a confirmed booking; freed seats cascade to the waitlist. */
export async function cancelBooking(user: SessionUser, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: { select: { id: true, title: true, startsAt: true } },
      seats: { include: { seat: { select: { id: true, number: true } } } },
    },
  });
  if (!booking || booking.userId !== user.id) throw new HttpError(404, "Booking not found.");
  if (booking.status !== "CONFIRMED") throw new HttpError(400, "This booking is already cancelled.");
  if (booking.event.startsAt.getTime() < Date.now()) {
    throw new HttpError(400, "This event has already taken place.");
  }

  const seatIds = booking.seats.map((s) => s.seat.id);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.seatLock.deleteMany({ where: { bookingId } });
  });

  // Offer the seats to the waitlist before they become publicly visible.
  await processFreedSeats(booking.eventId, seatIds);

  await sendCancellationEmail({
    to: user.email,
    name: user.name,
    eventTitle: booking.event.title,
    seats: booking.seats.map((s) => s.seat.number).sort(),
    refundCents: booking.totalCents,
  }).catch((e) => console.error("[booking] cancellation email failed:", e));

  return { cancelled: true };
}

/** Accept a time-limited waitlist offer. */
export async function acceptOffer(user: SessionUser, offerId: string) {
  await releaseExpired();

  const offer = await prisma.waitlistOffer.findUnique({
    where: { id: offerId },
    include: {
      entry: { include: { user: { select: { id: true, name: true, email: true } } } },
      seats: { include: { seat: { include: { category: true } } } },
      event: { include: { venue: true, prices: true } },
    },
  });
  if (!offer) throw new HttpError(404, "Offer not found.");
  if (offer.entry.userId !== user.id) throw new HttpError(403, "This offer belongs to another customer.");
  if (offer.status !== "ACTIVE" || offer.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(410, "This offer has expired and the seats were offered to the next customer.");
  }

  const priceByCategory = new Map(offer.event.prices.map((p) => [p.categoryId, p.priceCents]));
  const totalCents = offer.seats.reduce(
    (sum, s) => sum + (priceByCategory.get(s.seat.categoryId) ?? 0),
    0,
  );
  const seatIds = offer.seats.map((s) => s.seatId);
  const reference = await genReference();

  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(async (tx) => {
      // Atomic claim of the offer.
      const claim = await tx.waitlistOffer.updateMany({
        where: { id: offerId, status: "ACTIVE" },
        data: { status: "ACCEPTED" },
      });
      if (claim.count === 0) {
        throw new HttpError(410, "This offer has expired and the seats were offered to the next customer.");
      }

      const locks = await tx.seatLock.findMany({
        where: { offerId, seatId: { in: seatIds } },
        select: { id: true },
      });
      if (locks.length !== seatIds.length) {
        throw new HttpError(409, "These seats are no longer available.");
      }

      const booking = await tx.booking.create({
        data: { reference, eventId: offer.eventId, userId: user.id, status: "CONFIRMED", totalCents },
      });
      await tx.bookingSeat.createMany({
        data: offer.seats.map((s) => ({
          bookingId: booking.id,
          seatId: s.seatId,
          priceCents: priceByCategory.get(s.seat.categoryId) ?? 0,
        })),
      });
      await tx.seatLock.deleteMany({ where: { id: { in: locks.map((l) => l.id) } } });
      await tx.seatLock.createMany({
        data: seatIds.map((seatId) => ({
          eventId: offer.eventId,
          seatId,
          type: "BOOKING" as const,
          bookingId: booking.id,
        })),
      });
      await tx.waitlistEntry.update({
        where: { id: offer.entryId },
        data: { status: "BOOKED" },
      });
      await tx.waitlistOffer.update({
        where: { id: offerId },
        data: { acceptedBookingId: booking.id },
      });
      return booking.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "These seats are no longer available.");
    throw e;
  }

  const qr = await qrDataUrl(reference).catch(() => "");
  await sendBookingConfirmationEmail({
    to: user.email,
    name: user.name,
    reference,
    eventTitle: offer.event.title,
    eventStartsAt: offer.event.startsAt,
    venue: offer.event.venue.name,
    city: offer.event.venue.city,
    seats: offer.seats.map((s) => s.seat.number).sort(),
    totalCents,
    qr,
  }).catch((e) => console.error("[offer] confirmation email failed:", e));

  return { bookingId, reference };
}

function holdTtlMs(): number {
  const mins = parseInt(process.env.SEAT_HOLD_TTL_MINUTES ?? "10", 10);
  return (Number.isFinite(mins) && mins > 0 ? mins : 10) * 60_000;
}
