# Analytics-warehouse Dockerfile — same pattern as event-ingest.

FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY services/analytics-warehouse/package.json ./services/analytics-warehouse/
COPY packages/observability/package.json ./packages/observability/

RUN pnpm install --frozen-lockfile || pnpm install

COPY services/analytics-warehouse ./services/analytics-warehouse
COPY packages/observability ./packages/observability

WORKDIR /app/services/analytics-warehouse
RUN pnpm build

FROM node:22.11.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/services/analytics-warehouse/dist ./dist
COPY --from=builder /app/services/analytics-warehouse/package.json ./package.json
COPY --from=builder /app/services/analytics-warehouse/node_modules ./node_modules

RUN useradd --system --uid 1001 domio && chown -R domio:domio /app
USER domio

EXPOSE 3030

CMD ["node", "dist/main.js"]
