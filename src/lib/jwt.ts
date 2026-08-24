import { SignJWT, jwtVerify } from "jose";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "ORGANIZER" | "ADMIN";
};

const alg = "HS256";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET ?? "dev-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function signSessionToken(user: SessionUser, maxAgeSeconds = 60 * 60 * 24 * 7): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: (payload.name as string) ?? "",
      email: (payload.email as string) ?? "",
      role: (payload.role as SessionUser["role"]) ?? "CUSTOMER",
    };
  } catch {
    return null;
  }
}
