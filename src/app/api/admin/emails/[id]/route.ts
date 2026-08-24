import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    await requireUser(["ADMIN"]);
    const email = await prisma.emailLog.findUnique({ where: { id: params.id }, select: { html: true } });
    if (!email) throw new HttpError(404, "Email not found.");
    return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  });
}

export const dynamic = "force-dynamic";

