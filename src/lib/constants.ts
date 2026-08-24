export const COOKIE_NAME = "tf_session";

export const HOLD_TTL_MINUTES = intEnv("SEAT_HOLD_TTL_MINUTES", 10);
export const OFFER_TTL_MINUTES = intEnv("WAITLIST_OFFER_TTL_MINUTES", 15);
export const MAX_SEATS_PER_BOOKING = 10;
export const MAX_WAITLIST_QUANTITY = 6;

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CATEGORY_PALETTE = [
  "#f59e0b",
  "#818cf8",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#c084fc",
  "#fb923c",
  "#2dd4bf",
];
