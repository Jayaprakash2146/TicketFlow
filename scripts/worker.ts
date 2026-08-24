/**
 * Optional background TTL sweeper for local/self-hosted deployments.
 *
 *   npm run worker
 *
 * On Vercel this is unnecessary: every request lazily enforces TTLs and
 * /api/cron/expire is wired to Vercel Cron. Run this only when hosting
 * the app as a long-lived node process (docker, VPS, railway web service).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function sweep() {
  const now = new Date();

  // 1. Expired holds -> release locks, mark holds EXPIRED.
  const holdLocks = await prisma.seatLock.findMany({
    where: { type: "HOLD", expiresAt: { lt: now } },
    select: { id: true, holdId: true },
  });
  if (holdLocks.length > 0) {
    await prisma.$transaction([
      prisma.seatLock.deleteMany({ where: { id: { in: holdLocks.map((l) => l.id) } } }),
      prisma.hold.updateMany({
        where: { id: { in: Array.from(new Set(holdLocks.map((l) => l.holdId!).filter(Boolean))) }, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      }),
    ]);
    console.log(`[worker] released ${holdLocks.length} expired held seat(s)`);
  }

  // 2. Expired waitlist offers -> release locks, then cascade to next waiter.
  const offerLocks = await prisma.seatLock.findMany({
    where: { type: "OFFER", expiresAt: { lt: now } },
    select: { id: true, offerId: true, eventId: true, seatId: true },
  });
  if (offerLocks.length > 0) {
    const offerIds = Array.from(new Set(offerLocks.map((l) => l.offerId!).filter(Boolean)));
    const offers = await prisma.waitlistOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, entryId: true } });
    await prisma.$transaction([
      prisma.seatLock.deleteMany({ where: { id: { in: offerLocks.map((l) => l.id) } } }),
      prisma.waitlistOffer.updateMany({ where: { id: { in: offerIds }, status: "ACTIVE" }, data: { status: "EXPIRED" } }),
      prisma.waitlistEntry.updateMany({
        where: { id: { in: offers.map((o) => o.entryId) }, status: "OFFERED" },
        data: { status: "EXPIRED" },
      }),
    ]);
    console.log(`[worker] expired ${offerIds.length} waitlist offer(s)`);

    // Re-offer freed seats to the next waiters via the app engine.
    const { processFreedSeats } = await import("../src/lib/waitlist");
    const byEvent = new Map<string, string[]>();
    for (const l of offerLocks) {
      const arr = byEvent.get(l.eventId) ?? [];
      arr.push(l.seatId);
      byEvent.set(l.eventId, arr);
    }
    for (const [eventId, seatIds] of byEvent) await processFreedSeats(eventId, seatIds);
  }
}

async function main() {
  console.log("[worker] TTL sweeper started (every 20s)");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await sweep();
    } catch (e) {
      console.error("[worker] sweep failed:", e);
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
