import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { qrDataUrl } from "@/lib/qr";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            type: true,
            startsAt: true,
            durationMin: true,
            venue: { select: { name: true, city: true, address: true } },
            organizer: { select: { name: true } },
          },
        },
        seats: { include: { seat: { select: { number: true, categoryId: true } } } },
      },
    });
    if (!booking || (booking.userId !== user.id && user.role !== "ADMIN")) {
      throw new HttpError(404, "Booking not found.");
    }

    const categories = await prisma.seatCategory.findMany({
      where: { id: { in: booking.seats.map((s) => s.seat.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    const qr = booking.status === "CONFIRMED" ? await qrDataUrl(booking.reference) : "";

    return NextResponse.json({
      booking: {
        id: booking.id,
        reference: booking.reference,
        status: booking.status,
        totalCents: booking.totalCents,
        bookedAt: booking.bookedAt.toISOString(),
        cancelledAt: booking.cancelledAt?.toISOString() ?? null,
        event: { ...booking.event, startsAt: booking.event.startsAt.toISOString() },
        seats: booking.seats
          .map((s) => ({ number: s.seat.number, category: categoryName.get(s.seat.categoryId) ?? "" }))
          .sort((a, b) => a.number.localeCompare(b.number)),
        qr,
      },
    });
  });
}

export const dynamic = "force-dynamic";

