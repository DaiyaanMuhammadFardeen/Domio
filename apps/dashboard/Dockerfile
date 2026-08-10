# Dashboard — multi-stage Next.js build (Phase 17 final).
#
# Stage 1: builder — `pnpm install` + `pnpm --filter @domio/dashboard build`.
# Stage 2: runtime — slim Node 22 image that runs `next start`.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy every workspace's package.json so pnpm can resolve transitive
# workspace deps regardless of what the dashboard pulls in.
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages packages

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the dashboard and its workspace dependencies.
# .dockerignore excludes node_modules, .turbo, dist, coverage.
COPY apps/dashboard ./apps/dashboard
COPY packages packages
COPY tsconfig.base.json ./tsconfig.base.json

# Build @domio/web-security first — its package.json `main` points at
# dist/index.js so node ESM (used to load next.config.mjs) can resolve
# it without needing to strip TypeScript.
RUN pnpm --filter @domio/web-security build

# Build.
RUN pnpm --filter @domio/dashboard build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Install pnpm so `pnpm exec next start` can resolve the `next` binary
# through pnpm's symlink layout (pnpm's `isolated` linker doesn't hoist
# dep binaries to /app/node_modules/.bin/).
# `COREPACK_INTEGRITY_KEYS=0` skips corepack's signature check — the
# keys shipped in the base image don't include pnpm@9.12.3's signing
# key id, so an unverified shim is the only way to install pnpm.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Non-root user. Ensure /app is owned by `domio` so the runtime can
# write its HOME cache (`/app/.cache/node/corepack/v1`) for pnpm exec.
RUN groupadd --system domio && useradd --system --gid domio domio \
 && chown -R domio:domio /app

# Copy the production build artifacts.
# We deliberately do NOT copy the root package.json — that one only
# has devDeps, and a `pnpm install --prod` driven by it would install
# nothing. We use the dashboard's package.json as `/app/package.json`
# instead, since `next`, `react`, etc. are prod deps declared there.
COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/package.json
COPY --from=builder /app/apps/dashboard/next.config.mjs ./apps/dashboard/next.config.mjs
COPY --from=builder /app/apps/dashboard/package.json ./package.json
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages ./packages
# (We do NOT copy /app/node_modules from the builder — its isolated
# linker layout is incompatible with Node ESM resolution from
# /app/apps/dashboard. The `pnpm install --prod --no-lockfile
# --config.node-linker=hoisted` step below builds a fresh, hoisted
# node_modules where `next` is at /app/node_modules/next and
# `next/dist/bin/next` resolves directly.)

# Hoisted prod install so /app/node_modules/next, /app/node_modules/react,
# etc. exist at the top level. Without this, the `next` bin script's
# `require.resolve('next/dist/bin/next')` fails because pnpm's
# `isolated` linker only puts the `next` package under
# /app/node_modules/.pnpm/next@*/node_modules/next/.
RUN rm -rf /app/node_modules
RUN pnpm install --prod --no-lockfile --ignore-scripts \
      --config.node-linker=hoisted

WORKDIR /app/apps/dashboard

# `HOME` is needed by corepack (and other Node tooling) to write its
# cache. Without it, the runtime user can't create `$HOME/.cache/`
# and `pnpm exec` fails with EACCES. Set HOME FIRST (before USER) so
# the env is inherited by the next-user shell.
ENV HOME=/app

USER domio

ENV NODE_ENV=production \
    DASHBOARD_PORT=3000 \
    HOST=0.0.0.0 \
    # In docker-compose the warehouse is the
    # `analytics-warehouse` service listening on :3030.
    WAREHOUSE_URL=http://analytics-warehouse:3030 \
    AB_ASSIGNMENT_URL=http://ab-assignment:8090 \
    AB_MEASUREMENT_URL=http://ab-measurement:8091 \
    AB_STATISTICS_URL=http://ab-statistics:8092 \
    TEAM_ANALYTICS_URL=http://team-analytics:8093 \
    LIVE_ANALYTICS_URL=http://live-analytics:8094 \
    CRM_SYNC_URL=http://crm-sync:8095 \
    BENCHMARK_URL=http://benchmark:8096

EXPOSE 3000

# Liveness — Next.js exposes /api/graphql as a 200/400 response.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/overview >/dev/null 2>&1 || exit 1

CMD ["pnpm", "exec", "next", "start", "-p", "3000"]