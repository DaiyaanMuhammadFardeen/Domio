# Environments — Domio dev/staging/prod strategy

> Phase 01 Stream C · Owner: DevOps/SRE Lead · Last reviewed: 2026-07-29

This document is the canonical environment strategy for Domio. It codifies
what's the same and what's different across `dev`, `staging`, and `prod`,
together with the operational rules that keep the three environments
working in lock-step.

## 1. Environment matrix

| Concern                 | dev           | staging         | prod               |
| ----------------------- | ------------- | --------------- | ------------------ |
| Cluster                 | `domio-dev`   | `domio-staging` | `domio-prod`       |
| Region                  | southeastasia | southeastasia   | southeastasia      |
| K8s version             | 1.30.x        | 1.30.x          | 1.30.x             |
| Node min/max            | 1 / 3         | 3 / 6           | 5 / 20             |
| Postgres HA             | no            | yes (1 replica) | yes (1 replica)    |
| Postgres storage        | 64 GiB        | 256 GiB         | 1024 GiB           |
| Postgres retention      | 7 days        | 14 days         | 30 days            |
| NATS replicas           | 1             | 3               | 5                  |
| MinIO replicas          | 2             | 4               | 4                  |
| MinIO storage/node      | 200 GiB       | 500 GiB         | 2 TiB              |
| Valkey mode             | standalone    | sentinel        | cluster (6 shards) |
| OTel collector replicas | 1             | 2               | 3                  |
| Prometheus retention    | 7 d           | 30 d            | 90 d               |
| Loki/Tempo retention    | 7 d           | 30 d            | 60 d               |
| Vault mode              | dev           | unsealed        | external (P20)     |
| GitOps sync             | automated     | manual          | manual             |
| External Secrets        | yes           | yes             | yes                |
| Image registry          | ghcr.io/domio | ghcr.io/domio   | ghcr.io/domio      |

## 2. What is the same across environments

- Terraform module set under `infrastructure/terraform/modules/`.
- Helm chart set under `infrastructure/helm/`.
- ArgoCD AppProject `domio` with the same source-repo allowlist.
- OTel collector pipeline shape (receivers/processors/exporters identical).
- SLO definitions and burn-rate alert expressions.
- External Secrets Operator ClusterSecretStore reference.
- Image registry (GHCR by default).
- Mandatory pod security context (non-root, RO root FS, no escalation).

## 3. What is intentionally different

- **Sizing**: dev is intentionally tiny to keep CI fast.
- **HA**: dev does not run replicas for Postgres / MinIO / NATS; prod runs HA
  everywhere.
- **Secrets backend**: dev uses Vault in dev mode; staging runs Vault in
  HA mode (unsealed); prod delegates to the agreed external backend landed
  in P20.
- **GitOps sync**: dev is auto-sync; staging/prod are manual-sync with
  `prune: true`. See §6.
- **Data residency**: prod is pinned to `southeastasia`; dev and staging
  follow the cluster default.
- **Backup retention**: prod keeps 30 days; staging 14; dev 7.

## 4. State management

- Backend: S3 (config commented out in `backend.tf`).
- State locking: DynamoDB table `domio-tf-locks` (one per env).
- Bootstrap: a one-time `terraform init` per env after the bucket and the
  DynamoDB table are provisioned by the DevOps team.

## 5. Required status checks on `main`

The CI pipeline (Stream A) wires these as required-to-merge:

- `lint`
- `typecheck`
- `unit` (coverage gate ≥ 70% lines / 60% branches)
- `contract` (buf breaking, spectral, ajv)
- `axe`
- `threat-model-diff`
- `schema-migration-lint`
- `leak-scan`

## 6. GitOps promotion rules

- PRs that touch `infrastructure/helm/domio/values-dev.yaml` auto-sync.
- PRs that touch `infrastructure/helm/domio/values-staging.yaml` require
  a reviewer of role `domio:deployers` to click **Sync** in ArgoCD.
- PRs that touch `infrastructure/helm/domio/values-prod.yaml` require
  two reviewers from `domio:admins`.
- `prune: true` and `selfHeal: true` are enabled for all envs; the
  `automated.syncPolicy` is only present on `dev`.

## 7. Disaster recovery posture

- State backups: enabled on staging (every 6 h) and prod (every 1 h).
- Cross-region disaster recovery doc lives in `docs/runbooks/dr.md` (P22).
- Quarterly restore drill — see `environment-parity-checklist.md`.

## 8. Owner matrix

| Domain          | Primary         | Secondary            |
| --------------- | --------------- | -------------------- |
| Terraform       | DevOps/SRE Lead | Platform Foundations |
| Helm            | DevOps/SRE Lead | Platform Foundations |
| ArgoCD          | DevOps/SRE Lead | Security Lead        |
| Vault / secrets | Security Lead   | DevOps/SRE Lead      |
| Observability   | DevOps/SRE Lead | SRE on-call          |
| On-call         | SRE Lead        | Security Lead        |

## 9. How to roll a change

1. Open a PR that touches the relevant `infrastructure/` path.
2. Required checks must be green.
3. Merge → ArgoCD picks up `dev` automatically.
4. Click **Sync** in ArgoCD for staging.
5. Two reviewers click **Sync** in ArgoCD for prod.
6. Confirm in `kubectl get pods -n <env>` that rollout completed.

## 10. References

- `environment-parity-checklist.md` — quarterly review checklist.
- `gitops-drift.md` — how to investigate drift.
- `secrets-rotation.md` — secret rotation procedure.
- `bangladesh-mirror-fallback.md` — bandwidth failover.
