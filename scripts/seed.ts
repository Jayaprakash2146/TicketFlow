/**
 * TicketFlow seed script
 * ----------------------
 * Creates:
 *   - the single admin account (ADMIN_EMAIL / ADMIN_PASSWORD from .env)
 *   - one organizer account to own the sample listings
 *   - two venues with painted layouts (front rows = Regular, back = VIP)
 *   - exactly two sample events (one movie, one concert)
 *
 * No demo customers, bookings, waitlists or emails are created - booking
 * history and the mailbox fill up only with real activity.
 *
 * Usage:  npm run db:seed     (after DATABASE_URL is set and db is pushed)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const days = (n: number, h = 19, m = 30) => {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  d.setHours(h, m, 0, 0);
  return d;
};

type Block = { from: number; to: number; cat: string };

async function makeVenue(opts: {
  name: string;
  address: string;
  city: string;
  rows: number;
  cols: number;
  aisles?: number[];
  cats: { name: string; color: string }[];
  blocks: Block[];
}) {
  const venue = await prisma.venue.create({
    data: {
      name: opts.name,
      address: opts.address,
      city: opts.city,
      seatRows: opts.rows,
      seatCols: opts.cols,
      categories: { create: opts.cats },
    },
    include: { categories: { orderBy: { createdAt: "asc" } } },
  });
  const catId = new Map(venue.categories.map((c) => [c.name, c.id]));
  const bulk: { venueId: string; rowLabel: string; rowIndex: number; colIndex: number; number: string; categoryId: string }[] = [];
  for (let r = 0; r < opts.rows; r++) {
    const block = opts.blocks.find((b) => r >= b.from && r <= b.to);
    if (!block) continue;
    const rowLabel = String.fromCharCode(65 + r);
    for (let c = 0; c < opts.cols; c++) {
      if (opts.aisles?.includes(c)) continue;
      bulk.push({
        venueId: venue.id,
        rowLabel,
        rowIndex: r,
        colIndex: c,
        number: `${rowLabel}${c + 1}`,
        categoryId: catId.get(block.cat)!,
      });
    }
  }
  await prisma.seat.createMany({ data: bulk });
  return { venue, categories: venue.categories };
}

async function main() {
  console.log("Seeding TicketFlow...");

  await prisma.$transaction([
    prisma.seatLock.deleteMany(),
    prisma.holdSeat.deleteMany(),
    prisma.hold.deleteMany(),
    prisma.offerSeat.deleteMany(),
    prisma.waitlistOffer.deleteMany(),
    prisma.waitlistEntry.deleteMany(),
    prisma.bookingSeat.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.eventPrice.deleteMany(),
    prisma.event.deleteMany(),
    prisma.seat.deleteMany(),
    prisma.seatCategory.deleteMany(),
    prisma.venue.deleteMany(),
    prisma.emailLog.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ---------------- the single admin ----------------
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const admin = await prisma.user.create({
    data: {
      name: "Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? "Admin@123", 10),
      role: "ADMIN",
    },
  });

  // ---------------- organizer for the sample listings ----------------
  const organizer = await prisma.user.create({
    data: {
      name: "Sample Organizer",
      email: "organiser@ticketflow.dev",
      passwordHash: await bcrypt.hash("Password@123", 10),
      role: "ORGANIZER",
    },
  });

  // ---------------- venues (front = Regular, back = VIP) ----------------
  const cinema = await makeVenue({
    name: "Lumo Grand Cineplex (IMAX)",
    address: "42 MG Road",
    city: "Bengaluru",
    rows: 10,
    cols: 16,
    aisles: [7],
    cats: [
      { name: "Regular", color: "#60a5fa" },
      { name: "Premium", color: "#34d399" },
      { name: "Recliner", color: "#818cf8" },
      { name: "VIP Box", color: "#f472b6" },
    ],
    blocks: [
      { from: 0, to: 2, cat: "Regular" },
      { from: 3, to: 5, cat: "Premium" },
      { from: 6, to: 7, cat: "Recliner" },
      { from: 8, to: 9, cat: "VIP Box" },
    ],
  });

  const arena = await makeVenue({
    name: "Skyline Arena",
    address: "Bandra Kurla Complex",
    city: "Mumbai",
    rows: 12,
    cols: 18,
    aisles: [8],
    cats: [
      { name: "Regular", color: "#60a5fa" },
      { name: "Silver", color: "#2dd4bf" },
      { name: "Gold", color: "#f59e0b" },
      { name: "Platinum", color: "#c084fc" },
      { name: "VIP", color: "#f472b6" },
    ],
    blocks: [
      { from: 0, to: 2, cat: "Regular" },
      { from: 3, to: 5, cat: "Silver" },
      { from: 6, to: 8, cat: "Gold" },
      { from: 9, to: 10, cat: "Platinum" },
      { from: 11, to: 11, cat: "VIP" },
    ],
  });

  // ---------------- two sample events ----------------
  await prisma.event.create({
    data: {
      title: "Interstellar - IMAX Re-release",
      type: "MOVIE",
      description:
        "Christopher Nolan's space odyssey returns to the biggest screen in the city. Join the Endurance crew one more time in fully reserved comfort - Regular up front, VIP boxes at the back.",
      venueId: cinema.venue.id,
      organizerId: organizer.id,
      startsAt: days(2, 19, 30),
      durationMin: 169,
      prices: {
        create: [
          { categoryId: cinema.categories.find((c) => c.name === "Regular")!.id, priceCents: 32000 },
          { categoryId: cinema.categories.find((c) => c.name === "Premium")!.id, priceCents: 55000 },
          { categoryId: cinema.categories.find((c) => c.name === "Recliner")!.id, priceCents: 90000 },
          { categoryId: cinema.categories.find((c) => c.name === "VIP Box")!.id, priceCents: 120000 },
        ],
      },
    },
  });

  await prisma.event.create({
    data: {
      title: "Arijit Singh - Skyline Live",
      type: "CONCERT",
      description:
        "India's most streamed voice performs an evening of ballads and anthems at Skyline Arena. Five seating tiers from up-front Regular to the rear VIP deck.",
      venueId: arena.venue.id,
      organizerId: organizer.id,
      startsAt: days(5, 19, 0),
      durationMin: 180,
      prices: {
        create: [
          { categoryId: arena.categories.find((c) => c.name === "Regular")!.id, priceCents: 90000 },
          { categoryId: arena.categories.find((c) => c.name === "Silver")!.id, priceCents: 130000 },
          { categoryId: arena.categories.find((c) => c.name === "Gold")!.id, priceCents: 180000 },
          { categoryId: arena.categories.find((c) => c.name === "Platinum")!.id, priceCents: 250000 },
          { categoryId: arena.categories.find((c) => c.name === "VIP")!.id, priceCents: 400000 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log("  Admin:      " + admin.email + "  (password set from ADMIN_PASSWORD in .env)");
  console.log("  Organizer:  organiser@ticketflow.dev / Password@123  (owns the two sample events)");
  console.log("  Samples:    2 events (1 movie + 1 concert), no bookings / waitlists / emails");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
