---
title: Bangladesh Mirror Fallback Runbook
phase: 01
stream: E
audience: on-call engineers, developers in Bangladesh
last_reviewed: 2026-07-29
severity: P2 (downstream unavailable) / P3 (degraded performance)
tags: ["#mirror", "#bandwidth", "#fallback", "#bangladesh"]
---

# Bangladesh Mirror Fallback Runbook

> **Purpose:** when the regional dependency mirror is degraded or offline, this
> runbook tells a developer or on-call engineer exactly how to detect,
> confirm, work around, and recover the situation without waiting for the
> network team.

---

## 1. Symptoms

A developer in Bangladesh typically notices one of the following before
realising the mirror is at fault:

- `pnpm install` / `npm install` hangs for > 5 minutes, then errors with
  `ETIMEDOUT` or `ECONNRESET`.
- `pip install -r requirements.txt` downloads at < 50 KB/s from the
  regional mirror, despite the developer having 5 Mbps of bandwidth on the
  same connection.
- `go build` reports `error reading from the module proxy: ... timeout`.
- `docker pull` returns `toomanyrequests` or hangs at the manifest fetch.
- `infrastructure/mirrors/healthcheck.sh` exits 0 with `reason: MIRROR_OK_UPSTREAM_DOWN`
  (still considered healthy — upstream is serving) — but the developer is
  seeing slow fetches because the upstream is far away.

If two or more ecosystems show symptoms simultaneously, the most likely
cause is that the **mirror instance itself** is unreachable (host down, NIC
flapping, BGP issue with the upstream provider, scheduled maintenance
window).

## 2. Decision tree

```
        +-----------------------+
        | developer reports     |
        | slow / failing        |
        | dependency install    |
        +----------+------------+
                   |
        +----------v------------+
        | healthcheck.sh exits  |
        | with which reason?    |
        +----+-------------+----+
             |             |
        0=OK |             | 1=BOTH_DOWN
             |             |
   +---------v-----+ +-----v------------------+
   | mirror OK     | | both endpoints down    |
   | upstream OK   | | (true outage)          |
   +-------+-------+ +-----+------------------+
           |               |
   Prefer mirror.   Switch to upstream
   No action        (see §3).
   needed.          Alert the mirror team
                    (see §6).
```

Key rule: **`healthcheck.sh` exits 0 only if at least one endpoint
(mirror OR upstream) is reachable.** It exits 1 only when BOTH are
unreachable. A non-zero exit is the "both down" signal.

## 3. Upstream fallback (per ecosystem)

When the mirror is down but the upstream is reachable, the developer can
work — but they pay the bandwidth cost. The apply.sh script always
configures both endpoints:

| Ecosystem  | Mirror → upstream switch when mirror is down                              |
|------------|---------------------------------------------------------------------------|
| npm        | `npm config set registry "$NPM_UPSTREAM"` (re-applies on next session)    |
| PyPI       | `pip config set global.index-url "$PYPI_UPSTREAM/simple/"`               |
| Go modules | `go env -w GOPROXY="${GO_UPSTREAM}|direct"`                              |
| Docker     | edit `~/.docker/daemon.json` and replace `registry-mirrors` with `[]`, then `sudo systemctl restart docker` |

All four switches are reversible: re-running `apply.sh` restores the
mirror as primary.

## 4. Rollback

If a change in the mirror registry (e.g. a faulty proxy config rollout)
is the cause:

1. Identify the most recent config push: `git log --oneline -- infrastructure/mirrors/registry/`.
2. `git revert <sha>` on a feature branch.
3. Re-run `apply.sh --dry-run` and confirm the diff is what you expect.
4. Re-run `apply.sh` for real.
5. Re-run `healthcheck.sh` to confirm `reason: MIRROR_OK`.

If the developer machine has stale configs from a half-completed apply,
re-run `apply.sh` — it is idempotent and creates `.bak.<timestamp>`
backups of every overwritten file.

## 5. Bandwidth-saving practices (always-on)

These reduce damage when the mirror IS reachable but slow:

- **`pnpm` over `npm`.** pnpm shares a content-addressable store across
  repos; reinstalls are 10–50× faster on warm caches.
- **`pnpm fetch` ahead of `pnpm install` on CI.** Lets the lockfile be
  fetched in the action layer with its large cache, separate from the
  actual install step.
- **`go mod download -x` outside CI** to warm the module cache before
  running `go test ./...`.
- **`docker buildx build --cache-from=type=registry,ref=...`** with the
  mirror as the cache backend, so successive builds do not re-pull
  unchanged layers.
- **Avoid `docker pull --all-tags`** which fetches every tag of an image.
- **Pin image digests, not tags**, in CI; tags drift and force refetch.
- **For Python, prefer `uv` over `pip`** when the lockfile is large.
  `uv` resolves in one network round-trip; `pip` does one per
  requirement.

## 6. Security warning — untrusted mirrors

> **WARNING.** A mirror that you did not provision and audit is an
> **untrusted mirror**. Do NOT point a developer machine at one you found
> via a search engine or a chat message. The mirror operator sees every
> package you fetch, can serve you a tampered package, and can correlate
> your work with your IP address.
>
> The mirror config in this repository assumes you are pointing at a
> mirror **you** (the team) control. If you are inheriting a config from
> a previous developer, audit `~/.npmrc`, `~/.config/pip/pip.conf`,
> `~/.config/go/env`, and `~/.docker/daemon.json` before using them.
>
> For public mirrors of well-known registries (e.g. the official
> `npm.pkg.github.com` proxy used by GitHub Packages), use the same
> caveats as a CDN: TLS-verified, vendor-operated, and disclosed.

## 7. Escalation

If `healthcheck.sh` exits 1 (both endpoints down) for more than 10
minutes:

1. Page the mirror on-call (per `docs/runbooks/oncall/escalation-policy.md`).
2. Open an incident ticket with the outputs of:
   - `infrastructure/mirrors/healthcheck.sh --output json`
   - `traceroute $MIRROR_NPM_URL`
   - `traceroute $NPM_UPSTREAM`
3. If the mirror host is unreachable but the upstream works, instruct
   affected developers to apply §3 switches manually.

## 8. Post-incident

Once the mirror is back:

1. Re-run `apply.sh` on developer machines.
2. Verify `healthcheck.sh` reports `reason: MIRROR_OK`.
3. Add a row to the incident log with cause, duration, and remediation.
4. If the root cause was a config change, file a follow-up to add a test
   that would have caught it (see `tests/mirrors/`).