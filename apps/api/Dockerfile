# Domio API — multi-stage build.
#
# Stage 1: build.
# Stage 2: runtime.
# Stage 3: distroless for production.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests first for caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests for every workspace dependency the API imports.
# Doing this list-by-list keeps the docker layer cache stable when only
# application source changes.
COPY packages/common/package.json ./packages/common/
COPY packages/observability/package.json ./packages/observability/
COPY packages/presenter-session/package.json ./packages/presenter-session/
COPY packages/permission-engine/package.json ./packages/permission-engine/
COPY packages/annotation-engine/package.json ./packages/annotation-engine/
COPY packages/calendar-service/package.json ./packages/calendar-service/
COPY packages/collab-service/package.json ./packages/collab-service/
COPY packages/expiry-service/package.json ./packages/expiry-service/
COPY packages/guests-service/package.json ./packages/guests-service/
COPY packages/library-service/package.json ./packages/library-service/
COPY packages/meeting-integration-service/package.json ./packages/meeting-integration-service/
COPY packages/merge-request-service/package.json ./packages/merge-request-service/
COPY packages/suggestions-service/package.json ./packages/suggestions-service/
COPY packages/task-manager-service/package.json ./packages/task-manager-service/
COPY apps/api/package.json ./apps/api/

# Optionally copy other package manifests if they exist.
# (Doing the global install before building the source code lets the
#  Docker layer cache the install step when only source code changes.)
RUN find . -path ./node_modules -prune -o -name "package.json" -print | xargs -I{} echo "PRESENT: {}"

# Install dependencies.
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the API and every workspace package it imports.
COPY apps/api ./apps/api
COPY packages/common ./packages/common
COPY packages/observability ./packages/observability
COPY packages/presenter-session ./packages/presenter-session
COPY packages/permission-engine ./packages/permission-engine
COPY packages/annotation-engine ./packages/annotation-engine
COPY packages/calendar-service ./packages/calendar-service
COPY packages/collab-service ./packages/collab-service
COPY packages/expiry-service ./packages/expiry-service
COPY packages/guests-service ./packages/guests-service
COPY packages/library-service ./packages/library-service
COPY packages/meeting-integration-service ./packages/meeting-integration-service
COPY packages/merge-request-service ./packages/merge-request-service
COPY packages/suggestions-service ./packages/suggestions-service
COPY packages/task-manager-service ./packages/task-manager-service

# Build the API.
RUN pnpm --filter @domio/api build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Run as non-root.
RUN groupadd --system domio && useradd --system --gid domio domio

# Copy the built artifact + locked node_modules.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/common ./packages/common
COPY --from=builder /app/packages/observability ./packages/observability
COPY --from=builder /app/packages/presenter-session ./packages/presenter-session
COPY --from=builder /app/packages/permission-engine ./packages/permission-engine
COPY --from=builder /app/packages/annotation-engine ./packages/annotation-engine
COPY --from=builder /app/packages/calendar-service ./packages/calendar-service
COPY --from=builder /app/packages/collab-service ./packages/collab-service
COPY --from=builder /app/packages/expiry-service ./packages/expiry-service
COPY --from=builder /app/packages/guests-service ./packages/guests-service
COPY --from=builder /app/packages/library-service ./packages/library-service
COPY --from=builder /app/packages/meeting-integration-service ./packages/meeting-integration-service
COPY --from=builder /app/packages/merge-request-service ./packages/merge-request-service
COPY --from=builder /app/packages/suggestions-service ./packages/suggestions-service
COPY --from=builder /app/packages/task-manager-service ./packages/task-manager-service
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Set working directory to the app.
WORKDIR /app/apps/api

USER domio

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080

# Healthcheck hits our /healthz endpoint.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "--experimental-strip-types", "dist/server.js"]
