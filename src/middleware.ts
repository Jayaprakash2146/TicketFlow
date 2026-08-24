import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME } from "@/lib/constants";
import { verifySessionToken } from "@/lib/jwt";

const RULES: { prefix: string; roles: ("CUSTOMER" | "ORGANIZER" | "ADMIN")[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/organizer", roles: ["ORGANIZER", "ADMIN"] },
  { prefix: "/bookings", roles: ["CUSTOMER", "ORGANIZER", "ADMIN"] },
  { prefix: "/offers", roles: ["CUSTOMER", "ORGANIZER", "ADMIN"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifySessionToken(token) : null;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(user.role)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("denied", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/organizer/:path*", "/bookings/:path*", "/offers/:path*"],
};
