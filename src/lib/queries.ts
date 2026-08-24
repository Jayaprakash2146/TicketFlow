import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { releaseExpired } from "@/lib/expire";
import { waitlistPosition } from "@/lib/waitlist";
import { HOLD_TTL_MINUTES } from "@/lib/constants";
import type { SessionUser } from "@/lib/auth";

export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "OFFERED";

/**
 * Single source of truth for the visual seat map. Runs TTL expiry first
 * so statuses are always fresh, then returns per-seat status, per-category
 * availability, the viewer's active hold (if any) and waitlist state.
 */
export async function getSeatMap(eventId: string, viewer: SessionUser | null) {
  await releaseExpired();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venue: { include: { categories: { orderBy: { createdAt: "asc" } } } },
      organizer: { select: { name: true } },
      prices: true,
    },
  });
  if (!event) throw new HttpError(404, "Event not found.");

  const [seats, locks] = await Promise.all([
    prisma.seat.findMany({
      where: { venueId: event.venueId },
      orderBy: [{ rowIndex: "asc" }, { colIndex: "asc" }],
    }),
    prisma.seatLock.findMany({ where: { eventId }, select: { seatId: true, type: true } }),
  ]);
  const statusBySeat = new Map(locks.map((l) => [l.seatId, l.type]));

  const priceByCategory = new Map(event.prices.map((p) => [p.categoryId, p.priceCents]));

  const categories = event.venue.categories.map((c) => {
    const catSeats = seats.filter((s) => s.categoryId === c.id);
    let available = 0;
    let booked = 0;
    for (const s of catSeats) {
      const st = statusBySeat.get(s.id);
      if (!st) available++;
      else if (st === "BOOKING") booked++;
    }
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      priceCents: priceByCategory.get(c.id) ?? 0,
      total: catSeats.length,
      available,
      booked,
      soldOut: catSeats.length > 0 && available === 0 && booked === catSeats.length,
    };
  });

  // Group into labelled rows for the grid renderer.
  const rowMap = new Map<string, { label: string; seats: { id: string; number: string; colIndex: number; categoryId: string; status: SeatStatus }[] }>();
  for (const s of seats) {
    const lock = statusBySeat.get(s.id);
    const status: SeatStatus = !lock ? "AVAILABLE" : lock === "BOOKING" ? "BOOKED" : lock === "HOLD" ? "HELD" : "OFFERED";
    const row = rowMap.get(s.rowLabel) ?? { label: s.rowLabel, seats: [] };
    row.seats.push({ id: s.id, number: s.number, colIndex: s.colIndex, categoryId: s.categoryId, status });
    rowMap.set(s.rowLabel, row);
  }
  const rows = Array.from(rowMap.values());

  // Viewer's live hold on this event (enables "resume checkout").
  const mine = viewer
    ? await prisma.hold.findFirst({
        where: { eventId, userId: viewer.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
        include: { seats: { select: { seatId: true } } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // Viewer's waitlist entries for this event.
  const myEntries = viewer
    ? await prisma.waitlistEntry.findMany({
        where: { eventId, userId: viewer.id, status: { in: ["WAITING", "OFFERED"] } },
        include: { category: { select: { id: true, name: true } } },
      })
    : [];

  const myWaitlist = await Promise.all(
    myEntries.map(async (e) => {
      const offer =
        e.status === "OFFERED"
          ? await prisma.waitlistOffer.findFirst({
              where: { entryId: e.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
              select: { id: true, expiresAt: true },
            })
          : null;
      return {
        id: e.id,
        categoryId: e.categoryId,
        categoryName: e.category.name,
        status: e.status as "WAITING" | "OFFERED",
        quantity: e.quantity,
        position: e.status === "WAITING" ? await waitlistPosition(eventId, e.categoryId, e.joinedAt) : null,
        offer: offer ? { id: offer.id, expiresAt: offer.expiresAt.toISOString() } : null,
      };
    }),
  );

  const availableSeats = seats.filter((s) => !statusBySeat.has(s.id)).length;

  return {
    event: {
      id: event.id,
      title: event.title,
      type: event.type,
      description: event.description,
      posterUrl: event.posterUrl,
      startsAt: event.startsAt.toISOString(),
      durationMin: event.durationMin,
      organizer: event.organizer.name,
      venue: {
        id: event.venue.id,
        name: event.venue.name,
        address: event.venue.address,
        city: event.venue.city,
        seatRows: event.venue.seatRows,
        seatCols: event.venue.seatCols,
      },
    },
    categories,
    rows: rows.map((r) => ({ label: r.label, seats: r.seats })),
    stats: { totalSeats: seats.length, availableSeats },
    soldOut: seats.length > 0 && availableSeats === 0,
    mine: mine
      ? {
          holdId: mine.id,
          expiresAt: mine.expiresAt.toISOString(),
          seatIds: mine.seats.map((s) => s.seatId),
        }
      : null,
    myWaitlist,
    holdTtlMinutes: HOLD_TTL_MINUTES,
    viewer: viewer ? { id: viewer.id, name: viewer.name } : null,
  };
}

export type EventListFilters = {
  q?: string;
  type?: "MOVIE" | "CONCERT";
  city?: string;
};

export async function listEvents(filters: EventListFilters) {
  const now = new Date();

  // "movie"/"concert" queries map to a type filter; anything else is a
  // text search across title, venue name and city.
  let type = filters.type;
  let text = filters.q?.trim();
  if (text) {
    const l = text.toLowerCase();
    if (l === "movie" || l === "movies") {
      type = "MOVIE";
      text = undefined;
    } else if (l === "concert" || l === "concerts" || l === "gig") {
      type = "CONCERT";
      text = undefined;
    }
  }

  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gte: now },
      ...(type ? { type } : {}),
      ...(filters.city ? { venue: { city: filters.city } } : {}),
      ...(text
        ? {
            OR: [
              { title: { contains: text, mode: "insensitive" } },
              { venue: { name: { contains: text, mode: "insensitive" } } },
              { venue: { city: { contains: text, mode: "insensitive" } } },
              { description: { contains: text, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { venue: { select: { name: true, city: true } }, prices: { select: { priceCents: true } } },
    orderBy: { startsAt: "asc" },
  });

  const capacityCache = new Map<string, number>();
  const result = await Promise.all(
    events.map(async (e) => {
      let capacity = capacityCache.get(e.venueId);
      if (capacity === undefined) {
        capacity = await prisma.seat.count({ where: { venueId: e.venueId } });
        capacityCache.set(e.venueId, capacity);
      }
      const booked = await prisma.seatLock.count({ where: { eventId: e.id, type: "BOOKING" } });
      const minPrice = e.prices.length ? Math.min(...e.prices.map((p) => p.priceCents)) : 0;
      const available = capacity - booked;
      return {
        id: e.id,
        title: e.title,
        type: e.type,
        posterUrl: e.posterUrl,
        startsAt: e.startsAt.toISOString(),
        venue: e.venue,
        minPriceCents: minPrice,
        capacity,
        booked,
        available,
        soldOut: capacity > 0 && available === 0,
        fewLeft: available > 0 && available <= Math.max(5, Math.ceil(capacity * 0.1)),
      };
    }),
  );
  return result;
}

export async function listCities(): Promise<string[]> {
  const venues = await prisma.venue.findMany({ select: { city: true }, distinct: ["city"] });
  return venues.map((v) => v.city).sort();
}
