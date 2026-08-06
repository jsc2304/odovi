import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/config";

/**
 * Presence-only auth gate. Redirects to /login when no session cookie is set.
 * No DB access happens here (middleware runs on the edge runtime); the actual
 * session validation is done in server components/actions via validateSession.
 */
export function middleware(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except /login, the health check, Next internals and static files.
  matcher: [
    "/((?!login|roadtrip-offline|api/health|sw\\.js|\\.well-known/appspecific/com\\.tesla\\.3p\\.public-key\\.pem|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
