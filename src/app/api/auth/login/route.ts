import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { signSessionToken } from "@/lib/jwt";
import { COOKIE_NAME } from "@/lib/constants";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Invalid email or password.");

    const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      throw new HttpError(401, "Incorrect email or password.");
    }

    const session = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = await signSessionToken(session);

    const res = NextResponse.json({ user: session });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  });
}

export const dynamic = "force-dynamic";

