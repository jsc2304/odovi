#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { assertCommit, verifyCandidateRun } from "./lib/release.mjs";

const { GITHUB_REPOSITORY: repository, GITHUB_SHA: promotionCommit,
  CANDIDATE_RUN_ID: runId, CANDIDATE_RUN_ATTEMPT: attempt, GITHUB_OUTPUT: output } = process.env;
if (repository !== "jsc2304/odovi" || !/^[1-9][0-9]*$/.test(runId ?? "") ||
    !/^[1-9][0-9]*$/.test(attempt ?? "") || !output) {
  throw new Error("expected repository, numeric candidate run coordinates and GITHUB_OUTPUT");
}
assertCommit(promotionCommit);
const api = (path) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}${path}`], { encoding: "utf8" }));
const sourceCommit = verifyCandidateRun(
  api(`/actions/runs/${runId}/attempts/${attempt}`),
  api("/actions/workflows/release.yml"),
  api(""), runId, attempt,
);
// The API's branch label alone does not establish membership in trusted history.
execFileSync("git", ["merge-base", "--is-ancestor", sourceCommit, promotionCommit]);
appendFileSync(output, `source_commit=${sourceCommit}\nartifact_name=release-candidate-${sourceCommit}-${attempt}\n`);
