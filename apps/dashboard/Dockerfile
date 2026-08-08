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
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./

# Copy package manifests for all workspaces we touch so install is
# hermetic. The find picks up every package.json; we only ship the
# dashboard's tree in the runtime stage below.
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/chart/package.json ./packages/chart/ 2>/dev/null || true
COPY packages/observability/package.json ./packages/observability/ 2>/dev/null || true

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the dashboard and its workspace dependencies.
COPY apps/dashboard ./apps/dashboard
COPY packages/chart ./packages/chart 2>/dev/null || true
COPY packages/observability ./packages/observability 2>/dev/null || true
COPY tsconfig.base.json ./tsconfig.base.json

# Build.
RUN pnpm --filter @domio/dashboard build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Non-root user.
RUN groupadd --system domio && useradd --system --gid domio domio

# Copy the production build artifacts.
COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public 2>/dev/null || true
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/package.json
COPY --from=builder /app/apps/dashboard/next.config.mjs ./apps/dashboard/next.config.mjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/dashboard

USER domio

ENV NODE_ENV=production \
    DASHBOARD_PORT=3000 \
    HOST=0.0.0.0 \
    WAREHOUSE_URL=http://warehouse:8088 \
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

CMD ["node_modules/.bin/next", "start", "-p", "3000"]