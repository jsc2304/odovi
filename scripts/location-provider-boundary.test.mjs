import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const productionRoots = ["apps/web", "apps/worker", "packages/core"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function sourceFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist"].includes(entry.name)) return [];
      return sourceFiles(path);
    }
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return sourceExtensions.has(extension) ? [path] : [];
  });
}

const sources = productionRoots.flatMap(sourceFiles);

function matchingFiles(pattern) {
  return sources.filter((file) => pattern.test(readFileSync(join(root, file), "utf8")));
}

test("public location-provider hosts exist only in the provider registry", () => {
  const hosts = [
    "api.open-meteo.com",
    "archive-api.open-meteo.com",
    "tile.openstreetmap.org",
    "nominatim.openstreetmap.org",
    "router.project-osrm.org",
    "www.google.com/maps",
  ];
  for (const host of hosts) {
    assert.deepEqual(
      matchingFiles(new RegExp(host.replaceAll(".", "\\."))),
      ["packages/core/src/locationProviders/policy.ts"],
      `${host} must be declared only by LocationProviderPolicy`,
    );
  }
});

test("global fetch sites cannot hide a location-provider bypass", () => {
  const approved = [
    // Reviewed same-origin archive requests; every handler validates its session.
    "apps/web/app/(app)/invoices/InvoiceArchive.tsx",
    "apps/web/app/api/tesla/callback/route.ts",
    "apps/web/lib/actions/tesla.ts",
    "apps/web/lib/tesla/integration.ts",
    "apps/web/public/sw.js",
  ];
  assert.deepEqual(matchingFiles(/\bfetch\s*\(/).sort(), approved.sort());
  const invoices = readFileSync(join(root, approved[0]), "utf8");
  assert.match(invoices, /fetch\("\/api\/invoices"/);
  assert.match(invoices, /url\.startsWith\("\/api\/invoices\/"\)/);
});

test("location-provider transports stay inside the reviewed adapters", () => {
  const adapters = [
    "apps/web/lib/locationProviders/addressSearch.ts",
    "apps/web/lib/locationProviders/mapTiles.ts",
    "apps/web/lib/locationProviders/roadtrip.ts",
    "apps/web/lib/weather.ts",
    "apps/worker/src/sync/driveWeather.ts",
    "apps/worker/src/sync/elevation.ts",
  ];
  for (const file of adapters) {
    const body = readFileSync(join(root, file), "utf8");
    assert.match(body, /ActiveProviderResolution/, `${file} must require an active resolution`);
    assert.match(body, /(?:fetcher|fetchImplementation|await request)\s*\(/, `${file} must retain its reviewed transport seam`);
  }
});

test("browser location egress has one policy-derived map and navigation seam", () => {
  assert.deepEqual(matchingFiles(/\bL\.tileLayer\s*\(/), [
    "apps/web/lib/locationProviders/mapTiles.client.ts",
  ]);
  assert.deepEqual(matchingFiles(/\bwindow\.open\s*\(/), [
    "apps/web/app/roadtrip-offline/OfflineRoadtripCompanion.tsx",
  ]);
});

test("legacy endpoint switches cannot reach a production caller", () => {
  const appSources = sources.filter((file) => file.startsWith("apps/"));
  for (const setting of ["OSRM_URL", "ELEVATION_ENABLED"]) {
    const matches = appSources.filter((file) =>
      readFileSync(join(root, file), "utf8").includes(setting),
    );
    assert.deepEqual(matches, [], `${setting} must not control a production caller`);
  }
  for (const compose of ["docker-compose.yml", "release/0.2.0/docker-compose.yml"]) {
    const body = readFileSync(join(root, compose), "utf8");
    assert.equal(body.includes("OSRM_URL"), false);
    assert.equal(body.includes("ELEVATION_ENABLED:"), false);
  }
});
