import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";

// Only customers and organizers can self-register. The platform has exactly
// one admin account, provisioned by the seed script from ADMIN_EMAIL/ADMIN_PASSWORD.
const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["CUSTOMER", "ORGANIZER"]).default("CUSTOMER"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      throw new HttpError(400, "Please provide a valid name, email and password (min 8 characters).");
    }
    const { name, email, password, role } = body.data;
    const normalized = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new HttpError(409, "An account with this email already exists.");

    const user = await prisma.user.create({
      data: { name, email: normalized, passwordHash: await bcrypt.hash(password, 10), role },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  });
}
