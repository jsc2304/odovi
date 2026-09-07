import { defineConfig, devices } from "@playwright/test";

const evidenceDir = process.env.ODOVI_ACCEPTANCE_EVIDENCE_DIR ?? "acceptance-results/local";
const phase = process.env.ODOVI_ACCEPTANCE_PHASE ?? "adhoc";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: `${evidenceDir}/test-results/${phase}`,
  reporter: [
    ["line"],
    ["json", { outputFile: `${evidenceDir}/playwright-${phase}.json` }],
    ["html", { outputFolder: `${evidenceDir}/playwright-report/${phase}`, open: "never" }],
  ],
  use: {
    baseURL: process.env.ODOVI_ACCEPTANCE_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(process.env.ODOVI_ACCEPTANCE_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.ODOVI_ACCEPTANCE_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  projects: [
    {
      name: "setup-desktop",
      testMatch: /release-journey\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], locale: "de-DE" },
    },
    {
      name: "desktop",
      testIgnore: /release-journey\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], locale: "en-US" },
    },
    {
      name: "mobile",
      testMatch: /coverage\.spec\.ts/,
      use: { ...devices["iPhone 13"], browserName: "chromium", locale: "de-DE" },
    },
  ],
});
