import { NextResponse } from "next/server";

/** Small client-facing runtime config (env vars are not inlined for dynamic routes). */
export async function GET() {
  return NextResponse.json({
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
  });
}

export const dynamic = "force-dynamic";
