import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReleaseMetadata,
  createCandidateRecord,
  renderImmutableCompose,
  verifyCandidateRecord,
  verifyCandidateRun,
} from "./lib/release.mjs";
import { releaseImageEvidence } from "./lib/release-image.mjs";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const commit = "c".repeat(40);
const repository = { id: 123, full_name: "jsc2304/odovi", default_branch: "main" };
const workflow = { id: 456, path: ".github/workflows/release.yml", state: "active" };
const run = {
  id: 789, run_attempt: 2, repository, head_repository: repository,
  workflow_id: workflow.id, path: workflow.path, head_branch: "main",
  head_sha: commit, event: "workflow_dispatch", status: "completed", conclusion: "success",
};

test("authenticates the exact successful candidate run attempt", () => {
  assert.equal(verifyCandidateRun(run, workflow, repository, "789", "2"), commit);
  for (const patch of [
    { id: 790 }, { run_attempt: 1 }, { workflow_id: 457 }, { path: ".github/workflows/other.yml" },
    { head_branch: "feature" }, { event: "pull_request" }, { event: "push" },
    { status: "in_progress" }, { conclusion: "failure" }, { conclusion: "cancelled" },
    { head_sha: "invalid" }, { repository: { id: 999 } }, { head_repository: { id: 999 } },
  ]) {
    assert.throws(() => verifyCandidateRun({ ...run, ...patch }, workflow, repository, "789", "2"));
  }
  assert.throws(() => verifyCandidateRun(run, { ...workflow, path: ".github/workflows/other.yml" }, repository, "789", "2"));
  assert.throws(() => verifyCandidateRun(run, { ...workflow, state: "disabled_manually" }, repository, "789", "2"));
  assert.throws(() => verifyCandidateRun(run, workflow, { ...repository, default_branch: "feature" }, "789", "2"));
  assert.throws(() => verifyCandidateRun(run, workflow, { ...repository, full_name: "attacker/odovi" }, "789", "2"));
  for (const coordinates of [["789\n", "2"], ["789", "0"], ["789", "2/../3"]]) {
    assert.throws(() => verifyCandidateRun(run, workflow, repository, ...coordinates));
  }
});

test("promotion uses trusted code before downloading the exact authenticated artifact", () => {
  const yaml = readFileSync(new URL("../.github/workflows/promote-release.yml", import.meta.url), "utf8");
  const checkout = yaml.indexOf("ref: ${{ github.sha }}");
  const authenticate = yaml.indexOf("run: node scripts/verify-release-candidate-run.mjs");
  const download = yaml.indexOf("uses: actions/download-artifact@v4");
  assert.ok(checkout > 0 && checkout < authenticate && authenticate < download);
  assert.match(yaml, /name: \$\{\{ steps\.provenance\.outputs\.artifact_name \}\}/);
  assert.match(yaml, /"\$\{\{ steps\.provenance\.outputs\.source_commit \}\}"/);
  assert.doesNotMatch(yaml, /ref:.*(?:steps\.source|source_commit)|pattern: release-candidate/);
});

test("run verifier exports only API-authenticated commits in trusted promotion history", () => {
  const dir = mkdtempSync(join(tmpdir(), "odovi-provenance-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-b", "main");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "candidate");
    const source = git("rev-parse", "HEAD");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "promotion");
    const promotion = git("rev-parse", "HEAD");
    git("checkout", "--orphan", "untrusted");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "unrelated");
    const unrelated = git("rev-parse", "HEAD");
    const fixture = join(dir, "api.json");
    const output = join(dir, "output");
    writeFileSync(join(dir, "gh"), `#!${process.execPath}\nconst fs = require('node:fs');\nconst data = JSON.parse(fs.readFileSync(process.env.API_FIXTURE));\nconst path = process.argv.at(-1);\nconsole.log(JSON.stringify(path.includes('/attempts/') ? data.run : path.includes('/workflows/') ? data.workflow : data.repository));\n`, { mode: 0o700 });
    const execute = (candidateRun) => {
      writeFileSync(fixture, JSON.stringify({ run: candidateRun, workflow, repository }));
      rmSync(output, { force: true });
      return spawnSync(process.execPath, [fileURLToPath(new URL("./verify-release-candidate-run.mjs", import.meta.url))], {
        cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
          API_FIXTURE: fixture, GITHUB_OUTPUT: output, GITHUB_REPOSITORY: repository.full_name,
          GITHUB_SHA: promotion, CANDIDATE_RUN_ID: "789", CANDIDATE_RUN_ATTEMPT: "2" },
      });
    };
    assert.equal(execute({ ...run, head_sha: source }).status, 0);
    assert.equal(readFileSync(output, "utf8"), `source_commit=${source}\nartifact_name=release-candidate-${source}-2\n`);
    for (const candidateRun of [{ ...run, head_sha: unrelated }, { ...run, head_sha: source, conclusion: "failure" }]) {
      const result = execute(candidateRun);
      assert.notEqual(result.status, 0);
      assert.throws(() => readFileSync(output), /ENOENT/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const metadata = {
  schemaVersion: 1,
  version: "0.2.0",
  candidate: "0.2.0-rc.1",
  images: { web: "ghcr.io/jsc2304/odovi-web", worker: "ghcr.io/jsc2304/odovi-worker" },
  architectures: ["linux/amd64", "linux/arm64"],
  requiredAcceptanceIssues: [27],
  packages: ["package.json"],
  supportedRuntimes: { application: "Node.js 22" },
  teslaMateRange: "4.0.1 through 4.2.0",
  testedPlatforms: [{ platform: "linux/amd64", coverage: "acceptance" }],
  knownLimitations: ["native arm64 acceptance pending"],
};

function acceptance(enforced = true) {
  return {
    status: "passed",
    gitCommit: commit,
    version: metadata.version,
    images: {
      web: `${metadata.images.web}@${digestA}`,
      worker: `${metadata.images.worker}@${digestB}`,
    },
    startedAt: "2026-08-26T10:00:00Z",
    finishedAt: "2026-08-26T10:10:00Z",
    dependencyGates: [{ issue: 27, enforced }],
  };
}

test("creates an accepted candidate only when every acceptance dependency ran", () => {
  const accepted = createCandidateRecord(metadata, {
    sourceCommit: commit,
    webDigest: digestA,
    workerDigest: digestB,
    acceptance: acceptance(true),
    createdAt: "2026-08-26T10:11:00Z",
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.images.web.reference, `${metadata.images.web}@${digestA}`);
  assert.doesNotThrow(() => verifyCandidateRecord(metadata, accepted, "jsc2304/odovi", commit));

  const incomplete = createCandidateRecord(metadata, {
    sourceCommit: commit,
    webDigest: digestA,
    workerDigest: digestB,
    acceptance: acceptance(false),
  });
  assert.equal(incomplete.accepted, false);
  assert.throws(() => verifyCandidateRecord(metadata, incomplete, "jsc2304/odovi", commit), /not accepted/);
});

test("rejects inconsistent candidate input", () => {
  assert.throws(
    () => createCandidateRecord(metadata, {
      sourceCommit: "d".repeat(40),
      webDigest: digestA,
      workerDigest: digestB,
      acceptance: acceptance(true),
    }),
    /acceptance commit/,
  );
  assert.throws(() => assertReleaseMetadata({ ...metadata, candidate: "0.3.0-rc.1" }), /prerelease/);
});

test("candidate acceptance must have exercised the exact published image digests", () => {
  for (const images of [
    undefined,
    { web: "odovi-web:local", worker: `${metadata.images.worker}@${digestB}` },
    { web: `${metadata.images.web}@${digestB}`, worker: `${metadata.images.worker}@${digestB}` },
    { web: `${metadata.images.web}@${digestA}`, worker: `${metadata.images.worker}@${digestA}` },
  ]) {
    assert.throws(() => createCandidateRecord(metadata, {
      sourceCommit: commit, webDigest: digestA, workerDigest: digestB,
      acceptance: { ...acceptance(), images },
    }), /acceptance.*image/);
  }
});

test("promotion rejects missing or mismatched accepted-image provenance", () => {
  const record = createCandidateRecord(metadata, {
    sourceCommit: commit, webDigest: digestA, workerDigest: digestB,
    acceptance: acceptance(),
  });
  for (const images of [undefined, {
    web: `${metadata.images.web}@${digestB}`,
    worker: `${metadata.images.worker}@${digestB}`,
  }]) {
    assert.throws(() => verifyCandidateRecord(metadata, {
      ...record, acceptance: { ...record.acceptance, images },
    }, "jsc2304/odovi", commit), /acceptance.*image/);
  }
});

test("promotion requires the record source to match the authenticated run", () => {
  const record = createCandidateRecord(metadata, {
    sourceCommit: commit, webDigest: digestA, workerDigest: digestB, acceptance: acceptance(),
  });
  assert.throws(() => verifyCandidateRecord(metadata, record, "jsc2304/odovi"), /invalid full source commit/);
  assert.throws(() => verifyCandidateRecord(metadata, record, "jsc2304/odovi", "d".repeat(40)), /authenticated run/);
});

test("renders every release digest reference without changing source-build variables", () => {
  const template = [
    "# Supply ODOVI_WEB_DIGEST and ODOVI_WORKER_DIGEST from the record.",
    "image: ghcr.io/jsc2304/odovi-web@${ODOVI_WEB_DIGEST:?required}",
    "image: ghcr.io/jsc2304/odovi-worker@${ODOVI_WORKER_DIGEST:?required}",
    "environment: ${POSTGRES_PASSWORD:?required}",
  ].join("\n");
  const rendered = renderImmutableCompose(template, digestA, digestB);
  assert.match(rendered, new RegExp(digestA));
  assert.match(rendered, new RegExp(digestB));
  assert.match(rendered, /\$\{POSTGRES_PASSWORD:\?required\}/);
});

test("verifies the built architecture and both OCI identity labels", () => {
  const inspected = {
    Id: digestA,
    Architecture: "arm64",
    Config: {
      Labels: {
        "org.opencontainers.image.version": metadata.version,
        "org.opencontainers.image.revision": commit,
      },
    },
  };
  const evidence = releaseImageEvidence(inspected, {
    image: "local/odovi-web:test",
    version: metadata.version,
    commit,
    platform: "linux/arm64",
  });
  assert.equal(evidence.architecture, "arm64");
  assert.throws(
    () => releaseImageEvidence(inspected, {
      image: "local/odovi-web:test",
      version: "0.2.1",
      commit,
      platform: "linux/arm64",
    }),
    /version label/,
  );
});
