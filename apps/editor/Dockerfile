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
# The editor imports types from @domio/audience-service (used by
# WidgetConfigPanel). Copy the package manifest + source so pnpm can
# link it as a workspace dep.
COPY services/audience/package.json ./services/audience/

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source for the editor and its workspace dependencies.
# .dockerignore excludes node_modules, .turbo, dist, coverage.
COPY apps/editor ./apps/editor
COPY packages packages
COPY tsconfig.base.json ./tsconfig.base.json
# @domio/audience-service source (resolved through @domio/audience-service
# path mapping in apps/editor/tsconfig.json).
COPY services/audience ./services/audience
# Bundled example deck used by the boot page; resolved relative to
# apps/editor/src/lib/, which means next build expects it at
# /app/fixtures/example-deck.json in this stage.
COPY fixtures ./fixtures

# Build @domio/web-security first — its package.json `main` points at
# dist/index.js so node ESM (used to load next.config.mjs) can resolve
# it without needing to strip TypeScript.
RUN pnpm --filter @domio/web-security build

# Build.
RUN pnpm --filter @domio/editor build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Install pnpm + enable Corepack so `pnpm exec next start` can resolve
# the `next` binary through pnpm's symlink layout (pnpm's default
# `isolated` linker doesn't hoist dep binaries to /app/node_modules/.bin/,
# so calling `/app/node_modules/.bin/next` directly fails).
# `COREPACK_INTEGRITY_KEYS=0` skips corepack's signature check — the
# keys shipped in the base image don't include pnpm@9.12.3's signing
# key id, so an unverified shim is the only way to install pnpm.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Non-root user. Ensure /app is owned by `domio` so the runtime can
# write its HOME cache (`/app/.cache/node/corepack/v1`) for pnpm exec.
RUN groupadd --system domio && useradd --system --gid domio domio \
 && chown -R domio:domio /app

# Copy the production build artifacts.
# We deliberately do NOT copy the root package.json — that one only
# has devDeps, and a `pnpm install --prod` driven by it would install
# nothing. We use the editor's package.json as `/app/package.json`
# instead, since `next`, `react`, etc. are prod deps declared there.
COPY --from=builder /app/apps/editor/.next ./apps/editor/.next
COPY --from=builder /app/apps/editor/package.json ./apps/editor/package.json
COPY --from=builder /app/apps/editor/next.config.mjs ./apps/editor/next.config.mjs
COPY --from=builder /app/apps/editor/package.json ./package.json
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/audience ./services/audience
# (We do NOT copy /app/node_modules from the builder — its isolated
# linker layout is incompatible with Node ESM resolution from
# /app/apps/editor. The `pnpm install --prod --no-lockfile
# --config.node-linker=hoisted` step below builds a fresh, hoisted
# node_modules where `next` is at /app/node_modules/next and
# `next/dist/bin/next` resolves directly.)

# Hoisted prod install so /app/node_modules/next, /app/node_modules/react,
# etc. exist at the top level. Without this, the `next` bin script's
# `require.resolve('next/dist/bin/next')` fails because pnpm's
# `isolated` linker only puts the `next` package under
# /app/node_modules/.pnpm/next@*/node_modules/next/.
RUN rm -rf /app/node_modules
RUN pnpm install --prod --no-lockfile --ignore-scripts \
      --config.node-linker=hoisted

WORKDIR /app/apps/editor

# Ensure workspace context (pnpm needs to find pnpm-workspace.yaml +
# pnpm-lock.yaml so it can resolve `next` and other workspace deps).
ENV npm_config_recursive=true

# `HOME` is needed by corepack (and other Node tooling) to write its
# cache. Without it, the runtime user can't create `$HOME/.cache/`
# and `pnpm exec` fails with EACCES. Set HOME FIRST (before USER) so
# the env is inherited by the next-user shell.
ENV HOME=/app

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

CMD ["pnpm", "exec", "next", "start", "-p", "3100"]
