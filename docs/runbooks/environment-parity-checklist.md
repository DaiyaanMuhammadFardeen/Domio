# Environment parity checklist (quarterly)

> Owner: DevOps/SRE Lead · Cadence: every 90 days · Source of truth: `environments.md`

This checklist is the executable companion to `environments.md`. Run it at
the start of every quarter and file the resulting report in the
`infrastructure/terraform/audits/` directory under
`parity-<YYYY-Q#>.md`.

## 1. Pre-flight

- [ ] You have `terraform` ≥ 1.9 and `kubectl` ≥ 1.30 installed.
- [ ] You have read access to all three ArgoCD environments.
- [ ] You have unseal credentials for staging Vault.
- [ ] You have the prod `terraform.tfvars` (do **not** commit).

## 2. Terraform parity

- [ ] `cd infrastructure/terraform/envs/dev && terraform init -backend=false && terraform validate` returns success.
- [ ] `cd infrastructure/terraform/envs/staging && terraform init -backend=false && terraform validate` returns success.
- [ ] `cd infrastructure/terraform/envs/prod && terraform init -backend=false && terraform validate` returns success.
- [ ] All three envs produce identical module wiring
      (see `tests/terraform/plan-baseline.spec.ts`).
- [ ] No secrets in any `*.tf` file (`grep -RE 'password\s*=\s*"' infrastructure/terraform/`).

## 3. Helm parity

- [ ] `helm lint infrastructure/helm/domio` passes.
- [ ] `helm lint infrastructure/helm/observability` passes.
- [ ] `helm lint infrastructure/helm/ingress` passes.
- [ ] `helm lint infrastructure/helm/secrets` passes.
- [ ] All four `values.schema.json` files validate their default `values.yaml`.
- [ ] The pod security context is non-root, readOnlyRootFilesystem, no escalation
      in every chart (`tests/helm/security-context.spec.ts`).

## 4. ArgoCD parity

- [ ] `argocd app list` shows `domio-dev`, `domio-staging`, `domio-prod`.
- [ ] `domio-dev` has `automated: { prune: true, selfHeal: true }`.
- [ ] `domio-staging` and `domio-prod` do **not** have an `automated` field.
- [ ] All three applications belong to the `domio` project.
- [ ] `domio` project destinations list is exactly `[dev, staging, prod, observability]`.

## 5. Secrets parity

- [ ] `vault kv list secret/dev/` returns at least one path.
- [ ] `vault kv list secret/staging/` returns at least one path.
- [ ] The prod secrets backend (`var.vault_enabled = false` by default)
      is verified reachable via the agreed external backend once P20 lands.
- [ ] `.env.example` is exhaustive (no missing keys).
- [ ] `gitleaks detect` is clean against `main`.

## 6. Observability parity

- [ ] Prometheus is scraping every workload namespace in dev/staging/prod.
- [ ] Loki index in dev and staging is non-empty.
- [ ] Tempo index in dev and staging is non-empty.
- [ ] All four SLO dashboards are present in Grafana.

## 7. Capacity / cost

- [ ] `domio-dev` has ≤ 3 nodes.
- [ ] `domio-staging` has ≤ 6 nodes.
- [ ] `domio-prod` has ≤ 20 nodes.
- [ ] Cost report shows dev under USD 200 / month.

## 8. Documentation

- [ ] `docs/runbooks/environments.md` is reviewed and any drift noted in
      the parity report.
- [ ] On-call index reflects the current rotation schema.

## 9. Sign-off

| Reviewer | Role | Date |
|---|---|---|
| DevOps/SRE Lead | primary |  |
| Security Lead | secondary |  |
| Platform Foundations | tertiary |  |