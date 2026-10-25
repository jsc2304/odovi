#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { assertReleaseMetadata, verifyCandidateRecord } from "./lib/release.mjs";

const [metadataPath, candidatePath, repository, sourceCommit] = process.argv.slice(2);
if (!sourceCommit) throw new Error("usage: verify-release-candidate.mjs <metadata> <candidate> <repository> <authenticated-source-commit>");
const metadata = assertReleaseMetadata(JSON.parse(await readFile(metadataPath, "utf8")));
const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
verifyCandidateRecord(metadata, candidate, repository, sourceCommit);
console.log(`Candidate ${candidate.candidate} is accepted for stable promotion.`);
