import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { releaseExpired } from "@/lib/expire";
import { OFFER_TTL_MINUTES } from "@/lib/constants";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    await releaseExpired();
    const viewer = await getSession();

    const offer = await prisma.waitlistOffer.findUnique({
      where: { id: params.id },
      include: {
        entry: { include: { user: { select: { id: true } } } },
        seats: { include: { seat: { include: { category: true } } } },
        event: {
          select: {
            id: true,
            title: true,
            type: true,
            startsAt: true,
            venue: { select: { name: true, city: true } },
            prices: { select: { categoryId: true, priceCents: true } },
          },
        },
      },
    });
    if (!offer) throw new HttpError(404, "Offer not found.");

    const isOwner = viewer?.id === offer.entry.userId;
    const active = offer.status === "ACTIVE" && offer.expiresAt.getTime() > Date.now();

    const priceByCategory = new Map(offer.event.prices.map((p) => [p.categoryId, p.priceCents]));
    const totalCents = offer.seats.reduce(
      (sum, s) => sum + (priceByCategory.get(s.seat.categoryId) ?? 0),
      0,
    );

    return NextResponse.json({
      offer: {
        id: offer.id,
        status: offer.status,
        expired: !active,
        expiresAt: offer.expiresAt.toISOString(),
        acceptedBookingId: offer.acceptedBookingId,
        mine: isOwner,
        event: { ...offer.event, startsAt: offer.event.startsAt.toISOString() },
        categoryName: offer.seats[0]?.seat.category.name ?? "",
        seats: offer.seats.map((s) => s.seat.number).sort(),
        totalCents,
      },
      offerTtlMinutes: OFFER_TTL_MINUTES,
    });
  });
}

export const dynamic = "force-dynamic";

