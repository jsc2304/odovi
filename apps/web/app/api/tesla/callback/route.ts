import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "../../../../lib/auth/session";
import { getTeslaConfig } from "../../../../lib/tesla/config";
import { saveTeslaIntegration, TOKEN_ENDPOINT } from "../../../../lib/tesla/integration";
import { db } from "../../../../lib/db";
import { vehicles as localVehicles } from "@tripatlas/db";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface VehicleListResponse {
  response?: Array<{ vin?: string }>;
}

function settingsRedirect(request: NextRequest, value: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/settings";
  url.search = `tesla=${value}`;
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await validateSession();
  if (!user) return settingsRedirect(request, "auth-required");
  const config = getTeslaConfig();
  if (!config) return settingsRedirect(request, "not-configured");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = (await cookies()).get("tripatlas_tesla_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect(request, "invalid-state");
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      audience: config.fleetApiBaseUrl,
      redirect_uri: config.redirectUri,
    });
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!tokenResponse.ok) return settingsRedirect(request, "token-failed");
    const tokens = (await tokenResponse.json()) as TokenResponse;
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) {
      return settingsRedirect(request, "token-failed");
    }

    const vehiclesResponse = await fetch(`${config.fleetApiBaseUrl}/api/1/vehicles`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!vehiclesResponse.ok) return settingsRedirect(request, "vehicles-failed");
    const vehicles = (await vehiclesResponse.json()) as VehicleListResponse;
    const knownVins = new Set(
      (await db.select({ vin: localVehicles.vin }).from(localVehicles))
        .map((vehicle) => vehicle.vin)
        .filter((vin): vin is string => Boolean(vin)),
    );
    const fleetVehicles = vehicles.response?.filter(
      (vehicle): vehicle is { vin: string } => Boolean(vehicle.vin),
    );
    const vehicleVin =
      fleetVehicles?.find((vehicle) => knownVins.has(vehicle.vin))?.vin ??
      fleetVehicles?.[0]?.vin;
    if (!vehicleVin) return settingsRedirect(request, "no-vehicle");

    await saveTeslaIntegration({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      vehicleVin,
    });
    const response = settingsRedirect(request, "connected");
    response.cookies.delete("tripatlas_tesla_oauth_state");
    return response;
  } catch {
    return settingsRedirect(request, "failed");
  }
}
