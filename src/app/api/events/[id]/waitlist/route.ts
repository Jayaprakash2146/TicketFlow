import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { joinWaitlist } from "@/lib/waitlist";
import { releaseExpired } from "@/lib/expire";

type Params = { params: { id: string } };

const schema = z.object({ categoryId: z.string(), quantity: z.number().int().min(1).max(6) });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["CUSTOMER", "ORGANIZER", "ADMIN"]);
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Invalid waitlist request.");

    await releaseExpired();
    const { position } = await joinWaitlist(user.id, params.id, body.data.categoryId, body.data.quantity);
    return NextResponse.json({ joined: true, position }, { status: 201 });
  });
}

export const dynamic = "force-dynamic";

