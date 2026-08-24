import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { acceptOffer } from "@/lib/holds";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const result = await acceptOffer(user, params.id);
    return NextResponse.json(result, { status: 201 });
  });
}

export const dynamic = "force-dynamic";

