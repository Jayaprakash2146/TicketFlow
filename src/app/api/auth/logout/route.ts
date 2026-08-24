import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/constants";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export const dynamic = "force-dynamic";

