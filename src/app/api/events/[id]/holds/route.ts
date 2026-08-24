import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { createHold, releaseHold } from "@/lib/holds";

type Params = { params: { id: string } };

const schema = z.object({ seatIds: z.array(z.string()).min(1) });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser(["CUSTOMER", "ORGANIZER", "ADMIN"]);
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Select at least one seat.");

    const { hold, seatLabels } = await createHold(user, params.id, body.data.seatIds);
    return NextResponse.json(
      { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), seatLabels },
      { status: 201 },
    );
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser(["CUSTOMER", "ORGANIZER", "ADMIN"]);
    const holdId = new URL(req.url).searchParams.get("holdId");
    if (!holdId) throw new HttpError(400, "holdId is required.");
    const result = await releaseHold(user, holdId);
    return NextResponse.json(result);
  });
}

export const dynamic = "force-dynamic";

