import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { cancelBooking } from "@/lib/holds";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const result = await cancelBooking(user, params.id);
    return NextResponse.json(result);
  });
}

export const dynamic = "force-dynamic";

