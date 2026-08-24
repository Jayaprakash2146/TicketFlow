import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    await requireUser(["ORGANIZER", "ADMIN"]);
    const venue = await prisma.venue.findUnique({
      where: { id: params.id },
      include: {
        categories: { orderBy: { createdAt: "asc" } },
        seats: { orderBy: [{ rowIndex: "asc" }, { colIndex: "asc" }], select: { rowIndex: true, colIndex: true, categoryId: true } },
        _count: { select: { events: true } },
      },
    });
    if (!venue) throw new HttpError(404, "Venue not found.");
    return NextResponse.json({ venue: { ...venue, eventCount: venue._count.events } });
  });
}

const updateSchema = z.object({
  name: z.string().min(3).max(80),
  address: z.string().min(3).max(160),
  city: z.string().min(2).max(60),
  categories: z.array(z.object({ name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(8),
  grid: z.array(z.array(z.string().nullable())).min(1),
});

/** Full replace of layout. Allowed for admins and the organizer who created the venue,
 *  and only while the venue hosts no events. */
export async function PUT(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const venue = await prisma.venue.findUnique({
      where: { id: params.id },
      include: { _count: { select: { events: true } } },
    });
    if (!venue) throw new HttpError(404, "Venue not found.");
    if (user.role !== "ADMIN" && venue.createdById !== user.id) {
      throw new HttpError(403, "Only the admin or the venue's creator can edit this venue.");
    }
    if (venue._count.events > 0) {
      throw new HttpError(409, "This venue already hosts events, so its layout is locked.");
    }

    const body = updateSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Please fill in the venue details and paint at least one seat.");

    const { name, address, city, categories, grid } = body.data;
    const rows = grid.length;
    if (rows > 26) throw new HttpError(400, "Venues support at most 26 rows.");
    const cols = Math.max(...grid.map((r) => r.length));
    if (cols > 40) throw new HttpError(400, "Venues support at most 40 seats per row.");

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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.seat.deleteMany({ where: { venueId: venue.id } });
      await tx.seatCategory.deleteMany({ where: { venueId: venue.id } });
      const v = await tx.venue.update({
        where: { id: venue.id },
        data: {
          name,
          address,
          city,
          seatRows: rows,
          seatCols: cols,
          categories: { create: categories },
        },
        include: { categories: { orderBy: { createdAt: "asc" } } },
      });
      await tx.seat.createMany({
        data: cells.map((cell) => ({
          venueId: v.id,
          rowLabel: cell.rowLabel,
          rowIndex: cell.rowIndex,
          colIndex: cell.colIndex,
          number: `${cell.rowLabel}${cell.colIndex + 1}`,
          categoryId: v.categories[cell.categoryIdx].id,
        })),
      });
      return v;
    });

    return NextResponse.json({ venue: { id: updated.id, name: updated.name } });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["ORGANIZER", "ADMIN"]);
    const venue = await prisma.venue.findUnique({
      where: { id: params.id },
      include: { _count: { select: { events: true } } },
    });
    if (!venue) throw new HttpError(404, "Venue not found.");
    if (user.role !== "ADMIN" && venue.createdById !== user.id) {
      throw new HttpError(403, "Only the admin or the venue's creator can delete this venue.");
    }
    if (venue._count.events > 0) throw new HttpError(409, "This venue hosts events and cannot be deleted.");
    await prisma.venue.delete({ where: { id: venue.id } });
    return NextResponse.json({ deleted: true });
  });
}

function rowLabel(rowIndex: number): string {
  return String.fromCharCode(65 + rowIndex);
}

export const dynamic = "force-dynamic";

