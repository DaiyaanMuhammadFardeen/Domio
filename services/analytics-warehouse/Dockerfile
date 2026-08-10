# Analytics-warehouse Dockerfile — same pattern as event-ingest.

FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY services/analytics-warehouse/package.json ./services/analytics-warehouse/
COPY packages/observability/package.json ./packages/observability/
COPY packages/redact-pii/package.json ./packages/redact-pii/

RUN pnpm install --frozen-lockfile || pnpm install

COPY services/analytics-warehouse ./services/analytics-warehouse
COPY packages/observability ./packages/observability
COPY packages/redact-pii ./packages/redact-pii

WORKDIR /app/services/analytics-warehouse
# `turbo run build` cascades through `dependsOn: ["^build"]` so the
# workspace dep @domio/observability (and its transitive
# @domio/redact-pii) is built before this service. Their `main`/
# `exports` should point at `dist/index.js` so this compiled service
# can import them as plain ESM.
RUN pnpm exec turbo run build --filter=@domio/analytics-warehouse...

FROM node:22.11.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# pnpm's default `isolated` linker doesn't hoist deps to
# /app/node_modules/<name>, so Node ESM resolution from /app/dist/main.js
# fails with ERR_MODULE_NOT_FOUND for `hono` etc. Re-install with a
# hoisted layout at runtime.
# `COREPACK_INTEGRITY_KEYS=0` skips corepack's signature check — the
# keys shipped in the base image don't include pnpm@9.12.3's signing
# key id, so an unverified shim is the only way to install pnpm.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy built artifacts + lockfile + workspace manifests. We
# deliberately do NOT copy the root package.json — that one only has
# devDeps, and a `pnpm install --prod` driven by it would install
# nothing. The service's package.json declares `hono`, `pg`, etc. as
# prod deps, which is what we need hoisted into `/app/node_modules/`.
COPY --from=builder /app/services/analytics-warehouse/dist ./dist
COPY --from=builder /app/services/analytics-warehouse/package.json ./package.json
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
# Workspace packages (observability, redact-pii) need their compiled
# `dist/` on the runtime image so pnpm can symlink them and the
# compiled service can resolve `import "@domio/observability"` etc.
COPY --from=builder /app/packages ./packages
# (We do not copy /app/node_modules from the builder — its isolated
# linker layout is incompatible with Node ESM resolution from
# /app/dist/*.js. The `pnpm install --prod --no-lockfile
# --config.node-linker=hoisted` step below builds a fresh, hoisted
# node_modules.)

# Hoisted prod install so /app/node_modules/hono etc. exists.
# `--no-lockfile` because `/app/package.json` is the service's
# package.json (the root one only has devDeps and would install
# nothing), and the lockfile was generated against the root
# package.json with workspace deps from every monorepo package.
# Disabling lockfile IO is safe because the lockfile was already
# validated at build time.
# Wipe the builder's node_modules first — pnpm detects the existing
# tree from the isolated linker install and refuses to reinstall
# against the new (service-as-root) package.json unless it's gone.
RUN rm -rf /app/node_modules
RUN pnpm install --prod --no-lockfile --ignore-scripts \
      --config.node-linker=hoisted

RUN useradd --system --uid 1001 domio && chown -R domio:domio /app
USER domio

EXPOSE 3030

CMD ["node", "dist/main.js"]
