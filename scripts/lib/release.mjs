import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function assertReleaseMetadata(metadata) {
  if (metadata.schemaVersion !== 1) throw new Error("release metadata schemaVersion must be 1");
  if (!SEMVER.test(metadata.version)) throw new Error(`invalid semantic version: ${metadata.version}`);
  if (!SEMVER.test(metadata.candidate) || !metadata.candidate.startsWith(`${metadata.version}-`)) {
    throw new Error(`candidate must be a prerelease of ${metadata.version}: ${metadata.candidate}`);
  }
  if (!Array.isArray(metadata.architectures) || metadata.architectures.join(",") !== "linux/amd64,linux/arm64") {
    throw new Error("architectures must be linux/amd64 and linux/arm64");
  }
  for (const image of ["web", "worker"]) {
    if (!metadata.images?.[image]?.startsWith("ghcr.io/jsc2304/odovi-")) {
      throw new Error(`invalid ${image} image repository`);
    }
  }
  for (const field of ["packages", "testedPlatforms", "knownLimitations"]) {
    if (!Array.isArray(metadata[field]) || metadata[field].length === 0) {
      throw new Error(`${field} must be a non-empty array`);
    }
  }
  if (!Array.isArray(metadata.requiredAcceptanceIssues) || metadata.requiredAcceptanceIssues.length === 0 ||
      !metadata.requiredAcceptanceIssues.every(Number.isInteger)) {
    throw new Error("requiredAcceptanceIssues must be a non-empty integer array");
  }
  return metadata;
}

export function assertCommit(commit) {
  if (!COMMIT.test(commit)) throw new Error(`invalid full source commit: ${commit}`);
  return commit;
}

export function assertDigest(digest, label = "image") {
  if (!DIGEST.test(digest)) throw new Error(`invalid ${label} digest: ${digest}`);
  return digest;
}

export function createCandidateRecord(metadata, options) {
  assertReleaseMetadata(metadata);
  const sourceCommit = assertCommit(options.sourceCommit);
  const webDigest = assertDigest(options.webDigest, "web image");
  const workerDigest = assertDigest(options.workerDigest, "worker image");
  const acceptance = options.acceptance;

  if (acceptance.status !== "passed") throw new Error("release acceptance did not pass");
  if (acceptance.gitCommit !== sourceCommit) throw new Error("acceptance commit does not match candidate commit");
  if (acceptance.version !== metadata.version) throw new Error("acceptance version does not match release version");

  for (const [image, digest] of [["web", webDigest], ["worker", workerDigest]]) {
    if (acceptance.images?.[image] !== `${metadata.images[image]}@${digest}`) {
      throw new Error(`acceptance ${image} image does not match the published candidate digest`);
    }
  }

  const dependencyGates = acceptance.dependencyGates ?? [];
  const allAcceptanceGatesEnforced = metadata.requiredAcceptanceIssues.every((issue) =>
    dependencyGates.some((gate) => gate.issue === issue && gate.enforced === true));

  return {
    schemaVersion: 1,
    candidate: metadata.candidate,
    version: metadata.version,
    sourceCommit,
    publicationState: "published-candidate",
    accepted: allAcceptanceGatesEnforced,
    createdAt: options.createdAt ?? new Date().toISOString(),
    images: {
      web: {
        repository: metadata.images.web,
        digest: webDigest,
        reference: `${metadata.images.web}@${webDigest}`,
        architectures: metadata.architectures,
      },
      worker: {
        repository: metadata.images.worker,
        digest: workerDigest,
        reference: `${metadata.images.worker}@${workerDigest}`,
        architectures: metadata.architectures,
      },
    },
    supportedRuntimes: metadata.supportedRuntimes,
    teslaMateRange: metadata.teslaMateRange,
    testedPlatforms: metadata.testedPlatforms,
    knownLimitations: metadata.knownLimitations,
    gates: {
      completeCi: "passed",
      productionDependencies: "passed",
      composeValidation: "passed",
      releaseConsistency: "passed",
      multiArchitectureBuild: "passed",
      releaseAcceptance: "passed",
      allAcceptanceDependenciesEnforced: allAcceptanceGatesEnforced,
    },
    acceptance: {
      startedAt: acceptance.startedAt,
      finishedAt: acceptance.finishedAt,
      images: { web: acceptance.images.web, worker: acceptance.images.worker },
      dependencyGates,
    },
  };
}

export function verifyCandidateRun(run, workflow, repository, runId, attempt) {
  if (!/^[1-9][0-9]*$/.test(runId) || !/^[1-9][0-9]*$/.test(attempt)) {
    throw new Error("invalid candidate run coordinates");
  }
  if (repository.full_name !== "jsc2304/odovi" || repository.default_branch !== "main" ||
      run.repository?.id !== repository.id || run.head_repository?.id !== repository.id) {
    throw new Error("candidate run must originate in jsc2304/odovi");
  }
  if (workflow.path !== ".github/workflows/release.yml" || workflow.state !== "active" ||
      run.workflow_id !== workflow.id || run.path !== workflow.path) {
    throw new Error("candidate run must use the Release Candidate workflow");
  }
  if (String(run.id) !== runId || String(run.run_attempt) !== attempt ||
      run.head_branch !== repository.default_branch || run.event !== "workflow_dispatch" ||
      run.status !== "completed" || run.conclusion !== "success") {
    throw new Error("candidate must be the selected successful main workflow_dispatch attempt");
  }
  return assertCommit(run.head_sha);
}

export function verifyCandidateRecord(metadata, record, expectedRepository, expectedSourceCommit) {
  assertReleaseMetadata(metadata);
  assertCommit(record.sourceCommit);
  assertCommit(expectedSourceCommit);
  if (record.sourceCommit !== expectedSourceCommit) {
    throw new Error("candidate source commit does not match the authenticated run");
  }
  if (expectedRepository !== "jsc2304/odovi") throw new Error("candidate must be promoted in jsc2304/odovi");
  if (record.schemaVersion !== 1 || record.version !== metadata.version || record.candidate !== metadata.candidate) {
    throw new Error("candidate identity does not match release metadata");
  }
  if (record.publicationState !== "published-candidate") throw new Error("candidate images were not published");
  if (record.accepted !== true) throw new Error("candidate is not accepted by every release-acceptance dependency gate");
  for (const gate of [
    "completeCi",
    "productionDependencies",
    "composeValidation",
    "releaseConsistency",
    "multiArchitectureBuild",
    "releaseAcceptance",
  ]) {
    if (record.gates?.[gate] !== "passed") throw new Error(`candidate gate did not pass: ${gate}`);
  }
  if (record.gates?.allAcceptanceDependenciesEnforced !== true) {
    throw new Error("not every release-acceptance dependency gate was enforced");
  }
  if (!Array.isArray(record.acceptance?.dependencyGates) ||
      !metadata.requiredAcceptanceIssues.every((issue) =>
        record.acceptance.dependencyGates.some((gate) => gate.issue === issue && gate.enforced === true))) {
    throw new Error("candidate acceptance does not contain a complete enforced dependency-gate record");
  }
  for (const field of ["supportedRuntimes", "testedPlatforms", "knownLimitations"]) {
    if (JSON.stringify(record[field]) !== JSON.stringify(metadata[field])) {
      throw new Error(`candidate ${field} does not match release metadata`);
    }
  }
  if (record.teslaMateRange !== metadata.teslaMateRange) {
    throw new Error("candidate TeslaMate range does not match release metadata");
  }
  for (const image of ["web", "worker"]) {
    const entry = record.images?.[image];
    assertDigest(entry?.digest, `${image} image`);
    if (entry.repository !== metadata.images[image] || entry.reference !== `${entry.repository}@${entry.digest}`) {
      throw new Error(`${image} image reference does not match its recorded digest`);
    }
    if (record.acceptance?.images?.[image] !== entry.reference) {
      throw new Error(`candidate acceptance ${image} image does not match the promoted digest`);
    }
    if (entry.architectures?.join(",") !== metadata.architectures.join(",")) {
      throw new Error(`${image} image architectures do not match release metadata`);
    }
  }
  return record;
}

export function renderImmutableCompose(template, webDigest, workerDigest) {
  assertDigest(webDigest, "web image");
  assertDigest(workerDigest, "worker image");
  const rendered = template
    .replace(/\$\{ODOVI_WEB_DIGEST:\?[^}]+\}/g, webDigest)
    .replace(/\$\{ODOVI_WORKER_DIGEST:\?[^}]+\}/g, workerDigest);
  if (/\$\{ODOVI_(?:WEB|WORKER)_DIGEST:/.test(rendered)) {
    throw new Error("not every release image digest placeholder was rendered");
  }
  return rendered;
}

export function resolveFrom(root, path) {
  return resolve(root, path);
}
