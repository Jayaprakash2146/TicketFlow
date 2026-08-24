import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";

export async function GET() {
  return handle(async () => {
    await requireUser(["ADMIN"]);
    const emails = await prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, to: true, subject: true, sent: true, error: true, createdAt: true },
    });
    return NextResponse.json({ emails: emails.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) });
  });
}

export const dynamic = "force-dynamic";

