import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [output, status] = process.argv.slice(2);
function passedBrowserCases(filename, titlePrefix, projects) {
  try {
    const report = JSON.parse(readFileSync(join(dirname(output), filename), "utf8"));
    const specs = (suite) => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
    const cases = (report.suites ?? []).flatMap(specs)
      .filter((spec) => spec.title.startsWith(titlePrefix)).flatMap((spec) => spec.tests);
    return Object.entries(projects).every(([project, expectedCount]) => {
      const matching = cases.filter((test) => test.projectName === project);
      return matching.length === expectedCount && matching.every((test) =>
        test.status === "expected" && test.results.at(-1)?.status === "passed");
    });
  } catch {
    return false;
  }
}
const insightsFixtureEnforced = status === "passed" && process.env.ODOVI_EXPECT_INSIGHTS_FIXTURE === "1";
const dependencyGates = [
  { issue: 27, contract: "single-use setup token", enforced: process.env.ODOVI_ACCEPTANCE_SETUP_TOKEN != null },
  { issue: 28, contract: "visible version and build identity", enforced: process.env.ODOVI_EXPECT_RELEASE_IDENTITY === "1" },
  { issue: 29, contract: "browser locale detection and English fallback", enforced: process.env.ODOVI_EXPECT_BROWSER_LOCALE === "1" },
  { issue: 31, contract: "readiness distinct from liveness", enforced: process.env.ODOVI_ACCEPTANCE_READINESS_PATH !== "/api/health" },
  { issue: 32, contract: "Provider Review and explicit provider-disabled state", enforced: process.env.ODOVI_EXPECT_PROVIDER_DISABLED_UI === "1" },
  { issue: 33, contract: "map-disabled fallback and click-only external navigation", enforced: process.env.ODOVI_EXPECT_MAP_PROVIDER_POLICY === "1" },
  { issue: 38, contract: "supported TeslaMate compatibility range", enforced: process.env.ODOVI_EXPECT_TESLAMATE_COMPAT === "1" },
  { issue: 49, contract: "five/ten DC sessions, retained missing curves and qualified slow-session insight", enforced: insightsFixtureEnforced
    && passedBrowserCases("playwright-coverage.json", "DC charging analysis is usable", { desktop: 2, mobile: 2 }) },
  { issue: 50, contract: "non-empty classified yearly destinations, Home exclusion, controlled heatmap and print", enforced: insightsFixtureEnforced
    && passedBrowserCases("playwright-coverage.json", "yearly destinations and Wrapped", { desktop: 2, mobile: 2 })
    && passedBrowserCases("playwright-provider-contracts.json", "activated capabilities use only controlled provider contracts", { desktop: 1 }) },
];

const manifest = {
  schemaVersion: 1,
  status,
  startedAt: process.env.ODOVI_ACCEPTANCE_STARTED_AT,
  finishedAt: new Date().toISOString(),
  gitCommit: process.env.ODOVI_ACCEPTANCE_GIT_COMMIT,
  version: process.env.ODOVI_ACCEPTANCE_VERSION,
  composeProject: process.env.ODOVI_ACCEPTANCE_PROJECT,
  images: {
    web: process.env.ODOVI_WEB_IMAGE,
    worker: process.env.ODOVI_WORKER_IMAGE,
    fixtures: process.env.ODOVI_FIXTURES_IMAGE,
  },
  baseUrl: process.env.ODOVI_ACCEPTANCE_BASE_URL,
  fixtureDay: process.env.ODOVI_ACCEPTANCE_DAY,
  insightsYear: process.env.ODOVI_ACCEPTANCE_INSIGHTS_YEAR,
  chromiumExecutable: process.env.ODOVI_ACCEPTANCE_CHROMIUM_EXECUTABLE ?? "playwright-managed",
  readinessPath: process.env.ODOVI_ACCEPTANCE_READINESS_PATH,
  dependencyGates,
  evidence: {
    composeConfig: "compose-config.yml",
    composePs: "compose-ps.json",
    composeLogs: "compose.log",
    imageInspect: "image-inspect.json",
    egressSummary: "egress-summary.json",
    readinessStates: "readiness-states.ndjson",
    insightsFixture: "insights-fixture.json",
    backlogBrowserChecks: "playwright-backlog.json",
    analyticsAccessFixture: "analytics-access-fixture.json",
    playwrightResults: [
      "playwright-journey.json",
      "playwright-coverage.json",
      "playwright-provider-contracts.json",
      "playwright-restart.json",
      "playwright-backlog.json",
    ],
    playwrightReports: [
      "playwright-report/journey/index.html",
      "playwright-report/coverage/index.html",
      "playwright-report/provider-contracts/index.html",
      "playwright-report/restart/index.html",
      "playwright-report/backlog/index.html",
    ],
  },
};

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
