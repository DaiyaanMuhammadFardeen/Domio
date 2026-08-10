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

# Copy package manifests only (for `pnpm install` against the workspace).
COPY apps/api/package.json ./apps/api/
COPY packages/common/package.json ./packages/common/

# Optionally copy other package manifests if they exist.
# (Doing the global install before building the source code lets the
#  Docker layer cache the install step when only source code changes.)
RUN find . -path ./node_modules -prune -o -name "package.json" -print | xargs -I{} echo "PRESENT: {}"

# Install dependencies.
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source.
COPY apps/api ./apps/api
COPY packages/common ./packages/common

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
