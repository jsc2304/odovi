# Odovi development

This is the public self-hosted application repository. Use README.md for
implemented features and setup, CONTRIBUTING.md for development checks,
docs/runtime-configuration.md for configuration, and
docs/rename-to-odovi.md for upgrades and recovery.

## Publication boundary

Public changes contain product code, tests, licensing notices and reviewed
user/developer documentation. Keep business plans, unpublished website source,
commercial research, internal discussions and operational handovers in the
local `.private/` directory or another explicitly private system. This applies
to every path, commit message, issue, pull request, log and uploaded artifact.
Git ignore rules do not make already-tracked data private.

Before committing, run `pnpm publication:check`. Before pushing, also run
`node scripts/check-publication.mjs --history HEAD`. Install the local Git
hooks with `git config core.hooksPath .githooks`; CI is a second check after
publication and cannot replace the pre-push review. Review meaning as well as
the automated path/pattern checks; neither checks every possible disclosure.

## Working rules

- Inspect branch and dirty files before editing. Use a `codex/` feature branch
  and preserve unrelated or uncommitted work.
- Before adding or moving files, read
  [File placement](CONTRIBUTING.md#file-placement).
- Create task worktrees outside this checkout, under
  `../agent-worktrees/odovi/<task>/`. Keep one owner per worktree; preserve
  existing checkouts used by running processes.
- Keep public issue reports factual and limited to reproducible product
  behavior. Internal planning belongs in the private workspace.
- Preserve the read-only TeslaMate boundary and explicit provider activation.
- Run tests, lint/typecheck and build for changed code. Verify database changes
  against a backup/restore path before deploying.
- Treat Git publication, container release, deployment and paid operations as
  distinct actions requiring the user's authorization.
- Use an explicitly named Compose project and preserve existing runtime data,
  credentials and unrelated services during deployment.
