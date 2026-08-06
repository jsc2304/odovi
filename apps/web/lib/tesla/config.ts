import "server-only";

export interface TeslaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  partnerDomain: string;
  fleetApiBaseUrl: string;
  commandApiUrl: string;
}

export function getTeslaConfig(): TeslaConfig | null {
  const clientId = process.env.TESLA_CLIENT_ID?.trim();
  const clientSecret = process.env.TESLA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TESLA_REDIRECT_URI?.trim();
  const partnerDomain = process.env.TESLA_PARTNER_DOMAIN?.trim();
  const encryptionKey = process.env.TESLA_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !partnerDomain || !encryptionKey) {
    return null;
  }
  const fleetApiBaseUrl =
    process.env.TESLA_FLEET_API_BASE_URL?.replace(/\/$/, "") ??
    "https://fleet-api.prd.eu.vn.cloud.tesla.com";
  return {
    clientId,
    clientSecret,
    redirectUri,
    partnerDomain,
    fleetApiBaseUrl,
    commandApiUrl:
      process.env.TESLA_COMMAND_API_URL?.replace(/\/$/, "") ??
      process.env.TESLA_COMMAND_PROXY_URL?.replace(/\/$/, "") ??
      fleetApiBaseUrl,
  };
}
