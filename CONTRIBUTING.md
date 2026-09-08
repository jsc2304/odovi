# Contributing to Odovi

Odovi is a self-hosted Tesla trip archive based on TeslaMate data. Thank you for helping keep it useful, maintainable, and safe for self-hosted deployments.

## Contributions and licensing

Bug reports, feature proposals, reproducible test cases and documentation
feedback are welcome in German or English.

Code or other copyrightable material is accepted from external contributors
only after a separate written contributor
agreement has been completed with the maintainer. Opening a pull request does
not by itself transfer rights or grant permission to relicense a contribution.

Please open an issue before investing in a code contribution. Pull requests
without a confirmed contributor agreement may be reviewed for discussion, but
will not be merged. Do not submit employer-owned, client-owned or third-party
code unless you have documented authority to do so.

See [LICENSING.md](LICENSING.md) for the licenses that apply to Odovi.

## Development Setup

Odovi is a pnpm monorepo with a Next.js web app, a Node worker, shared packages, and PostgreSQL.

```bash
pnpm install
pnpm dev:db
pnpm db:seed:teslamate
DATABASE_URL=postgres://odovi:odovi@localhost:5432/odovi pnpm db:migrate
pnpm --filter @odovi/worker dev
pnpm --filter @odovi/web dev
```

The worker needs `DATABASE_URL` and `TESLAMATE_DATABASE_URL`; see
`.env.development.example` for the expected local values. The web app runs at
`http://localhost:3000` by default.

## File placement

Use the existing owner of a feature or workflow when adding files:

| Location | Responsibility |
| --- | --- |
| `apps/` | Deployable applications: web and worker. |
| `packages/` | Shared application logic, database schema and runtime configuration. |
| `acceptance/` | Release-stack browser checks and rename/upgrade scenarios. |
| `tests/` | Shared test inputs, currently runtime-configuration fixtures. |
| `dev/` | Local development tools and the synthetic-data fixture workspace. |
| `deploy/` | Installation integrations, currently the TeslaMate Compose example. |
| `release/` | Versioned release manifests and their matching Compose files. |
| `scripts/` | Repository checks, release tooling and maintenance commands. |
| `security/` | Reviewed dependency-audit exceptions. |
| `docs/` | Reviewed public usage, operations and architecture documentation. |
| `.github/` and `.githooks/` | Automation, contribution templates and local Git checks. |

Keep module-specific tests beside the code they exercise, including tests of
repository scripts. Extend the existing acceptance harness for release-wide
scenarios; avoid creating a second harness in `tests/`.

Keep root entry points such as the README, license notices, workspace
configuration and default Compose files in place. Add a new top-level
directory only when no existing location owns the responsibility, and explain
that choice in the change. Update this map when responsibilities change.

Treat directory moves as functional changes: check workspace membership,
Docker build contexts, Compose-relative paths, script entry points, workflow
filters, documentation links and publication checks together. Preserve
published release paths and verify affected commands before merging.

## Checks

Run the repository checks before opening a pull request:

```bash
pnpm test
pnpm lint
pnpm publication:check
```

`pnpm lint` is the repository typecheck/lint entry point. It first builds the shared package types, then runs all package checks. For the web app TypeScript compiler specifically, run:

```bash
pnpm --filter @odovi/web exec tsc --noEmit
```

## Pull Requests

Keep pull requests small and focused. Describe what changed, why it changed, and how you tested it.

Pull request descriptions and discussion are welcome in English or German. If
the change includes copyrightable material, state which contributor agreement
the maintainer confirmed before requesting merge.
