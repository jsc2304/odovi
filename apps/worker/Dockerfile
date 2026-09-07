# syntax=docker/dockerfile:1

# Odovi worker — sync loop + one-shot migration runner.
# Multi-stage, pnpm workspace-aware build. linux/arm64-compatible (Raspberry Pi).

ARG NODE_IMAGE=node:22-bookworm-slim
ARG ODOVI_VERSION=0.3.0
ARG ODOVI_COMMIT_SHA=dev

# ---- base: corepack/pnpm ----------------------------------------------
FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ---- deps: install full workspace deps (needed to build) --------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/runtime-config/package.json packages/runtime-config/package.json
COPY apps/worker/package.json apps/worker/package.json
# dev/fixtures is a workspace member per pnpm-workspace.yaml; pnpm needs its
# manifest present to resolve the lockfile even though nothing here installs it.
COPY dev/fixtures/package.json dev/fixtures/package.json
RUN pnpm install --frozen-lockfile --filter @odovi/worker... --filter @odovi/core --filter @odovi/db --filter @odovi/runtime-config

# ---- build: compile core, db, worker (tsc) -----------------------------
FROM deps AS build
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/runtime-config packages/runtime-config
COPY apps/worker apps/worker
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @odovi/core build \
 && pnpm --filter @odovi/db build \
 && pnpm --filter @odovi/runtime-config build \
 && pnpm --filter @odovi/worker build

# ---- prod-deps: pruned, production-only node_modules -------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/runtime-config/package.json packages/runtime-config/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY dev/fixtures/package.json dev/fixtures/package.json
RUN pnpm install --frozen-lockfile --prod --filter @odovi/worker... --filter @odovi/core --filter @odovi/db --filter @odovi/runtime-config
COPY scripts/collect-license-notices.mjs scripts/collect-license-notices.mjs
COPY security/license-texts security/license-texts
RUN node scripts/collect-license-notices.mjs apps/worker /repo/third-party-licenses

# ---- runtime -------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG ODOVI_VERSION
ARG ODOVI_COMMIT_SHA
ENV NODE_ENV=production
ENV ODOVI_VERSION=${ODOVI_VERSION}
ENV ODOVI_COMMIT_SHA=${ODOVI_COMMIT_SHA}
LABEL org.opencontainers.image.version=${ODOVI_VERSION}
LABEL org.opencontainers.image.revision=${ODOVI_COMMIT_SHA}
LABEL org.opencontainers.image.source=https://github.com/jsc2304/odovi
LABEL org.opencontainers.image.licenses=FSL-1.1-ALv2
WORKDIR /app

RUN groupadd --system --gid 1001 odovi \
 && useradd --system --uid 1001 --gid odovi odovi

# Pruned node_modules for the whole workspace. pnpm creates a node_modules
# symlink dir (-> .pnpm store) in the root AND in each workspace package that
# has direct deps — all of them are needed for Node's ESM resolution to find
# packages like drizzle-orm/postgres from apps/worker/dist/*.js.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/package.json ./package.json
COPY --from=prod-deps /repo/packages/core/package.json ./packages/core/package.json
COPY --from=prod-deps /repo/packages/db/package.json ./packages/db/package.json
COPY --from=prod-deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=prod-deps /repo/packages/runtime-config/package.json ./packages/runtime-config/package.json
COPY --from=prod-deps /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=prod-deps /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod-deps /repo/third-party-licenses ./third-party-licenses
COPY LICENSE LICENSING.md THIRD_PARTY_NOTICES.md TRADEMARKS.md ./

# Compiled output.
COPY --from=build /repo/packages/core/dist ./packages/core/dist
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/packages/runtime-config/dist ./packages/runtime-config/dist
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist

# Migrations folder, shipped alongside the worker so the `migrate` compose
# service (same image, different command) can run drizzle-orm's migrator
# without drizzle-kit or dev deps in the runtime image.
COPY packages/db/drizzle ./apps/worker/drizzle

WORKDIR /app/apps/worker
USER odovi

CMD ["node", "dist/index.js"]
