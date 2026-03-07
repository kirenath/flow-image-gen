import { NextResponse } from "next/server";

/**
 * Middleware: Protect all routes behind access key authentication.
 * Unauthenticated requests are redirected to /login.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths through without auth
  const publicPaths = ["/login", "/api/auth", "/api/auth/linuxdo"];
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("flow_auth");
  if (!authCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
