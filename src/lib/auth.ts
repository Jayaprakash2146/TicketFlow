import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/constants";
import { verifySessionToken, type SessionUser } from "@/lib/jwt";
import { HttpError } from "@/lib/http";

export type { SessionUser };

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Throws 401/403 unless a logged-in user (with one of `roles`) exists. */
export async function requireUser(roles?: SessionUser["role"][]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "You must be signed in.");
  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    throw new HttpError(403, "You do not have permission to do that.");
  }
  return session;
}
