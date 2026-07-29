# @domio/infra-test

Structural test suite for Phase 01 Stream C infrastructure (Terraform, Helm,
ArgoCD, runbooks). The tests are intentionally **vendor-neutral** and
**executable without live cloud credentials** — they read on-disk artifacts
and assert structural invariants that map to `terraform validate`,
`helm lint`, `helm-unittest`, and `argocd app list` outputs.

## Layout

```
src/
  repo-root.ts       # REPO_ROOT discovery (file-relative then cwd fallback)
  read.ts            # file-system helpers
  terraform/
    modules.spec.ts   # presence / types / validation / no-secrets / sensitivity
    envs.spec.ts      # env file presence / partial backend / module composition
    baselines.spec.ts # normalized desired-config summaries (not tfplan binary)
  helm/
    charts.spec.ts    # Chart.yaml / values.schema.json / templates / security
    schemas.spec.ts   # AJV validation of values.yaml + negative fixtures
  argocd/
    parse.spec.ts     # AppProject restrictions / dev auto-sync / staging-prod manual
  runbooks/
    runbooks.spec.ts  # required headings, env matrix, checklist structure
```

## How to run

```sh
pnpm install
pnpm --filter @domio/infra-test test
# or directly:
pnpm test
```

A `terraform` / `helm` / `tflint` CLI is **not** required for these tests —
they are written to run in any environment that has Node ≥ 22 and pnpm ≥ 9.
When a CLI is available, run `terraform init -backend=false && terraform
validate` for each env under `infrastructure/terraform/envs/{dev,staging,prod}/`
and `helm lint <chart>` for each chart under `infrastructure/helm/`.

## Counts

The current suite contains **187 tests** across **7 spec files**, all
passing locally. See `docs/development_phases/phase-01-observability-cicd-infra-baseline.md`
§5.C for the Stream C verification matrix.