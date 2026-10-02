import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from "./lib/config";

/**
 * Presence-only auth gate. Redirects to /login when no session cookie is set.
 * No DB access happens here; the proxy only checks cookie presence. Actual
 * session validation is done in server components/actions via validateSession.
 */
export function proxy(request: NextRequest) {
  // Match server-side session validation during the supported rename window.
  // https://nextjs.org/docs/app/api-reference/file-conventions/proxy#using-cookies
  const hasCookie = request.cookies.has(SESSION_COOKIE) || request.cookies.has(LEGACY_SESSION_COOKIE);
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except /login, operational probes, Next internals and static files.
  matcher: [
    "/((?!login|roadtrip-offline|api/health|api/ready|sw\\.js|\\.well-known/appspecific/com\\.tesla\\.3p\\.public-key\\.pem|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
