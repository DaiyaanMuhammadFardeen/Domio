# Domio presenter app (Phase 15 W2) — Next.js production build.

# ---------- Builder ----------
FROM node:22.11.0-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Workspace manifests + service package manifests.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY apps/presenter/package.json ./apps/presenter/

# Workspace deps the presenter app uses.
COPY services/presenter-session/package.json ./services/presenter-session/
COPY services/phone-pairing/package.json ./services/phone-pairing/
COPY services/thumbnail/package.json ./services/thumbnail/
COPY services/annotation-engine/package.json ./services/annotation-engine/
COPY packages/audit-ts/package.json ./packages/audit-ts/
COPY packages/signed-link-token/package.json ./packages/signed-link-token/

RUN pnpm install --frozen-lockfile || pnpm install

# Copy source.
COPY apps/presenter ./apps/presenter
COPY services/presenter-session ./services/presenter-session
COPY services/phone-pairing ./services/phone-pairing
COPY services/thumbnail ./services/thumbnail
COPY services/annotation-engine ./services/annotation-engine
COPY packages/audit-ts ./packages/audit-ts
COPY packages/signed-link-token ./packages/signed-link-token

# Build the Next.js app.
RUN pnpm --filter @domio/presenter build

# ---------- Runtime ----------
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

# Install pnpm so `pnpm exec next start` can resolve `next` through
# pnpm's symlink layout.
# `COREPACK_INTEGRITY_KEYS=0` skips corepack's signature check — the
# keys shipped in the base image don't include pnpm@9.12.3's signing
# key id, so an unverified shim is the only way to install pnpm.
ENV COREPACK_INTEGRITY_KEYS=0
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

RUN groupadd --system domio && useradd --system --gid domio domio \
 && chown -R domio:domio /app

COPY --from=builder /app/apps/presenter/.next ./apps/presenter/.next
COPY --from=builder /app/apps/presenter/public ./apps/presenter/public
COPY --from=builder /app/apps/presenter/package.json ./apps/presenter/package.json
COPY --from=builder /app/apps/presenter/next.config.* ./apps/presenter/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/presenter/node_modules ./apps/presenter/node_modules
COPY --from=builder /app/services ./services
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /app/apps/presenter

# `HOME` is needed by corepack (and other Node tooling) to write its
# cache. Without it, the runtime user can't create `$HOME/.cache/`
# and `pnpm exec` fails with EACCES. Set HOME FIRST (before USER) so
# the env is inherited by the next-user shell.
ENV HOME=/app \
    NODE_ENV=production \
    PORT=3002 \
    HOST=0.0.0.0

USER domio

EXPOSE 3002

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002 || exit 1

CMD ["pnpm", "exec", "next", "start", "-p", "3002"]