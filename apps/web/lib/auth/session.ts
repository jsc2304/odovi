import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sessions, users } from "@tripatlas/db";
import { db } from "../db";
import { SESSION_COOKIE } from "../config";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** sha256-hex of the raw token; only the hash is ever stored in the DB. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Secure-Flag nur setzen, wenn der Request tatsächlich über HTTPS kam
 * (direkt oder via Proxy/tailscale serve mit x-forwarded-proto). Die
 * Ziel-Deployments sind LAN/VPN über plain HTTP — ein hartes `secure: true`
 * in Produktion ließe den Browser das Cookie verwerfen und der Login
 * liefe in eine stille Redirect-Schleife. Mit FORCE_SECURE_COOKIES=true
 * lässt sich das Flag erzwingen.
 */
async function cookieSecure(): Promise<boolean> {
  if (process.env.FORCE_SECURE_COOKIES === "true") return true;
  const h = await headers();
  const proto =
    h.get("x-forwarded-proto") ??
    (h.get("referer")?.startsWith("https://") ? "https" : "http");
  return proto === "https";
}

export interface SessionUser {
  id: number;
  username: string;
}

/**
 * Creates a new session for the given user: generates a 32-byte random token,
 * persists its sha256 hash with a 30-day expiry, and sets the httpOnly cookie.
 */
export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({ id, userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: await cookieSecure(),
    expires: expiresAt,
  });
}

/**
 * Validates the current request's session cookie. Returns the associated user
 * or null. Expired sessions are deleted. Wrapped in React `cache()` so the
 * lookup runs at most once per request.
 *
 * Cookie renewal deliberately does not happen here: this function is called by
 * Server Components, where Next.js forbids modifying cookies. A fixed 30-day
 * session is preferable to turning otherwise valid page loads into HTTP 500s.
 */
export const validateSession = cache(
  async (): Promise<SessionUser | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const id = hashToken(token);
    const rows = await db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        userId: users.id,
        username: users.username,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    if (row.expiresAt.getTime() <= Date.now()) {
      await db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }

    return { id: row.userId, username: row.username };
  },
);

/**
 * Destroys the current session: deletes the DB row and clears the cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}
