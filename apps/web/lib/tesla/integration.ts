import "server-only";
import { eq, sql } from "drizzle-orm";
import { settings } from "@tripatlas/db";
import { db } from "../db";
import { decryptTeslaSecret, encryptTeslaSecret } from "./crypto";
import { getTeslaConfig } from "./config";

const TESLA_SETTING_KEY = "tesla_fleet_integration";
const TOKEN_ENDPOINT = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";

interface StoredTeslaIntegration {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  vehicleVin: string;
  connectedAt: string;
}

export interface TeslaIntegrationStatus {
  configured: boolean;
  connected: boolean;
  vehicleVin: string | null;
  partnerDomain: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function isStoredIntegration(value: unknown): value is StoredTeslaIntegration {
  if (typeof value !== "object" || value == null) return false;
  const row = value as Record<string, unknown>;
  return ["accessToken", "refreshToken", "expiresAt", "vehicleVin", "connectedAt"].every(
    (field) => typeof row[field] === "string" && row[field] !== "",
  );
}

async function readStored(executor: Pick<typeof db, "select"> = db): Promise<StoredTeslaIntegration | null> {
  const rows = await executor
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, TESLA_SETTING_KEY))
    .limit(1);
  return isStoredIntegration(rows[0]?.value) ? rows[0].value : null;
}

export async function getTeslaIntegrationStatus(): Promise<TeslaIntegrationStatus> {
  const config = getTeslaConfig();
  const stored = await readStored();
  return {
    configured: config != null,
    connected: config != null && stored != null,
    vehicleVin: stored?.vehicleVin ?? null,
    partnerDomain: config?.partnerDomain ?? null,
  };
}

export async function saveTeslaIntegration(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  vehicleVin: string;
}): Promise<void> {
  const value: StoredTeslaIntegration = {
    accessToken: encryptTeslaSecret(input.accessToken),
    refreshToken: encryptTeslaSecret(input.refreshToken),
    expiresAt: new Date(Date.now() + Math.max(60, input.expiresIn - 60) * 1000).toISOString(),
    vehicleVin: input.vehicleVin,
    connectedAt: new Date().toISOString(),
  };
  await db
    .insert(settings)
    .values({ key: TESLA_SETTING_KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteTeslaIntegration(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, TESLA_SETTING_KEY));
}

async function exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
  const config = getTeslaConfig();
  if (!config) throw new Error("TESLA_NOT_CONFIGURED");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    audience: config.fleetApiBaseUrl,
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TESLA_REFRESH_FAILED_${response.status}`);
  return (await response.json()) as TokenResponse;
}

export async function withTeslaAccessToken<T>(
  operation: (accessToken: string, vehicleVin: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(84710231)`);
    const stored = await readStored(tx);
    if (!stored) throw new Error("TESLA_NOT_CONNECTED");

    let accessToken = decryptTeslaSecret(stored.accessToken);
    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      const refreshed = await exchangeRefreshToken(decryptTeslaSecret(stored.refreshToken));
      accessToken = refreshed.access_token;
      const value: StoredTeslaIntegration = {
        ...stored,
        accessToken: encryptTeslaSecret(refreshed.access_token),
        refreshToken: encryptTeslaSecret(refreshed.refresh_token),
        expiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000).toISOString(),
      };
      await tx
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, TESLA_SETTING_KEY));
    }
    return operation(accessToken, stored.vehicleVin);
  });
}

export { TOKEN_ENDPOINT };
