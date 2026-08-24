import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export async function GET() {
  return handle(async () => {
    await requireUser(["ADMIN"]);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { bookings: true } } },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        bookings: u._count.bookings,
      })),
    });
  });
}

export const dynamic = "force-dynamic";

