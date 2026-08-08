# Domio service Dockerfile — multi-stage build for TS service packages.
#
# Used by all Phase 15 TS services that don't yet ship a standalone HTTP
# server (the runtime wraps them through apps/api). When a service gets
# a server.ts entrypoint, drop the shared wrapper at build time.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests first for caching.
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests so pnpm install can resolve workspace deps.
COPY services/presenter-session/package.json ./services/presenter-session/
COPY services/phone-pairing/package.json ./services/phone-pairing/
COPY services/thumbnail/package.json ./services/thumbnail/
COPY packages/audit-ts/package.json ./packages/audit-ts/

# Install dependencies (workspace-aware).
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the service this image builds.
COPY services ./services
COPY packages ./packages

# Build the service. The image is parameterized via build-arg.
ARG SERVICE_DIR=services/presenter-session
RUN pnpm --filter @domio/${SERVICE_DIR##services/} build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

RUN groupadd --system domio && useradd --system --gid domio domio

ARG SERVICE_DIR=services/presenter-session

COPY --from=builder /app/${SERVICE_DIR}/dist ./${SERVICE_DIR}/dist
COPY --from=builder /app/${SERVICE_DIR}/node_modules ./${SERVICE_DIR}/node_modules
COPY --from=builder /app/${SERVICE_DIR}/package.json ./${SERVICE_DIR}/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /app/${SERVICE_DIR}
USER domio

ENV NODE_ENV=production

# Each TS service owns its HTTP port; the build-arg SERVICE_PORT sets the
# exposed port.
ARG SERVICE_PORT=3000
ENV PORT=${SERVICE_PORT}
EXPOSE ${SERVICE_PORT}

CMD ["sh", "-c", "echo 'Service library — import via apps/api at runtime.' && node dist/index.js"]
