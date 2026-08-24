import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { getSeatMap } from "@/lib/queries";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const viewer = await getSession();
    const data = await getSeatMap(params.id, viewer);
    return NextResponse.json(data);
  });
}

export const dynamic = "force-dynamic";

