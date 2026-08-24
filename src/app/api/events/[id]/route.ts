import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      include: {
        venue: { select: { name: true, city: true, address: true } },
        organizer: { select: { name: true } },
        prices: { include: { category: { select: { name: true, color: true } } } },
      },
    });
    if (!event) throw new HttpError(404, "Event not found.");
    return NextResponse.json({ event });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const event = await prisma.event.findUnique({ where: { id: params.id } });
    if (!event) throw new HttpError(404, "Event not found.");
    if (user.role !== "ADMIN" && event.organizerId !== user.id) {
      throw new HttpError(403, "You can only manage your own events.");
    }
    if (event.startsAt.getTime() < Date.now()) throw new HttpError(400, "This event has already taken place.");

    const bookings = await prisma.booking.count({ where: { eventId: event.id, status: "CONFIRMED" } });
    if (bookings > 0) {
      throw new HttpError(409, "This event has confirmed bookings and can no longer be deleted.");
    }
    await prisma.event.delete({ where: { id: event.id } });
    return NextResponse.json({ deleted: true });
  });
}
