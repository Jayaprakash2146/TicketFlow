import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { confirmBooking } from "@/lib/holds";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            type: true,
            startsAt: true,
            venue: { select: { name: true, city: true } },
          },
        },
        seats: { include: { seat: { select: { number: true } } } },
      },
      orderBy: { bookedAt: "desc" },
    });
    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        totalCents: b.totalCents,
        bookedAt: b.bookedAt.toISOString(),
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
        event: { ...b.event, startsAt: b.event.startsAt.toISOString() },
        seats: b.seats.map((s) => s.seat.number).sort(),
      })),
    });
  });
}

const schema = z.object({ holdId: z.string().min(1) });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "holdId is required.");
    const result = await confirmBooking(user, body.data.holdId);
    return NextResponse.json(result, { status: 201 });
  });
}

export const dynamic = "force-dynamic";

