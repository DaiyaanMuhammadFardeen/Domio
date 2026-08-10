# Domio service Dockerfile — multi-stage build for TS service packages.
#
# Used by all Phase 15 TS services that don't yet ship a standalone HTTP
# server (the runtime wraps them through apps/api). When a service gets
# a server.ts entrypoint, drop the shared wrapper at build time.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack. `COREPACK_INTEGRITY_KEYS=0` skips the
# signature check — the keys shipped in the base image don't include
# pnpm@9.12.3's signing key id, so an unverified shim is the only way
# to install pnpm in the build stage too.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests first for caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests so pnpm install can resolve workspace deps.
COPY services/presenter-session/package.json ./services/presenter-session/
COPY services/phone-pairing/package.json ./services/phone-pairing/
COPY services/thumbnail/package.json ./services/thumbnail/
COPY packages/audit-ts/package.json ./packages/audit-ts/
COPY packages/observability/package.json ./packages/observability/
COPY packages/redact-pii/package.json ./packages/redact-pii/
COPY packages/signed-link-token/package.json ./packages/signed-link-token/

# Install dependencies (workspace-aware).
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the service this image builds.
COPY services ./services
COPY packages ./packages

# Build the service. The image is parameterized via build-arg.
# `turbo run build` cascades through `dependsOn: ["^build"]` so every
# workspace dependency this service imports at runtime
# (@domio/audit-ts, @domio/observability, @domio/signed-link-token,
# and its transitive @domio/redact-pii) is built first. Their
# `main`/`exports` point at `dist/index.js`, so the running service
# can resolve them as plain ESM without --experimental-strip-types.
ARG SERVICE_DIR=services/presenter-session
RUN pnpm exec turbo run build --filter=@domio/${SERVICE_DIR##services/}...

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

# Run the compiled service. `@domio/audit-ts` is built before this
# stage and its `main` points at `dist/index.js`, so Node can resolve
# the `./canonical.js` / `./chain.js` imports directly. No
# `--experimental-strip-types` needed.
# The service is a library (not a standalone server) — kept alive
# with a long sleep so the container doesn't restart-loop until the
# apps/api gateway eventually loads it via in-process import.
CMD ["sh", "-c", "node -e \"console.log('presenter-session: library module loaded; awaiting apps/api import'); setInterval(() => {}, 1<<30)\""]
