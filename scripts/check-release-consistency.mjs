#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseMetadata, readJson, resolveFrom } from "./lib/release.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = resolve(repoRoot, process.argv[2] ?? "release/0.4.0/release.json");
const metadata = assertReleaseMetadata(readJson(metadataPath));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

for (const packagePath of metadata.packages) {
  const packageJson = readJson(resolveFrom(repoRoot, packagePath));
  check(packageJson.version === metadata.version, `${packagePath} has version ${packageJson.version}, expected ${metadata.version}`);
}

const webSettings = readFileSync(resolveFrom(repoRoot, "apps/web/app/(app)/settings/page.tsx"), "utf8");
const buildInfo = readFileSync(resolveFrom(repoRoot, "packages/core/src/buildInfo.ts"), "utf8");
check(webSettings.includes("ODOVI_VERSION"), "Settings does not read ODOVI_VERSION for the visible application version");
check(buildInfo.includes("ODOVI_VERSION"), "shared build identity does not read ODOVI_VERSION");

for (const dockerfile of ["apps/web/Dockerfile", "apps/worker/Dockerfile"]) {
  const source = readFileSync(resolveFrom(repoRoot, dockerfile), "utf8");
  check(source.includes("LABEL org.opencontainers.image.version=${ODOVI_VERSION}"), `${dockerfile} lacks the version OCI label`);
  check(source.includes("LABEL org.opencontainers.image.revision=${ODOVI_COMMIT_SHA}"), `${dockerfile} lacks the revision OCI label`);
}

const composePath = resolveFrom(repoRoot, metadata.compose);
const compose = readFileSync(composePath, "utf8");
check(compose.includes(`version: "${metadata.version}"`), `${metadata.compose} does not declare release version ${metadata.version}`);
check(!/^\s+build:/m.test(compose), `${metadata.compose} must not build images from source`);
check(!compose.includes(":latest"), `${metadata.compose} must not reference latest`);
check(compose.includes(`${metadata.images.web}@\${ODOVI_WEB_DIGEST:`), `${metadata.compose} does not pin the web repository by digest`);
check(compose.includes(`${metadata.images.worker}@\${ODOVI_WORKER_DIGEST:`), `${metadata.compose} does not pin the worker repository by digest`);

const changelog = readFileSync(resolveFrom(repoRoot, metadata.changelog), "utf8");
const releaseHeading = `## [${metadata.version}] - `;
check(changelog.split(/\r?\n/).some((line) => line.startsWith(releaseHeading) &&
  /^(?:Unreleased|\d{4}-\d{2}-\d{2})$/.test(line.slice(releaseHeading.length))),
  `${metadata.changelog} lacks the ${metadata.version} release section`);

const releaseNotes = readFileSync(resolveFrom(repoRoot, metadata.releaseNotes), "utf8");
check(releaseNotes.includes(`Release version: \`${metadata.version}\``), `${metadata.releaseNotes} has no matching release-version marker`);
for (const architecture of metadata.architectures) {
  check(releaseNotes.includes(`\`${architecture}\``), `${metadata.releaseNotes} does not mention ${architecture}`);
}
for (const boundary of metadata.teslaMateRange.match(/\d+(?:\.\d+)+/g) ?? []) {
  check(releaseNotes.includes(boundary), `${metadata.releaseNotes} does not mention TeslaMate ${boundary}`);
}
for (const heading of ["Supported runtime", "Tested platforms", "Known limitations"]) {
  check(releaseNotes.includes(`## ${heading}`), `${metadata.releaseNotes} lacks the ${heading} section`);
}

if (failures.length > 0) {
  console.error(`Release consistency failed for ${relative(repoRoot, metadataPath)}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release consistency passed for ${metadata.version} (${metadata.candidate}).`);
}
