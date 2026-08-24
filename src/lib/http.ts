import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;
  data?: Record<string, unknown>;

  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type PrismaKnownError = { code: string; meta?: unknown };

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as PrismaKnownError).code === "P2002";
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status });
  }
  console.error("[api] unhandled error:", e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function handle(fn: () => Promise<NextResponse | Response>): Promise<NextResponse> {
  try {
    return (await fn()) as NextResponse;
  } catch (e) {
    return errorResponse(e);
  }
}
