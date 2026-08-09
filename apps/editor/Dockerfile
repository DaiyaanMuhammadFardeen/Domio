# Editor — multi-stage Next.js build (Phase 22-beta final).
#
# Stage 1: builder — `pnpm install` + `pnpm --filter @domio/editor build`.
# Stage 2: runtime — slim Node 22 image that runs `next start`.
#
# Mirrors apps/dashboard/Dockerfile so both apps have identical
# build semantics and ship from the same base image.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy every workspace's package.json so pnpm can resolve transitive
# workspace deps regardless of what the editor pulls in.
COPY apps/editor/package.json ./apps/editor/
COPY packages packages

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the editor and its workspace dependencies.
# .dockerignore excludes node_modules, .turbo, dist, coverage.
COPY apps/editor ./apps/editor
COPY packages packages
COPY tsconfig.base.json ./tsconfig.base.json

# Build @domio/web-security first — its package.json `main` points at
# dist/index.js so node ESM (used to load next.config.mjs) can resolve
# it without needing to strip TypeScript.
RUN pnpm --filter @domio/web-security build

# Build.
RUN pnpm --filter @domio/editor build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Non-root user.
RUN groupadd --system domio && useradd --system --gid domio domio

# Copy the production build artifacts.
COPY --from=builder /app/apps/editor/.next ./apps/editor/.next
COPY --from=builder /app/apps/editor/package.json ./apps/editor/package.json
COPY --from=builder /app/apps/editor/next.config.mjs ./apps/editor/next.config.mjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/editor

USER domio

ENV NODE_ENV=production \
    EDITOR_PORT=3100 \
    HOST=0.0.0.0 \
    REALTIME_GATEWAY_URL=ws://realtime-gateway:8082 \
    AUDIENCE_WS_URL=ws://audience:8082 \
    NEXT_PUBLIC_API_BASE_URL=http://api:8080

EXPOSE 3100

# Liveness — Next.js root page.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/ >/dev/null 2>&1 || exit 1

CMD ["node_modules/.bin/next", "start", "-p", "3100"]
