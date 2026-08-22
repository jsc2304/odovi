# Contributing to Tripatlas

Tripatlas is a self-hosted Tesla trip archive based on TeslaMate data. Thank you for helping keep it useful, maintainable, and safe for self-hosted deployments.

## Contributions and licensing

Bug reports, feature proposals, reproducible test cases and documentation
feedback are welcome in German or English.

Tripatlas is currently protecting the option to offer both Fair Source and
commercial licenses. For that reason, code or other copyrightable material is
accepted from external contributors only after a separate written contributor
agreement has been completed with the maintainer. Opening a pull request does
not by itself transfer rights or grant permission to relicense a contribution.

Please open an issue before investing in a code contribution. Pull requests
without a confirmed contributor agreement may be reviewed for discussion, but
will not be merged. Do not submit employer-owned, client-owned or third-party
code unless you have documented authority to do so.

See [LICENSING.md](LICENSING.md) for the licenses that apply to Tripatlas.

## Development Setup

Tripatlas is a pnpm monorepo with a Next.js web app, a Node worker, shared packages, and PostgreSQL.

```bash
pnpm install
pnpm dev:db
pnpm db:seed:teslamate
DATABASE_URL=postgres://tripatlas:tripatlas@localhost:5432/tripatlas pnpm db:migrate
pnpm --filter @tripatlas/worker dev
pnpm --filter @tripatlas/web dev
```

The worker needs `DATABASE_URL` and `TESLAMATE_DATABASE_URL`; see `.env.example` for the expected local values. The web app runs at `http://localhost:3000` by default.

## Checks

Run the repository checks before opening a pull request:

```bash
pnpm test
pnpm lint
```

`pnpm lint` is the repository typecheck/lint entry point. It first builds the shared package types, then runs all package checks. For the web app TypeScript compiler specifically, run:

```bash
pnpm --filter @tripatlas/web exec tsc --noEmit
```

## Pull Requests

Keep pull requests small and focused. Describe what changed, why it changed, and how you tested it.

Pull request descriptions and discussion are welcome in English or German. If
the change includes copyrightable material, state which contributor agreement
the maintainer confirmed before requesting merge.
