import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { listCities } from "@/lib/queries";

export async function GET() {
  return handle(async () => {
    const cities = await listCities();
    return NextResponse.json({ cities });
  });
}

export const dynamic = "force-dynamic";
