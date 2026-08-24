import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listEvents } from "@/lib/queries";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const events = await listEvents({
      q: url.searchParams.get("q") ?? undefined,
      type: type === "MOVIE" || type === "CONCERT" ? type : undefined,
      city: url.searchParams.get("city") ?? undefined,
    });
    return NextResponse.json({ events });
  });
}

const createSchema = z.object({
  title: z.string().min(3).max(120),
  type: z.enum(["MOVIE", "CONCERT"]),
  description: z.string().min(10).max(4000),
  posterUrl: z.string().url().optional().or(z.literal("")),
  venueId: z.string().min(1),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(30).max(600),
  prices: z.array(z.object({ categoryId: z.string(), priceCents: z.number().int().min(0) })).min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const body = createSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Please fill in all event details correctly.");

    const { title, type, description, posterUrl, venueId, startsAt, durationMin, prices } = body.data;

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { categories: true },
    });
    if (!venue) throw new HttpError(404, "Venue not found.");

    const validPrices = prices.filter((p) => venue.categories.some((c) => c.id === p.categoryId));
    if (validPrices.length === 0) throw new HttpError(400, "Set a price for at least one seat category of this venue.");
    if (validPrices.length !== prices.length) throw new HttpError(400, "Some prices refer to categories that do not belong to this venue.");

    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
      throw new HttpError(400, "The event must be scheduled in the future.");
    }

    const clash = await prisma.event.findFirst({
      where: { venueId, status: "PUBLISHED", startsAt: { gte: new Date(Date.now() - durationMin * 60_000), lte: new Date(start.getTime() + durationMin * 60_000) } },
      select: { id: true },
    });
    if (clash) throw new HttpError(409, "This venue already has an event overlapping that time slot.");

    const event = await prisma.event.create({
      data: {
        title,
        type,
        description,
        posterUrl: posterUrl || null,
        venueId,
        organizerId: user.id,
        startsAt: start,
        durationMin,
        prices: { create: validPrices },
      },
    });
    return NextResponse.json({ event }, { status: 201 });
  });
}
