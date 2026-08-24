import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      include: { venue: { include: { categories: true } } },
    });
    if (!event) throw new HttpError(404, "Event not found.");
    if (user.role !== "ADMIN" && event.organizerId !== user.id) {
      throw new HttpError(403, "You can only view your own events.");
    }

    const [seats, bookings, prices] = await Promise.all([
      prisma.seat.findMany({ where: { venueId: event.venueId }, select: { id: true, categoryId: true } }),
      prisma.booking.findMany({
        where: { eventId: event.id, status: "CONFIRMED" },
        include: { seats: { include: { seat: { select: { number: true, categoryId: true } } } }, user: { select: { name: true, email: true } } },
        orderBy: { bookedAt: "desc" },
      }),
      prisma.eventPrice.findMany({ where: { eventId: event.id } }),
    ]);

    const priceByCategory = new Map(prices.map((p) => [p.categoryId, p.priceCents]));
    const bookedSeatIds = new Set(bookings.flatMap((b) => b.seats.map((s) => s.seatId)));

    const categories = event.venue.categories.map((c) => {
      const total = seats.filter((s) => s.categoryId === c.id).length;
      const sold = seats.filter((s) => s.categoryId === c.id && bookedSeatIds.has(s.id)).length;
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        total,
        sold,
        available: total - sold,
        revenueCents: sold * (priceByCategory.get(c.id) ?? 0),
      };
    });

    const revenueCents = bookings.reduce((s, b) => s + b.totalCents, 0);

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        type: event.type,
        startsAt: event.startsAt.toISOString(),
        venue: { name: event.venue.name, city: event.venue.city },
      },
      stats: {
        capacity: seats.length,
        seatsSold: bookedSeatIds.size,
        revenueCents,
        bookings: bookings.length,
      },
      categories,
      recentBookings: bookings.slice(0, 12).map((b) => ({
        id: b.id,
        reference: b.reference,
        customer: b.user.name,
        email: b.user.email.replace(/(.{2}).+(@.+)/, "$1***$2"),
        seats: b.seats.map((s) => s.seat.number).sort(),
        totalCents: b.totalCents,
        bookedAt: b.bookedAt.toISOString(),
      })),
    });
  });
}

export const dynamic = "force-dynamic";

