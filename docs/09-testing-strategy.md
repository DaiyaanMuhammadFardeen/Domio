# 09 — Testing Strategy

> **Purpose:** define the test pyramid, ownership, suites, determinism, fixtures, Definition of Done, and release gates for the full platform.
> **Posture:** the canvas, CRDT, MCP, AI, live data, and audience scale each have _domain-specific_ test programs layered on top of the pyramid.
> **Cross-references:** `02` (acceptance criteria, NFRs), `04` (architecture verification), `07` (security tests), `08` (load/chaos in staging), `10` (release gates).

---

## 9.0 Test Pyramid

```mermaid
flowchart TB
    E2E[E2E (Playwright + visual) — small]
    INT[Integration (services + ephemeral DB) — medium]
    CON[Contract (per module/event/API/MCP) — medium]
    UNIT[Unit (TS/Go) + property — large]
    FUZZ[Fuzz + security — targeted]
    PERF[Performance + load + chaos — scheduled]
    A11Y[Accessibility — manual + axe]
    I18N[Localization — pseudo + native]
    DR[Disaster recovery — quarterly]
```

| Layer                        | Owner          | Runs in               | Purpose                      | Cadence          |
| ---------------------------- | -------------- | --------------------- | ---------------------------- | ---------------- |
| Unit                         | feature team   | PR + main             | correctness, edge cases      | every PR         |
| Property                     | platform       | PR                    | invariants, schema, CRDT     | every PR         |
| Fuzz                         | security       | weekly                | injection, malformed input   | weekly + on PR   |
| Contract                     | module owner   | PR + main             | cross-module API/event shape | every PR         |
| Integration                  | platform       | PR + main             | service + DB behavior        | every PR         |
| E2E                          | platform       | main + nightly        | full user journeys           | every main       |
| Visual regression            | platform       | main + nightly        | canvas + screens             | every main       |
| Accessibility                | a11y squad     | nightly + pre-release | axe + manual                 | nightly + manual |
| Localization                 | i18n squad     | nightly               | pseudo + key extraction      | nightly          |
| Performance                  | SRE + platform | nightly + weekly      | NFR-PERF                     | nightly          |
| Load                         | SRE            | weekly                | SCALE                        | weekly           |
| Chaos                        | SRE            | monthly               | resilience                   | monthly          |
| Security (SAST/DAST/SCA/pen) | security       | PR + quarterly        | OWASP Top 10, controls       | PR + quarterly   |
| DR drills                    | SRE            | quarterly             | RTO/RPO                      | quarterly        |
| AI eval harness              | AI team        | every model change    | quality + prompt-injection   | on change        |

---

## 9.1 Unit Tests

- Vitest (TS) + Go test for any Go services.
- 80% line coverage target on critical paths (auth, payments, AI orchestration, schema validation, CRDT materialization, data binding, DLP, audit).
- Fast tests only; no DB or network.
- Coverage report per PR.

## 9.2 Property Tests

- **Tool:** fast-check (TS), gopter (Go).
- **Invariants:**
  - CRDT convergence: any permutation of concurrent ops converges to the same state.
  - Deck schema versioning: migrate N→N+1→N→N+1 idempotently.
  - Formula engine: distributive / commutative cases per type.
  - Permissions: deny-by-default; explicit grants only.
  - Agent scopes: never escalate.
  - DLP: never bypassed for cross-workspace share.

## 9.3 Fuzz Tests

- **Targets:** schema parser, CRDT materialization, markdown renderer, file upload scanners, formula parser, connector URL parser, MCP arg validator.
- **CI:** weekly scheduled runs; AFL + JS fuzzer.
- **Findings:** tracked and deduplicated against regression corpus.

## 9.4 Contract Tests

- **Per REST endpoint:** OpenAPI example validated end-to-end.
- **Per event topic:** AsyncAPI example verified against producer + consumer.
- **Per MCP tool:** JSON Schema validates args and result.
- **Module boundaries:** forbidden imports/table accesses enforced.
- **Backward compatibility:** previous-version SDKs continue working for ≥6 months.

## 9.5 Integration Tests

- Ephemeral Postgres (testcontainers), MinIO, NATS, Redis.
- Service under test + dependency mocks.
- Real migrations applied; rollback tested.
- Runs on every PR (long-running subset) and nightly (full matrix).

## 9.6 End-to-End Tests

- Playwright on Chromium, Firefox, WebKit.
- Critical user journeys from `03` §3.8:
  - Signup → create deck → share → present → audience join → recap.
  - Branch → edit → merge request.
  - Bind data → present live → scenario toggle → recap.
  - MCP: agent creates deck via tool, user approves diff, audit log records.
  - Multiplayer: two contexts editing same slide.
- 30+ scenarios maintained by platform team.

## 9.7 Visual Regression

- Playwright snapshots for editor screens, presenter, viewer, admin.
- Canvas-specific: per-frame pixel diffs at multiple zoom levels.
- Tolerance ≤ 0.1% pixel diff per region.
- False-positive quarantine workflow.

## 9.8 Accessibility Tests

- **CI:** axe-core for every surface.
- **Manual pass (pre-release):**
  - NVDA + Firefox + Windows.
  - VoiceOver + Safari + macOS.
  - JAWS + Chrome + Windows.
  - TalkBack + Android Chrome.
  - Keyboard-only navigation across flows.
  - 200% zoom pass.
  - High-contrast pass.
  - Reduced-motion pass.
  - Color blindness simulation.
- **BD-specific:** native Bangla QA on every release.
- **Bug classification:** Sev1-equivalent (block release).

## 9.9 Localization Tests

- Pseudo-locale `en-XA` (accented), `ar-XB` (RTL).
- ICU message extraction completeness.
- Bangla QA with native speaker.
- Layout overflow checks for German (long compound words), Japanese (wide glyphs).
- Number/currency/date formatting per locale.
- Pluralization tests for `one`, `other`, `few`, `many`, `two`, `zero`, etc.

## 9.10 Performance Tests

### 9.10.1 Renderer golden tests

- Snapshot: same input schema → same canvas frame buffer bytes.
- Different GPUs allowed via a tolerant comparison (PSNR threshold).
- Real-time frame budget assertions (no frame > 22 ms on baseline laptop).

### 9.10.2 Editor performance

- Workloads: 1k, 5k, 10k elements; 1, 10, 50 collaborators.
- Metrics: keystroke-to-pixel p50/p95, FPS, memory growth over 30 minutes.
- Run nightly on baseline laptop reference machine.

### 9.10.3 Sync latency

- Two clients; round-trip times; CRDT memory growth.
- Reconnect behavior; offline-merge correctness.

### 9.10.4 Export fidelity

- PDF/PPTX/MP4 fidelity compared to a golden corpus.
- Diff tooling: detect pixel drift, animation timing, accessibility tags.

### 9.10.5 Chart/data correctness

- Every chart type has a parameterized test matrix.
- Live data binding: snapshot-to-rendered-frame equivalence.
- What-if sliders: deterministic given inputs.

## 9.11 Load Tests

- **Tools:** k6 (TS scripts), Locust (Python for some), cloud load generators.
- **Scenarios:**
  - 10k concurrent audience join, sustained for 30 min.
  - 50 concurrent editors per deck across 1k decks.
  - 100k viewers on a popular published deck.
  - 1M realtime connections per region (synthetic).
  - 1k AI runs/min across fleet.
  - 1k renders/min (mixed formats).
- **Run weekly** on staging-equivalent.

## 9.12 Chaos Tests

- DB failover; network partition between control and worker; cache invalidation; CDN outage; AI provider down; connector source returning 5xx; event-bus lag.
- Run monthly in staging; expect graceful degradation.

## 9.13 Security Tests

- **SAST:** CodeQL + Semgrep.
- **DAST:** OWASP ZAP on staging.
- **SCA:** Snyk + Trivy.
- **Secret scan:** gitleaks.
- **License scan:** allowlist enforced.
- **Pen test:** annual external + quarterly internal.
- **Prompt injection:** eval harness for AI surface (see §9.16).
- **Agent tool safety:** see §9.17.

## 9.14 Disaster Recovery Tests

- Quarterly DB restore drill.
- Bi-annual region failover drill on staging.
- Annual full DR simulation.
- Result: RTO/RPO verified; documented.

## 9.15 AI Eval Harness

- **Tasks covered:** deck generation, slide redesign, copy assistant, rehearsal coach feedback quality, narrative-from-data, summarization, accessibility generation, chart selection, semantic search.
- **Datasets:** curated set with ground truth; refreshed quarterly.
- **Metrics:**
  - Faithfulness: claims tied to source.
  - Citation accuracy.
  - Layout fit (no overflow after generation).
  - Translation preservation.
  - Confidence calibration (#238).
- **Prompt-injection tests:** malicious slide text, malicious data fields, malicious audio transcript, malicious doc URL — must not bypass scope, leak secrets, or invoke disallowed tools.
- **Provider regression:** run on each model change; gate rollout on regression budget.

## 9.16 Agent Tool Safety

- For each MCP tool: dry-run correctness; arg validation rejects malformed; scope enforcement prevents unauthorized actions.
- Adversarial harness: tries to escape scope, exfiltrate data via allowed tools, replay actions, amplify cost.
- Pipeline safety: tool-call transcript integrity, agent-to-agent handoff integrity.
- Webhook-triggered agent flows: triggers restricted, blast radius limited.

## 9.17 Real-Time 10k Audience Test

- Synthetic 10k join over 5 minutes; sustained 30 minutes.
- Metrics: join success rate, event p95, server CPU/memory, network bandwidth, fairness of poll aggregation.
- Run against staging-equivalent.
- Re-run after every realtime gateway change.

## 9.18 Test Data Strategy

- **No real customer data** in non-prod.
- Faker + seed scripts generate realistic, locale-aware data.
- PII fields are synthetic; datasets tagged by tier (public/internal/restricted).
- Snapshot/restore of canonical test datasets per environment.
- Reset scripts on every ephemeral environment.

## 9.19 Determinism

- Time-injected; tests do not depend on wall clock except where explicitly measured.
- Random seeds captured.
- Network is mocked; concurrency tests use a deterministic scheduler.
- Animation timing tests use a fixed virtual clock.
- CRDT tests use the same Lamport sequence regardless of execution speed.

## 9.20 Definition of Done (DoD)

A feature is "done" only when:

1. FR acceptance criteria pass (Given/When/Then verified).
2. Unit + property + contract tests written and passing.
3. Integration and E2E coverage for happy + error + offline + conflict paths.
4. NFRs in scope verified (perf, a11y, i18n, security) per the metrics in §9.0.
5. Visual regression snapshots updated and reviewed.
6. AI eval (if applicable) passes.
7. Threat model reviewed and updated.
8. Documentation updated: feature-domain doc + ADRs + API docs + runbooks.
9. Feature flag configured with expiry.
10. ADR opened if architecture changed.

## 9.21 Release Gates (per stage)

Mapping back to `02` §2.8:

| Gate          | Verified by           | Tooling                               |
| ------------- | --------------------- | ------------------------------------- |
| Correctness   | all FRs               | Vitest, Playwright                    |
| Performance   | NFRs                  | k6, custom                            |
| Accessibility | axe + manual          | axe, NVDA, VoiceOver                  |
| Security      | OWASP + controls      | SAST/DAST/SCA, pen test, threat model |
| Privacy       | DSR + residency       | policy tests, manual                  |
| Localization  | pseudo + native       | i18n test, native QA                  |
| Reliability   | chaos + load          | chaos tooling, k6                     |
| Documentation | ADRs + API + runbooks | doc CI lint                           |

A milestone may not ship unless all eight pass.

---

## 9.22 Tooling Summary

| Concern       | Tool                            |
| ------------- | ------------------------------- |
| Unit (TS)     | Vitest                          |
| Unit (Go)     | go test                         |
| Property      | fast-check, gopter              |
| Fuzz          | AFL, JS fuzzer                  |
| Contract      | Pact + OpenAPI + AsyncAPI       |
| Integration   | testcontainers + Vitest         |
| E2E           | Playwright                      |
| Visual        | Playwright snapshots, PSNR diff |
| A11y          | axe-core, NVDA, VoiceOver, JAWS |
| Perf          | k6, custom scripts              |
| Load          | k6, Locust                      |
| Chaos         | Chaos Toolkit, Gremlin          |
| SAST          | CodeQL, Semgrep                 |
| DAST          | OWASP ZAP                       |
| SCA           | Snyk, Trivy                     |
| Secret scan   | gitleaks                        |
| Synthetic RUM | Checkly or custom               |
| Tracing       | OpenTelemetry, Tempo            |

---

## 9.23 Decisions Log

| ID        | Decision                                | Rationale                            | Alternative                               |
| --------- | --------------------------------------- | ------------------------------------ | ----------------------------------------- |
| D-TEST-01 | Vitest + Playwright + axe baseline      | Modern, fast, integrated             | Jest — slower; rejected for new project   |
| D-TEST-02 | Property tests on CRDT and schema       | Catches invariants beyond examples   | Example-only — risk of edge bugs          |
| D-TEST-03 | AI eval harness is a product artifact   | Treats AI as a release-gated surface | Ad-hoc manual — rejected                  |
| D-TEST-04 | 10k audience load test weekly           | Continuous validation                | Quarterly — too late to catch regressions |
| D-TEST-05 | Visual regression at canvas frame level | Catches subtle renderer bugs         | DOM-only — misses draw bugs               |

---

## 9.24 Open Decisions

| ID         | Decision                                                             | Owner      |
| ---------- | -------------------------------------------------------------------- | ---------- |
| OD-TEST-01 | Cloud vs self-hosted synthetic monitoring provider.                  | SRE        |
| OD-TEST-02 | Whether to gate release on 100% of axe issues or just P1 surfaces.   | A11y lead  |
| OD-TEST-03 | Property test depth (fast-check perms × 1000 vs 100).                | Platform   |
| OD-TEST-04 | Whether AI eval datasets are public to accelerate community testing. | AI product |

---

_End of 09-testing-strategy.md._
