import { prisma } from "@/lib/db";
import { processFreedSeats } from "@/lib/waitlist";

/**
 * Lazily enforces all TTLs. Called before every read/write that touches
 * seat availability (seat map fetch, hold, booking, waitlist join, offer
 * accept) and by the cron endpoint / worker. This makes expiry correct
 * even on serverless platforms with no background scheduler.
 *
 *  1. HOLD locks past their expiresAt  -> hold EXPIRED, seats released.
 *  2. OFFER locks past their expiresAt -> offer EXPIRED, waitlist entry
 *     EXPIRED (they missed their window), and the freed seats are
 *     immediately re-offered to the next customer in line.
 */
export async function releaseExpired(): Promise<void> {
  const now = new Date();
  const expiredLocks = await prisma.seatLock.findMany({
    where: { expiresAt: { lt: now }, type: { in: ["HOLD", "OFFER"] } },
    select: { id: true, eventId: true, seatId: true, type: true, holdId: true, offerId: true },
  });
  if (expiredLocks.length === 0) return;

  const lockIds = expiredLocks.map((l) => l.id);
  const holdIds = unique(expiredLocks.filter((l) => l.holdId).map((l) => l.holdId!));
  const offerIds = unique(expiredLocks.filter((l) => l.offerId).map((l) => l.offerId!));

  // Seats freed by expired waitlist offers must cascade to the next waiter.
  const freedOffers = expiredLocks.filter((l) => l.type === "OFFER");
  const freedByEvent = new Map<string, string[]>();
  for (const l of freedOffers) {
    const arr = freedByEvent.get(l.eventId) ?? [];
    arr.push(l.seatId);
    freedByEvent.set(l.eventId, arr);
  }

  const offerEntries = offerIds.length
    ? await prisma.waitlistOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, entryId: true } })
    : [];
  const entryIds = unique(offerEntries.map((o) => o.entryId));

  await prisma.$transaction(async (tx) => {
    await tx.hold.updateMany({ where: { id: { in: holdIds }, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    await tx.waitlistOffer.updateMany({ where: { id: { in: offerIds }, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    await tx.waitlistEntry.updateMany({ where: { id: { in: entryIds }, status: "OFFERED" }, data: { status: "EXPIRED" } });
    await tx.seatLock.deleteMany({ where: { id: { in: lockIds } } });
  });

  for (const [eventId, seatIds] of freedByEvent) {
    await processFreedSeats(eventId, seatIds).catch((e) =>
      console.error("[expire] re-offering freed seats failed:", e),
    );
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
