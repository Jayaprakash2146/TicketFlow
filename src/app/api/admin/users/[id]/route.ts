import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";

type Params = { params: { id: string } };

const schema = z.object({ role: z.enum(["CUSTOMER", "ORGANIZER", "ADMIN"]) });

/** Admin can switch users between customer/organizer. The platform keeps
 *  exactly one admin account, so assigning the ADMIN role is refused. */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser(["ADMIN"]);
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Invalid role.");

    if (body.data.role === "ADMIN") {
      throw new HttpError(400, "This platform has a single admin account. The admin role cannot be assigned to anyone else.");
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) throw new HttpError(404, "User not found.");
    if (target.id === admin.id) {
      throw new HttpError(400, "You cannot change your own role.");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.data.role },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ user: updated });
  });
}

export const dynamic = "force-dynamic";
