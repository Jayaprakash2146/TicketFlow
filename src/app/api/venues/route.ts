import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export async function GET() {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const venues = await prisma.venue.findMany({
      include: { categories: true, _count: { select: { seats: true, events: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        city: v.city,
        seatRows: v.seatRows,
        seatCols: v.seatCols,
        categories: v.categories,
        seatCount: v._count.seats,
        eventCount: v._count.events,
        mine: v.createdById === user.id,
      })),
    });
  });
}

const createSchema = z.object({
  name: z.string().min(3).max(80),
  address: z.string().min(3).max(160),
  city: z.string().min(2).max(60),
  categories: z.array(z.object({ name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(8),
  /** grid[row][col] = category index into `categories` (as string) or null for no seat. */
  grid: z.array(z.array(z.string().nullable())).min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const body = createSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Please fill in the venue details and paint at least one seat.");

    const { name, address, city, categories, grid } = body.data;
    const rows = grid.length;
    if (rows > 26) throw new HttpError(400, "Venues support at most 26 rows (A-Z).");
    const cols = Math.max(...grid.map((r) => r.length));
    if (cols > 40) throw new HttpError(400, "Venues support at most 40 seats per row.");

    // Flatten painted cells.
    const cells: { rowLabel: string; rowIndex: number; colIndex: number; categoryIdx: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell === null || cell === "") continue;
        const idx = parseInt(cell, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= categories.length) {
          throw new HttpError(400, "Seat grid references an unknown category.");
        }
        cells.push({ rowLabel: rowLabel(r), rowIndex: r, colIndex: c, categoryIdx: idx });
      }
    }
    if (cells.length === 0) throw new HttpError(400, "Paint at least one seat on the layout grid.");
    if (cells.length > 1000) throw new HttpError(400, "Venues are limited to 1000 seats.");

    const venue = await prisma.venue.create({
      data: {
        name,
        address,
        city,
        seatRows: rows,
        seatCols: cols,
        createdById: user.id,
        categories: { create: categories },
      },
      include: { categories: { orderBy: { createdAt: "asc" } } },
    });

    await prisma.seat.createMany({
      data: cells.map((cell) => ({
        venueId: venue.id,
        rowLabel: cell.rowLabel,
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        number: `${cell.rowLabel}${cell.colIndex + 1}`,
        categoryId: venue.categories[cell.categoryIdx].id,
      })),
    });

    return NextResponse.json({ venue: { id: venue.id, name: venue.name } }, { status: 201 });
  });
}

function rowLabel(rowIndex: number): string {
  return String.fromCharCode(65 + rowIndex);
}
