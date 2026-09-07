import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "write-manifest.mjs");
function cases(prefix, projects = ["desktop", "mobile"], locales = ["en", "de"]) {
  return projects.flatMap((projectName) => locales.map((locale) => ({
    title: `${prefix} in ${locale}`,
    tests: [{ projectName, status: "expected", results: [{ status: "passed" }] }],
  })));
}
const dc = () => cases("DC charging analysis is usable");
const yearly = () => cases("yearly destinations and Wrapped");
const provider = () => cases("activated capabilities use only controlled provider contracts", ["desktop"], ["en"]);

function manifest({ flag = "1", status = "passed", coverage = [...dc(), ...yearly()], providers = provider() } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "odovi-acceptance-manifest-"));
  try {
    if (coverage !== null) writeFileSync(join(directory, "playwright-coverage.json"), JSON.stringify({ suites: [{ specs: coverage }] }));
    if (providers !== null) writeFileSync(join(directory, "playwright-provider-contracts.json"), JSON.stringify({ suites: [{ specs: providers }] }));
    const output = join(directory, "manifest.json");
    const result = spawnSync(process.execPath, [script, output, status], {
      env: { ...process.env, ODOVI_EXPECT_INSIGHTS_FIXTURE: flag }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(JSON.parse(readFileSync(output, "utf8")).dependencyGates
      .filter((gate) => gate.issue === 49 || gate.issue === 50).map((gate) => [gate.issue, gate.enforced]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("reports analytics gates only for the enforced fixture and passing full browser matrix", () => {
  assert.deepEqual(manifest(), { 49: true, 50: true });
  assert.deepEqual(manifest({ flag: "0" }), { 49: false, 50: false });
  assert.deepEqual(manifest({ status: "failed" }), { 49: false, 50: false });
});

test("missing result files cannot masquerade as passed feature coverage", () => {
  assert.deepEqual(manifest({ coverage: null }), { 49: false, 50: false });
  assert.deepEqual(manifest({ providers: null }), { 49: true, 50: false });
});

test("a missing mobile or German scenario fails the corresponding gate", () => {
  assert.deepEqual(manifest({ coverage: [...dc().slice(0, -1), ...yearly()] }), { 49: false, 50: true });
  assert.deepEqual(manifest({ coverage: [...dc(), ...yearly().slice(0, -1)] }), { 49: true, 50: false });
});

test("failed or skipped scenarios cannot satisfy either analytics gate", () => {
  const coverage = [...dc(), ...yearly()];
  coverage[0].tests[0].status = "unexpected";
  coverage[0].tests[0].results = [{ status: "failed" }];
  const providers = provider();
  providers[0].tests[0].results = [{ status: "skipped" }];
  assert.deepEqual(manifest({ coverage, providers }), { 49: false, 50: false });
});
