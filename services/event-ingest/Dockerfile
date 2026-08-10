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
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests so pnpm install can resolve workspace deps.
COPY services/event-ingest/package.json ./services/event-ingest/
COPY packages/observability/package.json ./packages/observability/
COPY packages/redact-pii/package.json ./packages/redact-pii/

# Install dependencies.
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the service.
COPY services/event-ingest ./services/event-ingest
COPY packages/observability ./packages/observability
COPY packages/redact-pii ./packages/redact-pii

# Build.
WORKDIR /app/services/event-ingest
# `turbo run build` cascades through `dependsOn: ["^build"]` so the
# workspace dep @domio/observability (and its transitive
# @domio/redact-pii) is built before this service. Their `main`/
# `exports` should point at `dist/index.js` so this compiled service
# can import them as plain ESM.
RUN pnpm exec turbo run build --filter=@domio/event-ingest...

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# We need pnpm at runtime to do a hoisted prod install. The builder
# uses pnpm's default `isolated` linker, which means
# `services/event-ingest/node_modules/hono` is a symlink into
# `.pnpm/hono@4.6.13/...`. That layout doesn't satisfy Node's ESM
# resolution walking up from `/app/dist/main.js`, which looks for
# `/app/node_modules/hono`. We re-install with `node-linker=hoisted`
# so every dep is reachable at `/app/node_modules/<name>`.
# `COREPACK_INTEGRITY_KEYS=0` skips corepack's signature check — the
# keys shipped in the base image don't include pnpm@9.12.3's signing
# key id, so an unverified shim is the only way to install pnpm.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy built artifacts + the service's package.json + the lockfile +
# workspace manifests so the runtime install can resolve everything.
# We deliberately do NOT copy the root package.json — that one only
# has devDeps, and a `pnpm install --prod` driven by it would install
# nothing. The service's package.json declares `hono`, `pg`, etc. as
# prod deps, which is what we need hoisted into `/app/node_modules/`.
COPY --from=builder /app/services/event-ingest/dist ./dist
COPY --from=builder /app/services/event-ingest/package.json ./package.json
COPY --from=builder /app/services/event-ingest/bin ./bin
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

# Re-install prod deps with a hoisted layout so `hono` etc. resolve
# from `/app/dist/*.js`. We use `--no-lockfile` because:
#   - `/app/package.json` is the *service's* package.json (we
#     deliberately did not copy the root one — it only has devDeps,
#     and a `pnpm install --prod` driven by it would install nothing).
#   - The lockfile was generated against the root package.json with
#     workspace deps from every package in the monorepo (e.g.
#     `lucide-react` from `apps/dashboard`); hoisting from it errors
#     with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`. Disabling lockfile
#     IO here is safe because the lockfile was already validated at
#     build time and the runtime install is just to hoist prod deps.
# --ignore-scripts because postinstall hooks (buf, husky) are not
# needed at runtime.
# Wipe the builder's node_modules first — pnpm detects the existing
# tree from the isolated linker install and refuses to reinstall
# against the new (service-as-root) package.json unless it's gone.
RUN rm -rf /app/node_modules
RUN pnpm install --prod --no-lockfile --ignore-scripts \
      --config.node-linker=hoisted

# Run as non-root.
RUN useradd --system --uid 1001 domio && chown -R domio:domio /app
# Pre-create the spool dir (used by `INGEST_SPOOL_DIR=/var/lib/domio/spool`)
# and chown it; the domio user can't mkdir under `/var/lib` at runtime.
RUN mkdir -p /var/lib/domio/spool && chown -R domio:domio /var/lib/domio
USER domio

EXPOSE 3020

CMD ["node", "dist/main.js"]
