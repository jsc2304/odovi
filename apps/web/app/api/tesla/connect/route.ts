import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { validateSession } from "../../../../lib/auth/session";
import { getTeslaConfig } from "../../../../lib/tesla/config";

export async function GET() {
  const user = await validateSession();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.TESLA_REDIRECT_URI ?? "http://localhost:3000"));
  const config = getTeslaConfig();
  if (!config) return NextResponse.json({ error: "Tesla integration is not configured" }, { status: 503 });

  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://auth.tesla.com/oauth2/v3/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid offline_access vehicle_device_data vehicle_cmds",
    state,
    prompt_missing_scopes: "true",
    require_requested_scopes: "true",
    show_keypair_step: "true",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("tripatlas_tesla_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.redirectUri.startsWith("https://"),
    path: "/api/tesla/callback",
    maxAge: 600,
  });
  return response;
}
