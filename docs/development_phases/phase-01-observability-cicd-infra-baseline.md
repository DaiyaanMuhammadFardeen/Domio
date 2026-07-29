# Phase 01 — Observability, CI/CD, and Infrastructure Baseline

> **Status:** Not started · **Owner:** DevOps/SRE Lead + Security Lead (joint) · **Critical path:** yes · **Parallel stream:** foundation (overlaps with P00, then both gates must be green before P02) · **Phase file:** `phase-01-observability-cicd-infra-baseline.md`

## 1. Header

Phase 01 turns the skeletons and placeholder workflows delivered by Phase 00 into a real production-ready pipeline: GitHub Actions for lint/type/unit/contract/axe/threat-model/schema-migration, OTel SDK shells flipped from no-op to OTLP exporters wired into Prometheus, Grafana Tempo, and Loki, ArgoCD GitOps, Terraform/Helm modules for the dev/staging/prod environment strategy, secrets management, an on-call skeleton, an SLO catalog stub, and the active bandwidth-mirror configuration for developers in Bangladesh. There is still no product code in this phase — every artifact is infrastructure, observability, or developer-platform work that every later phase consumes. This phase overlaps P00 by roughly one week (the P00 contract skeletons must exist before the contract CI workflow becomes meaningful).

**Tags:** `#critical-path` `#foundation` `#ci-cd` `#observability` `#gitops` `#bandwidth-aware`

## 2. Goals

- A fully wired GitHub Actions pipeline that gates every PR on lint, typecheck, unit tests, contract tests (Buf breaking + Spectral lint + ajv strict), axe accessibility scan, threat-model diff, and schema-migration lint, with merge-blocking red/green signals and required status checks on `main`.
- An end-to-end observability stack: OTel collectors running alongside each service in dev/staging and (provisionally) prod, exporting metrics to Prometheus, traces to Grafana Tempo, and logs to Loki, with Grafana dashboards committed for the four SLOs seeded in this phase (request availability, p95 latency, error rate, ingestion freshness).
- A working GitOps loop: every change to `infrastructure/` goes through PR → ArgoCD sync → cluster, with auto-sync for `dev` and manual sync for `staging`/`prod`.
- Terraform/Helm module skeletons for the three environments (`dev`, `staging`, `prod`), with environment parity codified and a documented `terraform plan` baseline.
- Secrets management via External Secrets Operator + Vault dev-mode or the agreed backend (decision in §8), with no plaintext secrets in `git`, `.env.example` only, and a rotation policy stubbed in `docs/runbooks/secrets-rotation.md`.
- On-call skeleton: PagerDuty/Opsgenie service, escalation policy, primary/secondary rotation schema, runbook index, and at least one filled-in runbook for the OTel collector pipeline.
- An SLO catalog stub under `docs/slos/README.md` with four seeded SLOs (request availability, p95 latency, error rate, ingestion freshness) wired to alerts and burn-rate dashboards.
- Active dependency-mirror routing: a regional mirror registry is configured, and Renovate + Dependabot are tuned so the CI pipeline and developer machines in Bangladesh resolve dependencies through it, with documented upstream fallback.

## 3. Scope

**In scope:**

- `.github/workflows/{lint,type,unit,contract,axe,threat-model-diff,schema-migration-lint,smoke,publish}.yml` — full jobs (not skeletons), each using pinned action SHAs and reusable workflows under `.github/workflows/reusable/`.
- `infrastructure/terraform/{modules,envs/{dev,staging,prod}}` — base network, cluster, Postgres, NATS, MinIO, Valkey modules plus per-env workspaces.
- `infrastructure/helm/{domio,observability,ingress,secrets}` — initial chart skeletons.
- `infrastructure/argocd/{applications,projects,app-of-apps}.yaml` — bootstrapped for the three environments.
- `infrastructure/observability/{otel-collector,grafana,loki,tempo,prometheus}/` — Compose (dev) and Helm (staging/prod) wiring.
- OTLP switching in all three observability SDKs (`packages/observability`, `packages/observability-go`, `packages/observability-py`), plus integration tests against a local OTel collector.
- `docs/slos/README.md` + four seeded SLOs with budget alerts, error budget burn-rate dashboards.
- `docs/runbooks/{onboarding,otel-collector-down,postgres-failover,secrets-rotation,gitops-drift}.md`.
- `infrastructure/mirrors/{apply.sh,registry}/` — the active mirror registry that CI and developer machines resolve through.
- `SECURITY.md` extended with a vulnerability disclosure SLA, severity classification, and response runbook.
- Renovate configuration `.github/renovate.json` + a scheduler for dependency updates.
- Bandwidth-failure playbook: `docs/runbooks/bangladesh-mirror-fallback.md`.
- Threat-model directory `threat-model/` initialized with the STRIDE-style `threat-model/00-process.md` and a placeholder entry per system component.

**Out of scope (deferred to later phases):**

- Product features from `feature-list.md` — same P00 rule, no product code.
- Compliance certifications (SOC 2, ISO 27001) — out as direct deliverables; the trail we build here feeds P20.
- Real production secrets backend wiring beyond a dev-mode Vault — production secrets management with HSM-backed unseal is P20.
- Multi-region/multi-cloud — single primary region only in this phase; P21/P22 add regions.
- Real DR rehearsal — DR plan documented but not exercised; P22 executes it.
- SLOs beyond the four seeded ones; per-feature SLOs land with their owning phase.
- Synthetic monitoring, full-mesh probes, chaos testing — deferred to P22.
- Cost optimization (auto-scaling tuning, spot/RI mix) — deferred to P22.
- On-call rotation staffing — only the structural skeleton is in scope; named escalation schedules live in the team-internal `peopleops/` (out of repo) and are imported as encrypted YAML.

## 4. Dependencies

**Upstream phases (must be complete):**

- **P00 (Repository, contracts, dev environment)** — strictly required. The CI workflow bodies can't be filled in until the contract stubs exist (`contracts/proto/domio/v1/*.proto`, `contracts/openapi/v1/*.yaml`, `contracts/schema/*.schema.json`), the observability SDK shells exist (`packages/observability{,go,py}/`), the Docker Compose stack works (`infrastructure/docker-compose.yml`), the devcontainer builds (`.devcontainer/`), and `CODEOWNERS`/`CONTRIBUTING.md`/`SECURITY.md`/`docs/adr/0001-*.md` exist. The two phases overlap by roughly one week: P00 ships the SDK shells and contract stubs first; P01 then wires them.

**Downstream phases unblocked by P01:**

- **P02 (Deck schema & scene-graph foundation)** — uses the contract-versioning CI gate to publish `deck.schema.json` and `scene-graph.schema.json`. Uses the OTel SDK wiring for trace spans in the schema migration. Uses the GitOps pipeline for the dev cluster.
- **P03 (Canvas editor MVP)** — exercises the axe CI gate for accessibility from day one; relies on the OTel SDK to emit custom spans.
- **P04 (CRDT & presence)** — collab traffic needs real metrics; the OTel SDK with Prometheus exporter is the foundation.
- **P05 (Persistence, versioning, branches)** — runs schema migrations through the migration-lint CI gate.
- **P14 (Sharing, publishing)** — uses the secrets backend to store CDN tokens; uses the GitOps pipeline to roll out the publishing worker.
- **P20 (Security, governance, enterprise)** — consumes the threat-model diff workflow, the SLO catalog, the secrets rotation runbook, and the on-call skeleton; adds the SCIM/SAML/DLP/audit/residency pieces on top.
- **P22 (Polish, scale, hardening, GA)** — closes the loop on cost/DR/observability gaps introduced here.

## 5. Workstreams

### Stream A — CI/CD pipeline productionization

- **A.1 Lint + typecheck** *(files: `.github/workflows/lint.yml`, `.github/workflows/type.yml`, `.github/workflows/reusable/setup-node.yml`, `.github/workflows/reusable/setup-go.yml`, `.github/workflows/reusable/setup-python.yml`)*
  - Touched: `.github/workflows/`.
  - Contracts: none consumed directly; pins `puku-sh/puku-cli` (or chosen host) action to a specific SHA.
  - Tests written: each workflow is syntax-checked by `act` in CI; reusable workflows have a fixture test under `tests/ci/reusable-{node,go,python}.spec.ts` that asserts a hand-crafted workflow references them.
  - DoD: green on `main`; both lint and typecheck are required status checks; cache keys are scoped per OS + lockfile hash.

- **A.2 Unit tests with coverage gate** *(files: `.github/workflows/unit.yml`, `vitest.config.ts`, `jest.config.ts` (if needed), `codecov.yml` or equivalent) — selects primary framework in §8.*
  - Touched: `.github/workflows/unit.yml`, test framework configs.
  - Contracts: none.
  - Tests written: a smoke repo test `tests/ci/unit-coverage-gate.spec.ts` posts a synthetic failing-coverage PR and asserts CI blocks it.
  - DoD: coverage gate enforced at 70% lines / 60% branches for new code (the threshold is intentionally low for the foundation phase — P22 raises it).

- **A.3 Contract tests (wire the skeletons from P00)** *(files: `.github/workflows/contract.yml` filled in, including jobs `proto-lint`, `proto-breaking`, `openapi-spectral`, `json-schema-ajv`, `contract-publish`)*
  - Touched: `.github/workflows/contract.yml`.
  - Contracts: consumes every artifact under `contracts/`.
  - Tests written: contract CI is itself contract-tested by pushing a known-bad proto change to a feature branch and asserting CI red, then reverting and asserting green.
  - DoD: contract workflow is green on `main`; the contract artifact `contracts-<version>.tar.gz` is published to an internal registry on tag push; required status check.

- **A.4 Accessibility scan (axe)** *(files: `.github/workflows/axe.yml`, `.axe/config.json`, `apps/web/test/a11y/smoke.spec.ts`)*
  - Touched: `.github/workflows/axe.yml`, `apps/web/test/a11y/`.
  - Contracts: none directly; the scan crawls `apps/web` skeleton's pages.
  - Tests written: an a11y fixture test under `tests/ci/axe-rules.spec.ts` asserts the ruleset includes `wcag2a`, `wcag21a`, `wcag21aa`, `best-practice`.
  - DoD: axe workflow scans `apps/web`'s skeleton in CI; zero serious/critical violations to pass the gate. **Note:** Phase 01's `apps/web` is a skeleton with one screen; this gate becomes substantive from P03 onward when the editor lands.

- **A.5 Threat-model diff** *(files: `.github/workflows/threat-model-diff.yml`, `threat-model/{00-process,components/index,components/services-template,components/apps-web-skeleton}.md`)*
  - Touched: `.github/workflows/threat-model-diff.yml`, new `threat-model/` directory.
  - Contracts: none directly; STRIDE sections are markdown-based.
  - Tests written: `tests/threat-model/frontmatter.spec.ts` validates every `threat-model/**/*.md` has required sections (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).
  - DoD: workflow runs on PRs that touch `threat-model/**` and posts a diff comment; "no unresolved STRIDE sections in new components" rule enforced for new files.

- **A.6 Schema-migration lint** *(files: `.github/workflows/schema-migration-lint.yml`, `tools/migration-lint/{lint.ts,sqlparse.ts,rules/*.ts}`)*
  - Touched: `.github/workflows/schema-migration-lint.yml`, new `tools/migration-lint/` directory.
  - Contracts: none.
  - Tests written: rule tests under `tools/migration-lint/test/*.spec.ts` exercise each rule against positive and negative SQL fixtures.
  - DoD: workflow blocks PRs that violate any rule: `forward-only`, `no-drop-column-without-rename`, `no-rename-table`, `require-if-exists`, `require-transaction`, `enforce-naming-convention`. Initial rule set is intentionally conservative; P05 adds richer rules.

### Stream B — Observability stack

- **B.1 OTel collector (dev: Compose, staging/prod: Helm)** *(files: `infrastructure/observability/otel-collector/config.yaml`, `infrastructure/observability/otel-collector/docker-compose.dev.yml`, `infrastructure/helm/observability/templates/otel-collector.yaml`)*
  - Touched: `infrastructure/observability/`, `infrastructure/helm/`.
  - Contracts: none.
  - Tests written: `tests/observability/collector-pipeline.spec.ts` (Compose) and a `helm template` smoke under `tests/helm/observability.spec.ts`.
  - DoD: collector receives OTLP/HTTP and OTLP/gRPC, exports to Prometheus remote write (metrics), Tempo (traces), Loki (logs); pipeline visible in dev; Helm chart passes `helm lint` and a `helm template --dry-run` renders cleanly.

- **B.2 Prometheus, Grafana, Tempo, Loki** *(files: `infrastructure/observability/prometheus/{prometheus.yml,rules/*.yml}`, `infrastructure/observability/grafana/{dashboards/*.json,datasources/*.yaml}`, `infrastructure/observability/tempo/tempo.yaml`, `infrastructure/observability/loki/loki.yaml`)*
  - Touched: `infrastructure/observability/`.
  - Contracts: none.
  - Tests written: a `promtool check config` step in CI for every rule file; Loki/Tempo config tests under `tests/observability/loki.spec.ts`/`tempo.spec.ts`.
  - DoD: all four components start clean in the dev Compose profile; Grafana serves on `:3001` and shows the four seeded SLO dashboards.

- **B.3 OTel SDK wiring across runtimes** *(files: `packages/observability/src/exporters/otlp-http.ts` (real, not stub), `packages/observability/src/{trace,metrics,logs}.ts` updated to use it, `packages/observability-go/observe.go` and `observe_test.go` updated, `packages/observability-py/domio_obs/*` updated) — three runtime SDKs*
  - Touched: three observability SDKs.
  - Contracts: consumes `OTEL_EXPORTER_OTLP_ENDPOINT` semantics (de facto standard).
  - Tests written: integration tests per runtime that boot a local OTel collector (in-memory) and assert spans/metrics/logs are received with the right resource attributes.
  - DoD: switching `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` makes the SDKs send to a real collector; default no-op behavior preserved when unset.

### Stream C — Infrastructure, GitOps, and environments

- **C.1 Terraform modules** *(files: `infrastructure/terraform/modules/{network,cluster,postgres,nats,minio,valkey,observability,vault}/main.tf` + `variables.tf` + `outputs.tf`, `infrastructure/terraform/envs/{dev,staging,prod}/{main.tf,variables.tf,backend.tf}`)*
  - Touched: new `infrastructure/terraform/` tree.
  - Contracts: none; the cluster module consumes the GitOps repo URL via a variable.
  - Tests written: `tests/terraform/tflint.spec.ts` runs `tflint --recursive` against modules; `tests/terraform/plan-baseline.spec.ts` runs `terraform init -backend=false && terraform plan -lock=false` on each env and asserts no diff against the checked-in baseline `tests/terraform/baselines/{env}.tfplan.json`.
  - DoD: every module passes `terraform validate`; every env produces a stable plan; backend config references S3/GCS (decided in §8) with state locking via DynamoDB/equivalent.

- **C.2 Helm charts** *(files: `infrastructure/helm/{domio,observability,ingress,secrets}/Chart.yaml` + `values.yaml` + `templates/`)*
  - Touched: new `infrastructure/helm/` tree.
  - Contracts: none.
  - Tests written: `helm-unittest` fixtures per chart under `infrastructure/helm/*/templates/tests/`.
  - DoD: every chart passes `helm lint`, `helm template --dry-run`, and `helm-unittest`; values are documented in `values.yaml` comments.

- **C.3 ArgoCD applications** *(files: `infrastructure/argocd/projects/domio.yaml`, `infrastructure/argocd/applications/{dev,staging,prod}.yaml`, `infrastructure/argocd/app-of-apps.yaml`)*
  - Touched: new `infrastructure/argocd/` tree.
  - Contracts: none.
  - Tests written: yaml parse tests under `tests/argocd/parse.spec.ts`; an application-set validation under `tests/argocd/app-of-apps.spec.ts` that asserts the project exists and references existing apps.
  - DoD: ArgoCD can apply the `app-of-apps` against a fresh dev cluster; `dev` is auto-sync, `staging` and `prod` are manual-sync with `prune: true` and confirmed by a reviewer.

- **C.4 Environment strategy doc** *(files: `docs/runbooks/environments.md`, `docs/runbooks/environment-parity-checklist.md`)*
  - Touched: new docs under `docs/runbooks/`.
  - Contracts: none.
  - Tests written: a markdown lint test that asserts every required section heading is present.
  - DoD: doc explains the three-env strategy, lists what's different between envs (size, scale, secrets), and codifies a parity checklist run quarterly.

### Stream D — Secrets, security baseline, on-call, SLOs

- **D.1 Secrets management** *(files: `infrastructure/helm/secrets/`, `infrastructure/terraform/modules/vault/`, `docs/runbooks/secrets-rotation.md`, `.env.example`, `.github/workflows/leak-scan.yml`)*
  - Touched: `infrastructure/`, `.env.example`, `docs/runbooks/`.
  - Contracts: none directly.
  - Tests written: gitleaks/gandalf action test; `tests/secrets/rotate-fixtures.spec.ts` validates rotation YAML.
  - DoD: dev-mode Vault runs in dev; staging/prod use the agreed secrets backend (decision in §8); no secret values in `git`; `.env.example` is exhaustive.

- **D.2 Threat-model diff process** (extends A.5) *(files: `threat-model/components/{apps-web-skeleton,services-template,observability-pipeline,gitops-loop,secrets-pipeline}.md`, `threat-model/00-process.md`, `threat-model/01-definitions.md`)*
  - Touched: `threat-model/`.
  - Contracts: none.
  - Tests written: frontmatter tests; STRIDE-coverage tests.
  - DoD: every P00 component has a STRIDE entry; new components require a STRIDE entry before merge (enforced via PR template check).

- **D.3 On-call skeleton** *(files: `docs/runbooks/oncall/{escalation-policy.md,rotation-schema.md,index.md,handbook-template.md}`, `infrastructure/terraform/modules/oncall/{pagerduty.tf,opsgenie.tf}` (chosen vendor in §8))*
  - Touched: new `docs/runbooks/oncall/` tree.
  - Contracts: none.
  - Tests written: markdown structure tests asserting required sections per runbook.
  - DoD: vendor integration is wired in dev; a runbook template exists; the index links to every other runbook; first filled-in runbook is `docs/runbooks/oncall/otel-collector-down.md`.

- **D.4 SLO catalog stub** *(files: `docs/slos/README.md`, `docs/slos/{request-availability,p95-latency,error-rate,ingestion-freshness}.md`, `infrastructure/observability/grafana/dashboards/slo-{request-availability,p95-latency,error-rate,ingestion-freshness}.json`, `infrastructure/observability/prometheus/rules/slos.yml`)*
  - Touched: `docs/slos/`, `infrastructure/observability/`.
  - Contracts: none directly; each SLO references contract-stable paths.
  - Tests written: `tests/slos/specfrontmatter.spec.ts` asserts every SLO doc has `objective`, `SLI`, `measurement window`, `error budget`, `burn-rate alerts`.
  - DoD: each SLO has a documented objective, an SLI formula wired to a Prometheus rule, a burn-rate alert, and a Grafana dashboard. Dashboards are committed as JSON (not generated) so they're diffable.

### Stream E — Bandwidth-aware dependency mirrors

- **E.1 Active mirror registry** *(files: `infrastructure/mirrors/registry/{npm,pypi,go-modules,docker}/`, `infrastructure/mirrors/apply.sh`, `infrastructure/mirrors/healthcheck.sh`, `docs/runbooks/bangladesh-mirror-fallback.md`)*
  - Touched: `infrastructure/mirrors/`.
  - Contracts: none.
  - Tests written: `tests/mirrors/registry-health.spec.ts` pings each upstream + mirror and asserts fall-over logic.
  - DoD: mirror registry is reachable from CI; it lists which upstream URLs it caches; fallback to upstream is automatic when mirror is down.

- **E.2 Renovate + Dependabot tuning** *(files: `.github/renovate.json`, `.github/dependabot.yml`, `docs/runbooks/dependency-update.md`)*
  - Touched: `.github/`, new runbook.
  - Contracts: none.
  - Tests written: a config spec under `tests/ci/renovate-config.spec.ts` validates scheduling.
  - DoD: Renovate runs weekly with a per-day cadence; mirror URLs are pinned; emergency patches are a separate schedule.

### Cross-cutting: telemetry and compliance hooks

- **X.1 PII redaction library** *(files: `packages/redact-pii/src/index.ts`, `packages/redact-pii/test/redact.spec.ts`)*
  - Touched: new package.
  - Contracts: none.
  - Tests written: redaction coverage tests for email, phone, NID, and credit-card-shaped strings (Bangladesh-specific patterns included).
  - DoD: every observability SDK imports and applies the redact-pii helper on log output before emission.
- **X.2 Provenance (SLSA-style) emission** *(files: `.github/workflows/build-provenance.yml`, `tools/provenance/emit.ts`)*
  - Touched: `.github/workflows/`, `tools/`.
  - Contracts: none.
  - Tests written: `tests/provenance/emit.spec.ts` parses a generated SLSA provenance document and asserts the expected subject/builder fields.
  - DoD: every container image produced in this phase carries an in-toto provenance statement; the workflow is a skeleton that downstream phases reuse.

## 6. Architecture & data

### New directories and key files

```
.github/workflows/{lint,type,unit,contract,axe,threat-model-diff,schema-migration-lint,smoke,publish,leak-scan,build-provenance}.yml
.github/workflows/reusable/{setup-node,setup-go,setup-python}.yml
infrastructure/
  terraform/
    modules/{network,cluster,postgres,nats,minio,valkey,observability,vault,oncall}/
    envs/{dev,staging,prod}/
  helm/{domio,observability,ingress,secrets}/
  argocd/{projects,applications,app-of-apps}.yaml
  observability/
    otel-collector/{config.yaml,docker-compose.dev.yml}
    prometheus/{prometheus.yml,rules/slos.yml,rules/*.yml}
    grafana/{dashboards/*.json,datasources/*.yaml}
    tempo/tempo.yaml
    loki/loki.yaml
  mirrors/
    registry/{npm,pypi,go-modules,docker}/
    apply.sh
    healthcheck.sh
threat-model/{00-process.md,01-definitions.md,components/index.md,components/*.md}
docs/slos/{README.md,request-availability.md,p95-latency.md,error-rate.md,ingestion-freshness.md}
docs/runbooks/{environments.md,environment-parity-checklist.md,secrets-rotation.md,bangladesh-mirror-fallback.md,oncall/{index.md,escalation-policy.md,rotation-schema.md,handbook-template.md,otel-collector-down.md},dependency-update.md}
tools/{migration-lint,provenance}/
packages/observability/* (OTLP HTTP exporter filled in)
packages/observability-go/observe.go (updated)
packages/observability-py/domio_obs/* (updated)
packages/redact-pii/{package.json,src/index.ts,test/redact.spec.ts}
.axe/config.json
.env.example
.github/renovate.json, .github/dependabot.yml
SECURITY.md (extended with SLA)
```

### Contracts added or versioned

- No new top-level contracts in this phase — P01 is a consumer-only phase. It does, however, bump `contracts/VERSION` to `0.1.1` to mark the addition of contract CI artifact publishing (a non-schema-affecting version bump per the ADR 0001 SemVer policy).
- The P00 contracts are versioned and the contract-publish workflow in A.3 publishes them as `contracts-0.1.1.tar.gz` to the chosen registry (likely GHCR `ghcr.io/domio/contracts:0.1.1`).

### Database

Two seeded rows in `health_check`, plus a new `infrastructure/postgres/migrations/0002_runtime_metadata.up.sql` that creates:

- `runtime_metadata(k key text primary key, v jsonb not null, updated_at timestamptz not null default now())` — used by the OTel SDK to emit the build sha/git sha as resource attributes.
- A `release_marker(release_id uuid primary key, contract_version text not null, contract_uri text not null, created_at timestamptz not null default now())` table — one row per release for cross-system traceability from P01 onward.

### Services and modules introduced

- `infrastructure/terraform/modules/observability` — Terraform module that provisions OTel collector, Prometheus, Grafana, Tempo, Loki.
- `infrastructure/helm/observability` — Helm counterpart that surfaces the same components as a chart.
- `infrastructure/argocd/projects/domio.yaml` — ArgoCD project bounding the four app namespaces (`dev`, `staging`, `prod`, `observability`).
- `tools/migration-lint` — a small standalone TS tool that reads forward-only Postgres migrations and applies the six rules above.
- `tools/provenance` — SLSA provenance emitter.
- `packages/redact-pii` — PII redaction library consumed by all observability SDKs.

### Reference to master docs

- Architecture: `/docs/04-system-architecture.md` — extends the observability section, codifies the GitOps model, pins the env strategy.
- Data/database: `/docs/05-data-database-design.md` — exercises the migration toolchain with the two seeded migrations.
- Technology stack: `/docs/06-technology-stack.md` — pins the runtime versions of new infra: Kubernetes distribution (EKS/GKE/AKS — decision in §8), Terraform ≥ 1.9, Helm ≥ 3.14, ArgoCD ≥ 2.11, OTel Collector ≥ 0.104, Prometheus ≥ 2.54, Grafana ≥ 11, Tempo ≥ 2.5, Loki ≥ 3.4.
- Security planning: `/docs/07-security-planning.md` — implements STRIDE threat-model diff, secrets backend wiring, leak-scan CI, SLSA provenance.
- Infrastructure/DevOps: `/docs/08-infrastructure-devops.md` — this phase is the bulk of what's described in §8.3 (CI/CD), §8.4 (observability), §8.5 (alerting/on-call), §8.7 (DR plan doc only).
- Legal/Bangladesh: `/docs/11-legal-compliance-bangladesh.md` — the `redact-pii` library is shaped by the PDPA classification rules; the secrets backend choice is shaped by §11.2 (data localization).
- Bangladesh context: `/docs/12-bangladesh-development-context.md` — the bandwidth-mirror configuration is a direct response to §12.1.

## 7. Verification

| Feature / acceptance item | Test (file / command) | Expected result | Owner |
|---|---|---|---|
| Lint CI blocks bad PRs | `tests/ci/lint-fail.spec.ts` (uses `act`) | Synthetic PR with intentional lint error returns red | DevOps |
| Typecheck CI blocks mismatched types | `tests/ci/type-fail.spec.ts` | Synthetic PR returns red; reverting returns green | DevOps |
| Unit test coverage gate | `tests/ci/unit-coverage-gate.spec.ts` | Sub-70% PR fails | DevOps |
| Contract CI blocks proto breaking change | `tests/contracts/proto-cicd.spec.ts` | Field-number change produces red `buf-breaking` | Contracts |
| Contract CI blocks OpenAPI breaking change | `tests/contracts/openapi-cicd.spec.ts` | Path removal produces red `spectral oas` | Contracts |
| Contract CI blocks malformed JSON Schema | `tests/contracts/schema-cicd.spec.ts` | Bad draft produces red ajv | Contracts |
| Axe CI blocks accessibility regressions | `tests/axe/axe-fail.spec.ts` | Mock page with missing alt-text fails | UX Lead |
| Threat-model diff blocks new components without STRIDE | `tests/threat-model/ci-fail.spec.ts` | New component without STRIDE fails | Security |
| Schema-migration lint blocks forward-only violation | `tools/migration-lint/test/lint.spec.ts` | Drop-column-without-rename fails | DevOps |
| OTel SDK ships spans to local collector | `packages/observability/test/otlp-integration.spec.ts` | `InMemorySpanExporter` + OTLP HTTP forwarder test both pass | Platform Foundations |
| OTel Go SDK ships spans | `packages/observability-go/observe_integration_test.go` | Same | Platform Foundations |
| OTel Python SDK ships spans | `packages/observability-py/tests/test_obs_integration.py` | Same | Platform Foundations |
| Prometheus rules valid | `promtool check rules infrastructure/observability/prometheus/rules/*.yml` | All rules valid | DevOps |
| Grafana dashboards render | `tests/grafana/dashboards.spec.ts` parses each JSON | No parse errors; expected panels present | DevOps |
| Tempo and Loki configs valid | `tests/observability/{tempo,loki}.spec.ts` | yamllint + vendor validators pass | DevOps |
| Terraform plans deterministic | `tests/terraform/plan-baseline.spec.ts` | Plan unchanged from baseline (within allowed whitespace) | DevOps |
| Helm charts lint cleanly | `helm-unittest` fixtures | Every chart passes | DevOps |
| ArgoCD application set valid | `tests/argocd/parse.spec.ts` | All YAML parses; project references resolve | DevOps |
| Secrets backend reachable in dev | `tests/secrets/dev-vault.spec.ts` | `vault kv get` returns the test secret | Security |
| gitleaks blocks secret leaks | `tests/secrets/leak-scan.spec.ts` | Synthetic committed AWS key blocks | Security |
| Renovate config valid | `tests/ci/renovate-config.spec.ts` | JSON parses; schedule reasonable | Eng Productivity |
| SLSA provenance document valid | `tests/provenance/emit.spec.ts` | Document passes `slsa-verifier` | DevOps |
| PII redaction covers BD patterns | `packages/redact-pii/test/redact.spec.ts` | Email, NID, phone patterns redacted in logs | Security |
| On-call escalation policy exists | `tests/runbooks/oncall-index.spec.ts` | All required sections present | DevOps |
| SLO catalog entries have objective + SLI | `tests/slos/specfrontmatter.spec.ts` | All four SLOs have full structure | DevOps |
| Mirror registry healthy and fallback works | `tests/mirrors/registry-health.spec.ts` | When mirror returns 503, upstream serves the response | Platform Foundations |
| Dev environment parity checklist run | `tests/runbooks/env-parity.spec.ts` | Checklist script produces a green report from dev → staging | DevOps |
| Pipeline reproduces cold-start | `tests/devcontainer/post-create.spec.ts` re-run against new CI workflow | `make bootstrap && make dev-up && make smoke && make dev-down` exits 0 | Platform Foundations |
| Telemetry SDKs do not leak secrets | `packages/observability/test/secret-leak.spec.ts` | Logging an API key triggers PII redaction | Security |

## 8. Risks & open decisions

- **Vendor selection: secrets backend, on-call vendor, monitoring backend (Grafana Cloud vs. self-hosted), package registry, image registry, terraform backend.** Open decisions, expected to land in week 1. **Mitigation:** default to vendor-neutral, self-hostable defaults (Vault dev mode, Opsgenie or PagerDuty, Grafana self-hosted, GHCR, GH-native Terraform with PR-runners) so the GitOps layer can swap them later without rewriting plans.
- **Cluster choice (EKS vs. GKE vs. AKS).** Open decision. **Mitigation:** ship `infrastructure/terraform/modules/cluster` with an abstraction layer; chose AKS for Bangladesh-time-zone operational proximity, but leave the variable open.
- **Terraform plan determinism.** `terraform plan` baselines can drift on incidental output changes. **Mitigation:** baseline comparison uses a normalized JSON plan (sorted keys, trimmed timestamps).
- **OTel collector OOM under burst.** Mitigation: HPA on collector; documented limit at 256Mi; second collector replica at >70% CPU.
- **Bangladesh mirror registry availability.** Risk: when the mirror is down, dev throughput collapses. **Mitigation:** the failover playbook and the upstream fallback in the registry config; CI exercises the failure path weekly.
- **Threat-model diff noise from automated re-numbering of STRIDE entries.** Mitigation: lint normalizes whitespace and ordering of STRIDE sections before diffing.
- **Migration-lint false positives on legitimate drops** (a migration dropping a never-used column is blocked by `no-drop-column-without-rename`). Mitigation: rule supports a `BANG-ALLOWED: drop-with-rename` annotation with required reviewer.
- **SLO budgets initial values.** Starting low to avoid alert fatigue vs. starting high to set stretch goals. **Mitigation:** seed objectives aligned with NFRs from `/docs/02-requirements-engineering.md`; revisit in P17 when real-traffic telemetry is available.
- **SLSA provenance acceptance.** Some image registries don't support in-toto L3. **Mitigation:** build to L2 (signed by GH OIDC) and document the L3 path in P22.
- **Renovate auto-PR cadence colliding with P00/P01 cadence.** Mitigation: schedule updates in weekday windows only; emergency channel is on-call.
- **No production secrets backend in dev** — risk of P20 surprise. **Mitigation:** explicitly track under §10 Definition of Done; document in `docs/runbooks/secrets-rotation.md` that prod stays manual until P20.

## 9. Demo

The internal demo proves Phase 01 is shippable. Time-box: 30 minutes.

1. **Pre-demo setup (10 min prior):** Three browser tabs open — GitHub Actions on `main`, Grafana on `localhost:3001`, ArgoCD on `localhost:8080`. A test PR has been opened; it stays open throughout the demo.
2. **Step 1 — CI gates on the test PR (6 min).** Show the PR with deliberately failing lint + an axe violation + a proto breaking change, run CI, and watch each gate turn red individually as the offending file is reset. End with the green merge button enabled only when all gates pass. **Pass criterion:** a reviewer can explain each required status check in one sentence.
3. **Step 2 — Observability live (6 min).** Run a small load generator (`tests/observability/loadgen.sh`) that emits 200 RPS of synthetic spans/metrics/logs into the local OTel collector. Show in Grafana: Prometheus dashboard (request availability SLO trending green), Tempo trace waterfall (one slow trace highlighted), Loki log stream (last 5 minutes of `service=web`). **Pass criterion:** every dashboard matches the data the load generator emitted.
4. **Step 3 — GitOps loop (5 min).** Edit `infrastructure/helm/observability/values.yaml` to bump the OTel collector replica count from 1 to 2. Push. Show ArgoCD detecting the drift and showing "OutOfSync." Approve. Show the roll-out. **Pass criterion:** replicas went from 1 to 2 in the dev cluster, observed via `kubectl get pods`.
5. **Step 4 — Secrets and security (4 min).** Show `.env.example` and a `vault kv get secret/dev/test` returning the dev secret. Show the gitleaks fail-mode on a synthetic commit. Show SLSA provenance on the most recent CI-built image. **Pass criterion:** none of these require plaintext secrets in `git`.
6. **Step 5 — SLO catalog & runbooks (3 min).** Open `docs/slos/README.md` and walk the four seeded SLOs. Click through to the burn-rate alert in Grafana. Open the on-call escalation-policy doc and the OTel collector-down runbook. **Pass criterion:** every SLO has an actionable alert and every runbook has a top-level "Decision tree" section.
7. **Step 6 — Bangladesh mirror fallback drill (3 min).** `scripts/mirrors/simulate-downstream-down.sh` flips the mirror healthcheck to red. Re-run `make bootstrap`. Watch CI fall back to upstream transparently. Restore the mirror. **Pass criterion:** the bootstrap completes in both states with measurable duration deltas logged.
8. **Step 7 — Pass/fail signal at 27 min:** "Phase 01 demo pass" stamp by DevOps/SRE Lead and Security Lead.

## 10. Definition of Done

- All Stream A–E workstreams merged behind separate PRs, each behind its own required status check.
- Every GitHub Actions workflow in §5.A–B is required-to-merge on `main`. No "draft" workflows remain.
- `infrastructure/terraform/modules/` and `infrastructure/terraform/envs/{dev,staging,prod}/` pass `terraform validate` and a deterministic `terraform plan` baseline is committed under `tests/terraform/baselines/`.
- `infrastructure/helm/{domio,observability,ingress,secrets}` pass `helm lint`, `helm template --dry-run`, and `helm-unittest`.
- ArgoCD `app-of-apps` is committed and deploys cleanly to a fresh dev cluster.
- Prometheus, Grafana, Tempo, Loki are wired into the dev Compose profile; dashboards for the four seeded SLOs are committed.
- OTel SDKs in all three runtimes accept `OTEL_EXPORTER_OTLP_ENDPOINT` and ship to the local collector; integration tests are merged.
- Secrets backend is wired into dev; `vault kv get` works for the seeded secret; `.env.example` is exhaustive; gitleaks is required-to-merge.
- SLO catalog with four SLOs is committed under `docs/slos/`, each with objective, SLI, budget, burn-rate alert, and Grafana dashboard.
- Threat model has STRIDE entries for every P00 component; the threat-model-diff workflow is required-to-merge for changes to `threat-model/**`.
- On-call skeleton (`docs/runbooks/oncall/` and `infrastructure/terraform/modules/oncall/`) is committed; the OTel collector-down runbook has a filled-in decision tree.
- Mirror registry is provisioned and the Bangladesh mirror-fallback runbook plus drill are committed.
- Renovate config is committed; first dry-run PR is opened and closed.
- SLSA provenance is generated for the first CI-built image; the `build-provenance` workflow is required-to-merge for changes to images.
- PII redaction library (`packages/redact-pii`) is wired into all three observability SDKs; the redacted output is asserted in CI.
- Migration-lint tool with six rules passes on the seeded migrations; `schema-migration-lint` is required-to-merge.
- Two database migrations (`0001`, `0002`) apply and revert cleanly; `sqlx migrate run` is exercised in CI.
- Internal demo passed per §9.
- `docs/development_phases/phase-01-observability-cicd-infra-baseline.md` is published (this file) and cross-linked from `docs/development_phases/README.md`.
- `docs/development_phases/phase-00-repo-contracts-dev-env.md` and this file are jointly referenced under "Critical path foundation" in `docs/development_phases/README.md`.
