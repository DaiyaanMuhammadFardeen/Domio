---
title: Dependency Update Runbook
phase: 01
stream: E
audience: maintainers, release engineers
last_reviewed: 2026-07-29
tags: ["#dependencies", "#renovate", "#dependabot", "#security"]
---

# Dependency Update Runbook

> **Purpose:** describe how automated dependency updates flow from Renovate
> and Dependabot to `main`, how to handle emergency security patches, and
> how to recover from a bad update while preserving bandwidth in Bangladesh.

## 1. Sources of dependency PRs

| Source      | Normal cadence                        | Security cadence             | Role |
|-------------|---------------------------------------|------------------------------|------|
| Renovate    | Monday–Friday before 07:00 Asia/Dhaka | Immediate (`at any time`)    | Primary updater and grouping engine |
| Dependabot  | Weekly, one ecosystem per weekday     | GitHub security alerts       | Redundant security channel |

Both systems cover npm, Go modules, Python, GitHub Actions, and Docker.
Renovate additionally scans Cargo and Bun files when those appear.

## 2. Decision tree

```
                 +----------------------+
                 | dependency PR opens  |
                 +----------+-----------+
                            |
                 +----------v-----------+
                 | security label?      |
                 +-----+-----------+----+
                       |           |
                    yes|           |no
                       |           |
        +--------------v--+    +---v----------------+
        | review within   |    | normal weekly     |
        | 4 hours         |    | review queue      |
        | no auto-merge   |    | grouped patches  |
        +-------+---------+    +---------+---------+
                |                        |
        +-------v----------+      +------v-------+
        | tests green?     |      | tests green? |
        +---+----------+---+      +---+-------+--+
            |          |              |       |
          yes          no           yes       no
            |          |              |       |
        merge      diagnose &     auto-merge  hold / close
                   fix manually              (see §5)
```

## 3. Normal weekly updates

1. Renovate groups non-major development dependencies and non-major runtime
   dependencies into separate PRs to reduce repeated lockfile downloads.
2. CI runs all required checks.
3. Patch/minor groups auto-merge only when every required check is green.
4. Major upgrades never auto-merge. A maintainer must read the release
   notes and confirm compatibility.
5. Dependabot opens one weekly PR per ecosystem as a backup. If the same
   update is already covered by a Renovate PR, close the duplicate with a
   comment linking to the primary PR.

## 4. Emergency security patches

Security patches are **immediate and separate** from the weekly batch:

1. The PR gets the `security` label and priority 10.
2. Renovate does not auto-merge it, even for a patch release.
3. The release engineer reviews the advisory (CVE/GHSA) within 4 hours.
4. If affected, merge as soon as CI is green and deploy through the normal
   release pipeline.
5. If not affected, document why in the PR and close it — do not leave a
   security PR open without rationale.
6. If the update breaks compilation but the vulnerability is actively
   exploited, vendor the minimal upstream patch on a temporary branch and
   open a follow-up to remove it once a compatible release exists.

## 5. When an update fails CI

| Failure | First action | Escalation |
|---------|--------------|------------|
| Lockfile conflict | Rebase the PR; let Renovate regenerate lockfiles | Close/reopen if regeneration loops |
| Type error | Read dependency release notes for breaking API changes | Split out the incompatible package |
| Test failure | Reproduce locally using the same lockfile | Pin previous version with expiry TODO |
| Download timeout | Run mirror healthcheck; retry after mirror recovers | Use upstream fallback per Bangladesh runbook |
| Integrity/checksum mismatch | **Stop. Do not retry blindly.** Verify upstream digest | Page Security; possible supply-chain incident |

## 6. Upstream fallback during update windows

If the regional mirror is down during the weekly update window:

1. Run `infrastructure/mirrors/healthcheck.sh --output json`.
2. If mirror is down but upstream is reachable, temporarily switch per
   `bangladesh-mirror-fallback.md §3`.
3. Fetch ONLY the affected ecosystem's lockfile — do not run a full clean
   install of every workspace.
4. After merge, re-run `apply.sh` to restore the mirror and warm it with the
   new dependency set.

## 7. Rollback a bad dependency update

1. **Do not amend the original commit.** Create a new revert PR so the
   incident timeline remains visible.
2. Revert the merge commit: `git revert -m 1 <merge-sha>`.
3. Run the package manager's lockfile-only mode if the lockfile did not
   revert cleanly.
4. Add an ignore rule to `.github/renovate.json` with a dated TODO to
   prevent Renovate immediately re-opening the PR.
5. File an upstream issue and link it from the ignore rule.
6. Remove the ignore rule when the fixed release is available.

## 8. Bandwidth-saving practices

- Keep grouped updates under 20 packages; larger groups are hard to review
  and trigger very large lockfile downloads.
- Run update jobs Monday–Friday before 07:00 Bangladesh time, when local
  traffic is lowest and the mirror cache has time to warm before the workday.
- Prefer lockfile-only commands (`pnpm install --lockfile-only`,
  `go mod tidy`, `uv lock`) on update branches.
- Preserve pnpm/Go/pip caches between CI jobs. Never key a cache only by
  commit SHA; include the lockfile hash and platform so unchanged layers
  remain reusable.
- Keep Docker layers stable: put dependency manifests before source code in
  Dockerfiles so a source edit does not invalidate the dependency layer.

## 9. Security warning — mirror trust

Never approve a dependency update solely because it came through the
regional mirror. Verify the package manager's integrity metadata:

- npm/pnpm: lockfile `integrity` SHA-512.
- Go: `go.sum` + `GOSUMDB=sum.golang.org`.
- Python: hash-locked requirements where available (`--require-hashes`).
- Docker: image digest pinned in config.

If the mirror returns a different checksum than the upstream, treat it as a
supply-chain incident. Stop the update, preserve logs, and page Security.
Do not "fix" the mismatch by deleting the lockfile or disabling checksum
verification.