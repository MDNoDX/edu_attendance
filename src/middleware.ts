import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Runs on the Edge runtime, so it cannot import Prisma or bcrypt — only jose,
// which is edge-compatible, is used here to verify the JWT signature.
//
// Two account kinds: TEACHER (self-service, /dashboard/*) and SUPER_ADMIN
// (platform owner, /admin/*, provisioned only via prisma/create-admin.ts).
// The role lives in the JWT claim for this quick edge-level routing check;
// every actual admin server action still re-verifies the role against the
// database via requireSuperAdmin() before doing anything sensitive.

const SESSION_COOKIE = "ustoz_session";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

async function verify(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as { sub: string; username: string; role?: "TEACHER" | "SUPER_ADMIN" };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verify(token) : null;
  const homeForSession = session?.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";

  if (isAuthRoute) {
    if (session) {
      return NextResponse.redirect(new URL(homeForSession, request.url));
    }
    return NextResponse.next();
  }

  if (isDashboardRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/signup"],
};
