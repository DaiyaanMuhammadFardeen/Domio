# Event-ingest Dockerfile — TS multi-stage build.
#
# Stage 1: install pnpm workspace deps and compile TypeScript.
# Stage 2: minimal node:alpine image with only the compiled JS +
# production deps.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack.
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace manifests first for caching.
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests so pnpm install can resolve workspace deps.
COPY services/event-ingest/package.json ./services/event-ingest/
COPY packages/observability/package.json ./packages/observability/

# Install dependencies.
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the service.
COPY services/event-ingest ./services/event-ingest
COPY packages/observability ./packages/observability

# Build.
WORKDIR /app/services/event-ingest
RUN pnpm build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Copy built artifacts + node_modules + workspace package.
COPY --from=builder /app/services/event-ingest/dist ./dist
COPY --from=builder /app/services/event-ingest/package.json ./package.json
COPY --from=builder /app/services/event-ingest/bin ./bin
COPY --from=builder /app/services/event-ingest/node_modules ./node_modules

# Run as non-root.
RUN useradd --system --uid 1001 domio && chown -R domio:domio /app
USER domio

EXPOSE 3020

CMD ["node", "dist/main.js"]
