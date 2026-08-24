import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export async function GET() {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);

    const events = await prisma.event.findMany({
      where: user.role === "ADMIN" ? {} : { organizerId: user.id },
      include: {
        venue: { select: { name: true, city: true } },
        prices: { select: { priceCents: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    let totalRevenueCents = 0;
    let totalSeatsSold = 0;
    let totalBookings = 0;

    const perEvent = await Promise.all(
      events.map(async (e) => {
        const [agg, seatsSold, bookingsCount, capacity] = await Promise.all([
          prisma.booking.aggregate({
            where: { eventId: e.id, status: "CONFIRMED" },
            _sum: { totalCents: true },
          }),
          prisma.bookingSeat.count({
            where: { booking: { eventId: e.id, status: "CONFIRMED" } },
          }),
          prisma.booking.count({ where: { eventId: e.id, status: "CONFIRMED" } }),
          prisma.seat.count({ where: { venueId: e.venueId } }),
        ]);
        const revenue = agg._sum.totalCents ?? 0;
        if (e.startsAt.getTime() >= Date.now()) {
          totalRevenueCents += revenue;
          totalSeatsSold += seatsSold;
          totalBookings += bookingsCount;
        }
        return {
          id: e.id,
          title: e.title,
          type: e.type,
          startsAt: e.startsAt.toISOString(),
          venue: e.venue,
          capacity,
          seatsSold,
          revenueCents: revenue,
          minPriceCents: e.prices.length ? Math.min(...e.prices.map((p) => p.priceCents)) : 0,
        };
      }),
    );

    return NextResponse.json({
      stats: {
        events: events.filter((e) => e.startsAt.getTime() >= Date.now()).length,
        totalBookings,
        totalRevenueCents,
        totalSeatsSold,
      },
      events: perEvent,
    });
  });
}

export const dynamic = "force-dynamic";

