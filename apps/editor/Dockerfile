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
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./

# Copy package manifests for every workspace the editor touches.
# The `2>/dev/null || true` keeps the COPY resilient if a workspace
# is missing in a sparse-checkout / monorepo-split setup.
COPY apps/editor/package.json ./apps/editor/
COPY packages/api-client/package.json ./packages/api-client/ 2>/dev/null || true
COPY packages/canvas/package.json ./packages/canvas/ 2>/dev/null || true
COPY packages/common/package.json ./packages/common/ 2>/dev/null || true
COPY packages/components/package.json ./packages/components/ 2>/dev/null || true
COPY packages/deep-link/package.json ./packages/deep-link/ 2>/dev/null || true
COPY packages/i18n/package.json ./packages/i18n/ 2>/dev/null || true
COPY packages/observability/package.json ./packages/observability/ 2>/dev/null || true
COPY packages/prototype-runtime/package.json ./packages/prototype-runtime/ 2>/dev/null || true
COPY packages/recording/package.json ./packages/recording/ 2>/dev/null || true
COPY packages/recording-extensions/package.json ./packages/recording-extensions/ 2>/dev/null || true
COPY packages/object-store/package.json ./packages/object-store/ 2>/dev/null || true
COPY packages/schema/package.json ./packages/schema/ 2>/dev/null || true
COPY packages/schema-prop/package.json ./packages/schema-prop/ 2>/dev/null || true
COPY packages/sdk/package.json ./packages/sdk/ 2>/dev/null || true
COPY packages/yjs-shared/package.json ./packages/yjs-shared/ 2>/dev/null || true

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the editor and its workspace dependencies.
COPY apps/editor ./apps/editor
COPY packages/api-client ./packages/api-client 2>/dev/null || true
COPY packages/canvas ./packages/canvas 2>/dev/null || true
COPY packages/common ./packages/common 2>/dev/null || true
COPY packages/components ./packages/components 2>/dev/null || true
COPY packages/deep-link ./packages/deep-link 2>/dev/null || true
COPY packages/i18n ./packages/i18n 2>/dev/null || true
COPY packages/observability ./packages/observability 2>/dev/null || true
COPY packages/prototype-runtime ./packages/prototype-runtime 2>/dev/null || true
COPY packages/recording ./packages/recording 2>/dev/null || true
COPY packages/recording-extensions ./packages/recording-extensions 2>/dev/null || true
COPY packages/object-store ./packages/object-store 2>/dev/null || true
COPY packages/schema ./packages/schema 2>/dev/null || true
COPY packages/schema-prop ./packages/schema-prop 2>/dev/null || true
COPY packages/sdk ./packages/sdk 2>/dev/null || true
COPY packages/yjs-shared ./packages/yjs-shared 2>/dev/null || true
COPY tsconfig.base.json ./tsconfig.base.json

# Build.
RUN pnpm --filter @domio/editor build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Non-root user.
RUN groupadd --system domio && useradd --system --gid domio domio

# Copy the production build artifacts.
COPY --from=builder /app/apps/editor/.next ./apps/editor/.next
COPY --from=builder /app/apps/editor/public ./apps/editor/public 2>/dev/null || true
COPY --from=builder /app/apps/editor/package.json ./apps/editor/package.json
COPY --from=builder /app/apps/editor/next.config.mjs ./apps/editor/next.config.mjs 2>/dev/null || true
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
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
