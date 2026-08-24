import { NextResponse } from "next/server";
import { releaseExpired } from "@/lib/expire";

/**
 * TTL sweeper. Hits every SeatLock row whose expiresAt has passed:
 * releases abandoned holds and re-offers seats freed by expired
 * waitlist offers. Protected by CRON_SECRET.
 *
 * Wired to Vercel Cron (vercel.json) and safe to call every minute from
 * any external scheduler (cron-job.org, GitHub Actions, ...). Correctness
 * never depends on it: every read/write path also calls releaseExpired()
 * lazily, this endpoint just tightens the release window.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  await releaseExpired();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ms: Date.now() - t0 });
}

export const POST = GET;
