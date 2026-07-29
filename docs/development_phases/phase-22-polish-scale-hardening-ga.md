# Phase 22 — Polish, Scale, Hardening & GA (FRONTIER, last)

**Phase:** 22
**Name:** Polish, scale, hardening, GA
**Owner(s):** **Engineering Manager — GA** as overall phase owner. Three pods: (1) **Performance & Scale Pod** owns canvas FPS, CRDT convergence at scale, presenter-session stability (`packages/perf-harness`, `packages/crdt-bench`, `infra/loadtest/`); (2) **Reliability & Observability Pod** owns SLOs, alert routing, dashboard coverage, runbooks (`services/obs-control-plane`, `packages/runbooker`, `runbooks/`); (3) **Compliance & GA Gate Pod** owns security review closeout, compliance evidence, support runbooks, pricing/billing, status page, on-call rotation, RTO/RPO, accessibility certification, i18n hardening (`services/billing-svc` final stretch, `docs/11-*` binder, `infra/status-page`). The **release captain** rotates weekly and owns the GA cut. Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM all sign off per the GA gate. This phase deliberately does **NOT** introduce new product features.
**Critical path:** Yes — final critical-path phase; gates GA. Cannot release to general availability until §10 DoD is checked end-to-end.
**Parallel stream tag:** `FRONTIER — FINAL`. Runs after P21 lands and after every other phase's gaps are closed. Not gated behind P21 finishing — can start closing P20 gaps in parallel with P21.
**Intent:** Close the remaining gaps from P00–P21, harden every feature for the design-partner → GA scale jump (50k participants per session, 100k decks per tenant, 2-hour meeting stability), verify the system under chaos (Postgres failover, NATS partition, AI provider failure, CDN outage, regional isolation), and pass the **GA gate** — security review passed, compliance evidence collected, support runbooks ready, pricing/billing live, status page live, SLOs published, on-call rotation staffed, RTO/RPO validated — before opening sign-ups for paying customers beyond design partners. This is a hardening phase: every story card is either a gap closure, an SLO target met, a runbook drafted, or an audit closed. No new product functionality lands here.

> ### Phase-22 scope discipline notice
>
> P22 **deliberately does NOT introduce new features.** Every task below is either (a) closing a known gap from an earlier phase (gates missed in P03/P14/P17/P20/P21), (b) hardening an existing feature for scale / resilience / observability, (c) producing evidence for the GA gate (security review, compliance binder, runbooks), or (d) operational readiness (pricing live, status page live, on-call rotation staffed, RTO/RPO validated). If a workstream starts to look like new functionality, it routes back to P21 (and, if earlier gaps, to the originating phase doc) or to a new post-GA phase.

---

## 1. Goals

- **G1.** **Performance hardening.** Canvas sustains 60 fps with 500+ elements on a slide under sustained editor load on a mid-tier laptop; CRDT convergence holds at 1k concurrent editors per deck; presenter session stays stable over 2-hour synthetic meetings (no OOM, no drift, all frontier features within budget). All P21 sync budgets (F213 800 ms p95, F214 1.5 s, F217 50 ms haptic) hold under design-partner-realistic load.
- **G2.** **Observability hardening.** Every feature in #1–#219 has at least one Prometheus metric, one structured log line per request, one trace span per user-facing action; every SLO has an alert; every alert has a runbook; every page has an on-call owner. The Grafana dashboard library covers latency, error rate, saturation, and feature-level KPIs per service.
- **G3.** **Load & chaos drills.** A scripted load test exercises **50,000 concurrent audience members** per session, **100,000 decks per tenant**, **10,000 concurrent editors on one deck**, **2-hour meeting replays**, and **100 simultaneous live presentations per tenant**. Chaos engineering drills cover Postgres failover, NATS partition, AI provider failure, CDN outage, and regional isolation with measured RTO/RPO.
- **G4.** **Security & compliance binder closeout.** External security review passed; pentest report action items closed; SOC 2 Type II evidence binder complete and given to the auditor; PDPA / GDPR binder finalized with jurisdictional rules; Bangladesh localisation and accessibility evidence captured.
- **G5.** **Accessibility & internationalization hardening.** WCAG 2.2 AA certification with documented manual + automated pass; Bangla UI shipping with verified Unicode/bidi rendering and numeral handling; RTL readiness audit (Arabic and Hebrew UI scaffolds, even if not full launch locales); timezone / currency / locale consistency verified across data, presenter, audience, kiosk, replay, podcast surfaces.
- **G6.** **GA gate.** Pricing model and billing live; status page live with all P21 services listed and probing; on-call rotation staffed 24/7; RTO ≤1 h / RPO ≤15 min for tier-1 services validated by game day; support runbooks complete for the top 50 issue categories; design-partner migration plan to GA executed; GA sign-off by Heads of Eng, Product, Security, DPO, Support, BD/PMM.

---

## 2. Scope

### 2.1 In scope — gap closures and hardening (feature ranges vary, all are residual gaps from earlier phases)

| Area | What "in scope" means for P22 |
|---|---|
| Performance & scale | Canvas FPS, CRDT convergence, presenter-session stability, frontier-feature budgets, DB query plans, CDN caching. |
| Reliability | SLO definitions, alert routing, runbook completeness, dashboard coverage, error budgets, post-mortem template. |
| Load tests | k6 / Locust scripts in `infra/loadtest/` for the design-partner scale targets in §6; nightly CI run. |
| Chaos engineering | Litmus / Gremlin drills (Postgres failover, NATS partition, AI provider failure, CDN outage, regional isolation, biometric-service sandbox escape attempts). |
| Documentation | Every feature has a doc; every doc has a demo video; every runbook has a tabletop test pass. |
| Accessibility | WCAG 2.2 AA certification with axe + manual keyboard + screen-reader pass on every surface. |
| Internationalization | Bangla full UI; RTL-ready scaffolds; locale/timezone/currency consistency; numeral display choices. |
| GA gate | Security review pass; pentest closeout; SOC 2 evidence; PDPA binder; pricing/billing live; status page live; on-call staffed; RTO/RPO validated. |
| Frontier feature hardening | F205–F219 performance, consent UX polish, KG precision regression fixes, kiosk watchdog reliability, haptics fallback, podcast cost guardrails — all **non-functional**. |
| Enterprise hardening | All P20 Bronze/Silver/Gold gaps closed; enterprise-ready rung achieved. |
| Pricing & billing | Finalise pricing model, plumb through `services/billing-svc`, integrate with tax & invoicing. |
| Status page | `status.domio.app` live with all P21 services + edge nodes + DB clusters probing. |
| Migration plan | Design-partner data migration to GA; archival of design-partner-only flags; remove "BETA" UI. |

### 2.2 Out of scope (explicit)

- **All new product functionality.** See the §0 notice. No new features land in P22. If a story card sounds like a feature, it is out of scope.
- **Major refactors of the editor / canvas.** P03 is locked. Only surgical optimisations to hot paths are in scope.
- **New languages beyond Bangla, English, and the RTL scaffolds.** Detailed l10n for Arabic / Hebrew / Hindi is post-GA.
- **A complete SOC 2 Type II audit certification cycle.** P22 hands the binder to the auditor and supports the audit; the audit itself is a parallel program tracked outside the codebase.
- **Public launch marketing.** Marketing expansion is post-GA and lives in a separate plan owned by BD/PMM; P22 signs off on the GA blog post and demo assets only.
- **Re-architecture of CRDT layer.** P04 is locked; P22 only adds benchmarks, regression tests, and operational improvements.
- **New MCP tools.** P13 is locked; P22 only hardens existing MCP tool latency and adds observability hooks.

### 2.3 Explicit "this phase deliberately does NOT introduce new features" note

> P22 is, by design, **the gap-closure phase**. The release captain may reject any PR that adds new functionality mid-P22 unless it routes through P21 (frontier features) or back to an earlier phase and is tracked against the originating phase's Verification matrix. The release captain's authority is bounded to this rule and the §10 DoD checklist; product direction and roadmap priorities remain with the Head of Product.

---

## 3. Dependencies

### 3.1 Upstream (every earlier phase is a prerequisite for some P22 task)

Every phase from P00 through P21 is a literal prerequisite — P22 cannot close the gaps from a phase that hasn't shipped. Specifically:

- **P00–P01.** Monorepo, contracts, CI/CD, OTel SDK, KMS, Terraform modules — P22 only consumes these.
- **P02–P05.** Deck schema, canvas editor, CRDT, persistence — performance hardening and the 2-hour-meeting bench run against these.
- **P06–P11.** Components, theming, live data, animation, prototyping, 3D — performance and accessibility hardening on each.
- **P12–P13.** AI copilot and MCP — AI provider failure chaos drill and MCP latency hardening.
- **P14–P16.** Sharing, presenter, audience — sub-second sync budget soak at 50k, audit log completeness review.
- **P17–P18.** Analytics, collaboration — dashboard completeness, post-mortem evidence on flaky events.
- **P19.** Marketplace — billing / payout readiness for creator economy GA.
- **P20.** Security & enterprise — all four rungs of the maturity ladder completed; only closeout remains in P22.
- **P21.** Novel & frontier — every frontier feature's performance and reliability targets must be met in P22.

### 3.2 Downstream (this phase unblocks)

- **GA.** Sign-ups open for paying customers beyond the design-partner cohort; public marketing launches.
- **SOC 2 Type II audit observation period begins.** The audit firm observes the controls in operation post-GA.
- **Post-GA roadmap (out of scope here).** Marketing expansion, additional locales, deeper analytics, creator-economy marketplace scale.

### 3.3 Sequencing within P22

```
P22-A (early):  Gap inventory; tests-of-record; perf bench harness
P22-B:         Performance, reliability, load, chaos work
P22-C:         Accessibility, i18n, docs, runbooks
P22-D:         Security review pass; compliance binder; billing live; status page live
P22-E (final): GA gate sign-off; design-partner migration; blog + demo assets
```

---

## 4. Workstreams

> Five workstreams run in parallel after the early gap inventory. The release captain owns the GA cut and is empowered to halt a workstream that risks the GA date.

### 4.1 WS-G1 — Performance & Scale (G1, perf-related gaps from P03–P21)

**Tasks (in order):**

1. **T-G1.1 — Gap inventory.** Produce `docs/p22/gap-inventory.md` enumerating every open perf / scale / hardening gap from earlier phase Verification matrices that did not pass.
2. **T-G1.2 — `packages/perf-harness/`.** A harness: replay canonical 500-element deck at 60 fps for 60 minutes; measure p50 / p95 / p99 frame time; regression thresholds; runs in CI nightly on 3 reference laptops.
3. **T-G1.3 — Canvas FPS regression suite.** Add `apps/editor-canvas/perf/canvas_fps.spec.ts` — Puppeteer-based frame-time traces; alert on regression >10% p95 vs. baseline.
4. **T-G1.4 — CRDT convergence at scale.** `packages/crdt-bench/` — 1k concurrent editors on one deck, stress test of merge / presence / version diff paths; ensure linear memory within budget and convergence time stays under 5 s p95.
5. **T-G1.5 — Presenter 2-hour stability.** Synthetic 2-hour presenter session with all frontier features on (F205 record, F213 broadcast with 1k audience, F214 listener, F207 gaze, F208 gestures, F209 voice); CPU/RAM/latency budget verified end of session.
6. **T-G1.6 — DB query-plan review.** Per service: `EXPLAIN ANALYZE` on the top-20 hot queries; add missing indexes (Postgres); document the top-20 in `docs/05-data-database-design.md`'s perf appendix.
7. **T-G1.7 — CDN plan.** Finalise caching headers (`Cache-Control`, `Surrogate-Key`), Brotli, image optimisation pipeline (`apps/cdn-cache/`); measured TTFB improvement.
8. **T-G1.8 — N+1 audit.** Use OpenTelemetry traces to detect N+1 patterns in /services/* read paths; fix at the source rather than papering over.
9. **T-G1.9 — Frontier perf verification.** F205 ≤30 KB/min and ≤200 KB/min storage budget at scale; F213 800 ms p95 / 400 ms p50 holds with 10k audience; F214 <1.5 s detection→surface; F219 <1 s entity lookup with 100k-deck workspace; F218 99.99% reset reliability across 100 kiosks in a 7-day soak.
10. **T-G1.10 — Cost model finalised.** Update `docs/08-infrastructure-devops.md` cost appendix with measured per-tenant per-day cost at 100k decks / 50k audience; per-feature unit economics reported.
11. **T-G1.11 — Definition of Done.** All perf regressions caught in CI nightly; 2-hour bench green on three reference machines; all frontier perf budgets met; cost model approved by Finance.

**Files / packages touched.** `packages/perf-harness/`, `packages/crdt-bench/`, `infra/loadtest/`, `apps/editor-canvas/perf/`, `runbooks/perf/regression.md`, `docs/05-data-database-design.md` (perf appendix), `docs/08-infrastructure-devops.md` (cost appendix).

**Tests.** `infra/loadtest/k6/{canvas_fps,crdt_converge,presenter_session,audience_sync,kiosk_soak}.js`, Playwright `apps/editor-canvas/perf/*.spec.ts`, Jest `packages/crdt-bench/*.test.ts`.

**Definition of Done.** Nightly perf CI is green; top-20 hot queries are documented and indexed; 2-hour presenter bench green; cost model signed off.

### 4.2 WS-G2 — Reliability & Observability (G2)

**Tasks (in order):**

1. **T-G2.1 — SLO catalogue.** Produce `docs/slos/catalogue.md` — every service in `/services` and every P21 frontier feature has at least one availability, latency, and quality SLO; budgets set; owners named.
2. **T-G2.2 — Error budget policy.** `docs/slos/error-budget-policy.md` — burn-rate alerts at 1h / 6h / 24h / 72h windows per Google's SRE workbook.
3. **T-G2.3 — Alert routing.** Every alert from §T-G2.1 routes to a PagerDuty service with a primary + secondary on-call; missing-routing gaps closed.
4. **T-G2.4 — Runbook completeness.** Walk every alert; verify the linked runbook in `/runbooks/` is up-to-date, exercised at least once in a tabletop test (entry in `/runbooks/CHANGELOG.md`), and named owners are on-call.
5. **T-G2.5 — Dashboard coverage audit.** Every service has a Grafana dashboard with RED metrics + feature-specific KPIs in `/infra/grafana/dashboards/`; missing dashboards created.
6. **T-G2.6 — Log redaction audit.** Greps + OTel-based assertions prove no raw webcam frames, raw audio, raw gaze coordinates, raw voice transcripts, raw AI prompts, raw biometric data, or cleartext PII land in logs at any service.
7. **T-G2.7 — Tracing coverage.** Every user-facing action is the root trace; child spans cover editor → API → DB → side-effect; orphans are fixed at the source.
8. **T-G2.8 — Post-mortem template.** `runbooks/postmortem-template.md` adopted; the last 3 incidents already triaged via it.
9. **T-G2.9 — Synthetic probes.** From multiple regions, continuous probes hit `/healthz`, `/readyz`, and key user journeys; failure surfaces in `infra/synthetics/`.
10. **T-G2.10 — Status page wiring.** `status.domio.app` monitors every P21 service + DB cluster + edge region; incident templates exist in `infra/status-page/templates/`.
11. **T-G2.11 — Definition of Done.** Every SLO has an alert; every alert has a runbook; every runbook is tabletop-tested; every dashboard exists; log redaction audit green.

**Files / packages touched.** `docs/slos/`, `infra/grafana/dashboards/`, `infra/prometheus/`, `infra/alertmanager/`, `infra/synthetics/`, `infra/status-page/`, `runbooks/`, `services/obs-control-plane/` (new — config-as-code for the above).

**Tests.** Synthetic probe test in CI; alert-routing test (page to on-call when a known-bad deploy happens); log-redaction grep tests in `services/*/tests/log_redaction_test.{rs,go,ts}`.

**Definition of Done.** Every P21 service has a dashboard, alert, and runbook; status page probes are live; log redaction audit green; every alert tabletop-tested at least once.

### 4.3 WS-G3 — Load tests & chaos drills (G3)

**Tasks (in order):**

1. **T-G3.1 — k6 / Locust scripts.** `infra/loadtest/` with at least: `audience_50k.js`, `editors_10k.js`, `presenter_2h.js`, `decks_100k.js`, `kiosks_100.js`, `ingest_timeline.js`, `kg_query.js`.
2. **T-G3.2 — Load test staging.** A scaled staging env (matches prod topology) that the load tests run against; capacity scaled up from baseline.
3. **T-G3.3 — Chaos: Postgres failover.** `infra/chaos/postgres_failover.tf` — automated failover drill; RTO ≤ 60 s for write-path; RPO = 0 for synchronous replicas.
4. **T-G3.4 — Chaos: NATS partition.** `infra/chaos/nats_partition.tf` — broker partition; consumers backpressure correctly; no data loss on resume.
5. **T-G3.5 — Chaos: AI provider failure.** `infra/chaos/ai_provider_fail.tf` — primary AI provider returns 5xx; fallback path activates; user-visible degradation within 5 s.
6. **T-G3.6 — Chaos: CDN outage.** `infra/chaos/cdn_outage.tf` — assets unreachable; client-side fallbacks serve core renders; status page incident opens automatically.
7. **T-G3.7 — Chaos: regional isolation.** `infra/chaos/region_isolation.tf` — one region blackholed; traffic shifts to surviving regions within 30 s; no data loss.
8. **T-G3.8 — Chaos: biometric-sandbox escape attempt.** Red-team attempt to exfiltrate webcam frames or raw audio out of the F207 / F208 / F209 / F214 sandbox; asserts failure.
9. **T-G3.9 — Soak tests.** Run the load tests for 24 h continuous; surface memory leaks, scheduler drift, monotonic-clock skew.
10. **T-G3.10 — Definition of Done.** Load tests pass at design-partner scale; RTO/RPO met for every chaos scenario; biometric-sandbox escape fails closed; soak tests pass with no leaks.

**Files / packages touched.** `infra/loadtest/`, `infra/chaos/` (new), `services/*/tests/chaos_*`.

**Tests.** Every chaos drill has a passing test in `infra/chaos/{drill}.tf` + `infra/chaos/{drill}_asserts.nonascript`; failure is "drill kills live prod" — game-day automated only in test env, scheduled in staging.

**Definition of Done.** Every chaos scenario has a passing drill in staging; results documented in `/runbooks/chaos/`.

### 4.4 WS-G4 — Accessibility & Internationalization (G5)

**Tasks (in order):**

1. **T-G4.1 — Accessibility audit scope.** All surfaces: editor canvas, present mode, audience view, replay viewer, kiosk, ambient boardroom, remote app, podcast UI, every auth flow.
2. **T-G4.2 — Automated pass.** axe-core in CI on every surface; remediation tickets filed for every AAA/AA violation; back to clean.
3. **T-G4.3 — Manual keyboard pass.** Every interactive surface usable from keyboard only — recorded demos; documented in `docs/a11y/keyboard-pass.md`.
4. **T-G4.4 — Screen-reader pass.** NVDA + VoiceOver pass on the editor, presenter, and audience surfaces; transcripts of any ambiguous announcement; remediation tracked.
5. **T-G4.5 — WCAG 2.2 AA certification.** Third-party a11y review firm sign-off; certificate stored in `docs/a11y/cert-WCAG-2.2-AA.md`.
6. **T-G4.6 — Bangla full UI.** `apps/*/locales/bn.json` complete; Unicode verification script in `packages/i18n/test_bangla_unicode.py`; numeral display policy enforced (Bangla vs. Latin per org setting).
7. **T-G4.7 — RTL scaffolds.** `apps/*/locales/ar.json`, `apps/*/locales/he.json` skeletons for the key surfaces (canvas toolbar, presenter view, audience view); bidi rendering verified.
8. **T-G4.8 — Locale, timezone, currency.** Per `apps/presenter-app/src/locale/` and corresponding /apps/audience-app/src/locale/ — verified end-to-end; presenter in Dhaka sees BDT; same data presented in New York sees USD.
9. **T-G4.9 — Definition of Done.** WCAG 2.2 AA cert issued; Bangla UI ships; RTL scaffolds ready; locale/timezone/currency coverage verified.

**Files / packages touched.** `apps/*/locales/`, `packages/i18n/`, `docs/a11y/`, `infra/cert/WCAG-2.2-AA.md`.

**Tests.** `apps/*/tests/a11y/*.spec.ts`, `packages/i18n/test_*.py`.

**Definition of Done.** Axe CI green; keyboard pass demos recorded; screen-reader pass complete; WCAG certificate obtained.

### 4.5 WS-G5 — GA gate (G4, G6)

**Tasks (in order):**

1. **T-G5.1 — External security review kickoff.** Engage firm in week 1 of P22-B; fix-track action items closed by end of P22-D.
2. **T-G5.2 — Penetration test.** Public API + MCP server + sharing endpoints; full report with risk-rated action items; all criticals and highs closed.
3. **T-G5.3 — SOC 2 Type II evidence binder.** P20's binder given to auditor; controls evidenced with logs, configs, screenshots; observation period begins at GA cut.
4. **T-G5.4 — PDPA / GDPR binder.** Data flows mapped, lawful basis per purpose, DSR endpoints (access, erasure, rectification, portability, objection) tested in staging; jurisdiction routing table verified.
5. **T-G5.5 — Bangladesh localisation compliance.** PDPA 2026 review (incl. Feb 2026 amendment status); CII classification review; localization evidence for `bd-dhaka` zone; counsel sign-off.
6. **T-G5.6 — Support runbooks.** Top 50 issue categories documented in `/runbooks/support/`; tier-1 / tier-2 / tier-3 split; SLA per tier; escalation trees.
7. **T-G5.7 — Pricing model finalised.** Pricing model approved by Exec; `services/billing-svc` plumbed (Stripe + bKash/Nagad/SSLCommerz where applicable); invoices, dunning, refunds tested.
8. **T-G5.8 — Status page live.** `status.domio.app` public; subscribers on each component; maintenance window scheduling.
9. **T-G5.9 — On-call rotation staffed.** 24/7 primary + secondary for the platform PagerDuty service; escalation tree to management; documented in `/runbooks/oncall/`.
10. **T-G5.10 — RTO/RPO validated.** Game day: kill primary region, time the recovery; targets met (RTO ≤ 1 h / RPO ≤ 15 min for tier-1; tier-2/3 documented).
11. **T-G5.11 — Design-partner migration.** Plan to move design partners to GA tier; deprecate "BETA" UI; remove `domainRestriction` test-mode.
12. **T-G5.12 — GA blog + demo assets.** GA announcement post, demo video (frontier-feature complete demo), changelog; PMM-signed-off.
13. **T-G5.13 — GA sign-off.** Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM all sign the §10 DoD checklist.
14. **T-G5.14 — GA cut.** Flip the GA flag; design-partner-to-GA migration starts.
15. **T-G5.15 — Definition of Done.** All §10 boxes ticked; GA flag flipped by release captain.

**Files / packages touched.** `services/billing-svc/`, `infra/status-page/`, `runbooks/support/`, `runbooks/oncall/`, `docs/11-legal-compliance-bangladesh.md` (final binder), `docs/05-data-database-design.md` (DSR endpoints), `docs/a11y/cert-WCAG-2.2-AA.md`, `apps/web/src/marketing/ga/` (blog).

**Tests.** DSR endpoint tests (`services/account-svc/tests/dsr_*`); billing integration tests (`services/billing-svc/tests/*`); status page probe tests.

**Definition of Done.** Every §10 checkbox is signed; GA flag flipped; on-call schedule live.

### 4.6 WS-G6 — Documentation completeness (passes through every WS-G)

**Tasks:**

1. **T-G6.1 — Feature-doc completeness.** Every feature #1–#219 has a doc at `/docs/features/{NN}-*.md` with: definition, acceptance criteria, behavioural details, edge cases, owner, link to phase doc.
2. **T-G6.2 — Demo completeness.** Every feature doc has a demo video link or a written step-by-step at `/docs/features/{NN}-demo.md`.
3. **T-G6.3 — API reference completeness.** Every endpoint exposed from `/services/*` and `/contracts/openapi/v1/*.yaml` is documented at `/docs/api/`.
4. **T-G6.4 — Runbook completeness.** Every alert has a runbook; every runbook has an owner and a tabletop-pass entry.
5. **T-G6.5 — Onboarding guide.** New engineer onboarding doc exists, exercises the dev env, the contracts layout, the test pyramid, and the deploy path.
6. **T-G6.6 — Definition of Done.** All gaps inventoried and closed.

**Files / packages touched.** `docs/`, `runbooks/`.

**Definition of Done.** Documentation completeness dashboard in `docs/dashboard.md` reports zero gaps.

---

## 5. Architecture & data

P22 is operationally heavy, not architecturally heavy. New architecture introduced is limited to:

### 5.1 New services / packages (all under existing architecture docs)

- `services/obs-control-plane/` — config-as-code for Prometheus rules, Alertmanager routing, Grafana dashboards, status page probes. (See `/docs/08-infrastructure-devops.md` §Observability, `/docs/09-testing-strategy.md` §9.4.)
- `packages/perf-harness/` — replay harness for canvas FPS regression.
- `packages/crdt-bench/` — CRDT convergence benchmark.
- `infra/loadtest/` — k6 / Locust scripts.
- `infra/chaos/` — Litmus / Gremlin drill Terraform.
- `infra/cert/` — third-party certifications.

### 5.2 New tables / migrations

None. P22 does not introduce new tables; it only adds indexes from T-G1.6 and operational dashboards.

### 5.3 New contracts

None. P22 does not add new API surface; it hardens the existing surface.

### 5.4 Reference master docs

- `/docs/04-system-architecture.md` — for service-boundary review during perf audit.
- `/docs/05-data-database-design.md` — for query-plan review and DSR endpoint implementation.
- `/docs/06-technology-stack.md` — for cost model alignment.
- `/docs/07-security-planning.md` — for security review closeout.
- `/docs/08-infrastructure-devops.md` — for infra scaling, cost, RTO/RPO, status-page, on-call.
- `/docs/09-testing-strategy.md` — for chaos engineering and load testing strategy.
- `/docs/11-legal-compliance-bangladesh.md` — for PDPA / GDPR binder, Bangladesh localisation, accessibility evidence.
- `/docs/novel-frontier.md` — for the F205–F219 performance and reliability acceptance criteria inherited by T-G1.9.

---

## 6. Verification

> Owner codes: PERF = Performance & Scale Pod, REL = Reliability & Observability Pod, CHAOS = chaos drills lead, A11Y = Accessibility lead, I18N = Internationalization lead, SEC = external security firm + DPO, BILL = Billing product owner, GA = release captain, FIN = Finance partner.

### 6.1 Master matrix

| Area | Test | Expected result | Owner | Master doc reference |
|---|---|---|---|---|
| Canvas FPS | `packages/perf-harness/` on 3 reference laptops | 60 fps p50, ≥55 fps p95 with 500 elements over 60 min | PERF | `/docs/09-testing-strategy.md` §9.4 |
| CRDT convergence | 1k editors, 1 deck, 30 min | No data loss; merge within 5 s p95 | PERF | `/docs/04-system-architecture.md` |
| Presenter 2h | Synthetic 2-hour session with all frontier features on | Stable; no OOM; F205 ≤30 KB/min storage; F213 within budget | PERF | `/docs/novel-frontier.md` §3.1, §3.9 |
| Audience sync at 50k | k6 `audience_50k.js` | 800 ms p95 / 400 ms p50 holds | PERF | `/docs/novel-frontier.md` §3.9 |
| Knowledge-graph 100k-deck workspace | k6 `kg_query.js` | Lookup <1 s p95, citations <3 s p95 | PERF | `/docs/novel-frontier.md` §3.15 |
| Kiosk 100-device soak | 7-day continuous | Reset reliability ≥99.99% | PERF + CHAOS | `/docs/novel-frontier.md` §3.14 |
| SLO catalogue completeness | `docs/slos/catalogue.md` | Every service + every frontier feature has an SLO | REL | `/docs/08-infrastructure-devops.md` |
| Alert routing | PagerDuty integration test | Every alert reaches on-call | REL | same |
| Runbook completeness | Walk all alerts; every alert has a runbook with a tabletop pass | 100% | REL | same |
| Dashboard coverage | Grafana audit | Every service + frontier feature has a dashboard | REL | same |
| Log redaction | Grep + OTel assertions across all services | No raw biometric / PII in logs | REL + SEC | `/docs/07-security-planning.md` |
| Tracing coverage | Per-user-journey root trace | 100% | REL | `/docs/09-testing-strategy.md` §9.4 |
| Status page | status.domio.app live; all P21 services monitored | Probes healthy; incident flow tested | REL | same |
| Postgres failover | `infra/chaos/postgres_failover.tf` | RTO ≤ 60 s; RPO = 0 (sync replicas) | CHAOS | `/docs/08-infrastructure-devops.md` |
| NATS partition | `infra/chaos/nats_partition.tf` | Backpressure; no data loss on resume | CHAOS | same |
| AI provider failure | `infra/chaos/ai_provider_fail.tf` | Fallback within 5 s; no user-visible crash | CHAOS | `/docs/novel-frontier.md` §3.10 |
| CDN outage | `infra/chaos/cdn_outage.tf` | Core renders still served; status page incident opens | CHAOS | `/docs/08-infrastructure-devops.md` |
| Regional isolation | `infra/chaos/region_isolation.tf` | Traffic shift within 30 s | CHAOS | same |
| Biometric sandbox escape | Red-team fuzz | Escape fails closed | CHAOS + SEC | `/docs/07-security-planning.md` |
| 24h soak | All load tests run continuously | No memory leaks, no clock skew | CHAOS | same |
| WCAG 2.2 AA axe pass | Every surface in axe-core CI | Zero violations | A11Y | `/docs/07-security-planning.md` §7.x (a11y cross-ref) |
| WCAG 2.2 AA manual keyboard pass | Per T-G4.3 | Recorded demos | A11Y | same |
| WCAG 2.2 AA screen-reader pass | NVDA + VoiceOver | Transcripts clean | A11Y | same |
| Bangla UI | `apps/*/locales/bn.json` complete; numerals policy enforced | Smoke tests pass | I18N | `/docs/11-legal-compliance-bangladesh.md` §12.4 |
| RTL scaffolds | Arabic + Hebrew skeletons | bidi verified | I18N | same |
| Locale / currency / timezone end-to-end | Test deck presented from Dhaka + NY | Numbers / dates / currency localised per user | I18N | `/docs/05-data-database-design.md` §5.7 |
| External pentest | Public API + MCP + sharing surface | Zero criticals / highs open | SEC | `/docs/07-security-planning.md` |
| SOC 2 binder | Auditor evidence review | Audit observation period begins | SEC + FIN | same |
| PDPA / GDPR binder | DSR endpoints tested in staging | Round-trip access, erasure, portability | SEC | `/docs/11-legal-compliance-bangladesh.md` §11 |
| Pricing & billing | `services/billing-svc` integration tests | BDT + USD invoicing; dunning; refunds | BILL | `/docs/06-technology-stack.md` |
| On-call rotation | PagerDuty schedule | 24/7 staffed; escalation tree | GA + REL | `/docs/08-infrastructure-devops.md` |
| RTO/RPO game day | Kill primary region | RTO ≤ 1 h, RPO ≤ 15 min for tier-1 | GA | same |
| Support runbooks | Top 50 categories documented; tier-1/2/3 split; SLAs | Verified | GA + Support | `/runbooks/support/` |
| Documentation completeness | `docs/dashboard.md` | Zero gaps | GA | `/docs/README.md` |

### 6.2 GA gate checklist (explicit)

```
[ ] P22-A gap inventory complete
[ ] WS-G1 — Performance: all perf budgets met; 2-hour presenter bench green
[ ] WS-G1 — Cost model signed by Finance
[ ] WS-G2 — SLO catalogue + alert routing + runbooks complete; dashboards live
[ ] WS-G2 — Log redaction audit clean
[ ] WS-G2 — Status page live with all P21 services
[ ] WS-G3 — Load tests pass at design-partner scale (50k audience, 100k decks)
[ ] WS-G3 — Chaos drills pass with measured RTO/RPO
[ ] WS-G3 — Biometric sandbox red-team fails closed
[ ] WS-G4 — WCAG 2.2 AA certificate issued
[ ] WS-G4 — Bangla UI shipping; locale/currency/timezone E2E verified
[ ] WS-G5 — External security review passed; pentest closeout
[ ] WS-G5 — SOC 2 binder handed to auditor
[ ] WS-G5 — PDPA / GDPR binder finalised
[ ] WS-G5 — Pricing + billing live; invoices working
[ ] WS-G5 — On-call rotation staffed 24/7
[ ] WS-G5 — RTO/RPO game day passed
[ ] WS-G5 — Support runbooks complete
[ ] WS-G5 — Design-partner migration plan executed
[ ] WS-G6 — Documentation completeness dashboard at zero gaps
[ ] GA sign-off by Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM
[ ] GA flag flipped by release captain
```

---

## 7. Risks & open decisions

1. **R1 — External security review delays.** Pentest reports often surface criticals mid-P22. *Mitigation:* security firm engaged in P22-B to leave P22-D for closeouts; release captain may extend P22 if a critical blocks GA.
2. **R2 — SOC 2 audit observation period.** SOC 2 Type II is observation-based; the audit begins at GA. We cannot pre-certify the GA date; we can only hand the binder. *Mitigation:* clear communication in `/docs/11-legal-compliance-bangladesh.md` binder.
3. **R3 — Cost model regression.** Performance wins may come at increased infra cost (more edge regions, bigger DB clusters). *Mitigation:* cost model finalised in T-G1.10; Finance signoff is a GA gate; cheaper-architecture trade-offs documented for post-GA.
4. **R4 — Bangla UI completeness.** Translating the full surface may surface smaller UX bugs. *Mitigation:* translation partner engaged in P22-C to leave P22-D for remediation; per-feature "i18n owner" named across all squads.
5. **R5 — WCAG manual pass surface.** Screen readers behave differently; manual sign-off takes time. *Mitigation:* A11Y lead starts in P22-B; external firm engaged in P22-C for the formal certificate.
6. **R6 — Chaos drills in staging only.** Some failures (e.g., real-region isolation) cannot be drilled in prod until GA. *Mitigation:* staging environment with prod-equivalent topology; post-GA chaos drills in prod are a post-GA workstream.
7. **R7 — Status page accuracy.** A wrong status page is worse than no status page. *Mitigation:* every probe tied to a synthetic that has been green for ≥24 h before flipping to "operational."
8. **R8 — Support runbook coverage.** The first 200 customers will hit bugs not in the top 50 issue categories. *Mitigation:* on-call rotation has authority to author new runbooks during incidents; weekly review adds new ones to the catalogue.
9. **R9 — Pricing / billing rollout in Bangladeshi market.** bKash / Nagad / SSLCommerz integration may hit regulatory friction. *Mitigation:* Bangladesh counsel engaged in P22-B; counsel sign-off is a GA gate; aggregator approach (SSLCommerz / ShurjoPay) reduces regulatory exposure vs. direct integration.
10. **R10 — Open decision: GA scope.** Does GA include all of F205–F219, or only the safe-by-default ones? *Decision owner:* Head of Product + DPO. *Default proposal:* ship P21 features behind per-tenant opt-in flags; default off until tenant enable; the four biometric features require an extra tenant-level consent and are off by default. Decision recorded in the GA sign-off doc.
11. **R11 — Open decision: design-partner BETA labels.** Strip BETA UI at GA, or grandfather design partners? *Decision owner:* PMM + UX. *Default proposal:* strip BETA at GA for new sign-ups; grandfather design partners for 30 days then strip.
12. **R12 — Open decision: post-GA roadmap freeze.** Hold all post-GA roadmap work for 30 days post-GA to absorb incidents? *Decision owner:* Head of Product + Eng Manager. *Default proposal:* 30-day stabilisation window; only critical fixes land.

---

## 8. Demo

### 8.1 The GA readiness demo (3 hours; observers: Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM, the release captain, and 1 design-partner observer)

> The demo uses the **production-equivalent staging environment** running the GA-candidate build with real data scale.

#### Phase 1 — Full live presentation with all frontier features (60 min)

This is the canonical Domio demo that the marketing team will use as the GA announcement demo video.

1. **Pre-meeting ambient boardroom (#210).** Walk into the room; the 4K display is already in ambient mode showing the deck's hero KPIs cycling through scenarios, with a countdown to the meeting start.
2. **Gaze-guided highlighting (#207).** Presenter accepts the gaze consent; calibrates; audience view shows the gaze-following highlight with the disclosure badge.
3. **Phone-as-remote with haptics (#127 + #217).** Presenter pulls out their phone; on 50% of slide time, soft tap fires; on over-time, strong pulse fires. Clicker-less presenting.
4. **Voice triggers with confirmation (#209).** Presenter says "let's look at the bear case," then "confirmed"; scenario switches live in front of the audience.
5. **Gestures (#208).** Presenter palms forward to advance; uses a finger point as a virtual laser.
6. **Live data refresh on stage (#51).** A row in a chart updates mid-presentation; everyone sees it change.
7. **Interactive chart drilldown (#49).** Audience on screen drills into APAC; numbers update.
8. **Poll with live results (#143).** Presenter asks "which region will lead next year?"; audience joins via QR; live bars update.
9. **AI listener surfaces a question (#214).** Audience asks about churn; presenter private view shows the listener chip; presenter taps to jump to the churn appendix; audience never sees the listing.
10. **Two-way pricing negotiation (#211).** Two participants join a slide via QR; both parties move sliders; convergence locks; recorded into the timeline.
11. **Provenance chip on a stat (#215).** Hover over ARR; chip shows source, owner, freshness green; "view full lineage" shows cross-deck usages via the knowledge graph.
12. **Knowledge graph query in real time (#219).** A board member asks, "show me everywhere we cite the NPS score, and which are stale?" Demo operator runs the cross-deck search; live results.
13. **Real-time co-presenting across continents (#213).** The presenter hands off to a co-presenter in Singapore; audience views stay perfectly synced through the handoff.
14. **End the session.** Replay URL is generated.

#### Phase 2 — Replay (15 min)

15. Open the replay URL on three different machines: presenter laptop, board member's laptop, compliance auditor's machine.
16. Scrub to bear-case toggle; show "actions taken" rail; scrub across the entire session at 4× speed.
17. Show that the three machines show byte-identical visuals (within ±1 px tolerance).
18. Show the replay respects the deck's share permission — a confidential-deck replay does not open for an unauthorized viewer.

#### Phase 3 — Inheritance + living documents + audit + provenance (20 min)

19. Show the master pitch deck's inheritance tree with 50+ descendants.
20. Push an update down to a subset; descendants receive and accept/reject.
21. Show the Q3 living deck — accumulated comments, refreshes, semantic change log.
22. Pull the audit log for the demo session; show every action attributed; consent/revocation events visible; PII redaction verified.

#### Phase 4 — Observability + reliability demos (20 min)

23. Open Grafana; show the dashboard library — every service + every frontier feature.
24. Pull the status page; show that all services show "operational" with green SLAs and recent uptime.
25. Show the on-call schedule; show the runbook for "broadcaster partition" used in the last chaos drill.
26. Open the load test report — 50k audience over 60 min sustained within budget.
27. Walk through the SOC 2 binder table of contents.
28. Walk through the post-mortem from the last incident.

#### Phase 5 — Accessibility + internationalization (15 min)

29. Demo operator switches the UI to Bangla; full app shows Bangla labels and numerals.
30. Demo operator switches to RTL scaffold locale (Arabic) for the audience view; bidi renders correctly.
31. Run the keyboard-only demo of the editor and the presenter view; show the screen-reader announcement log on a check.

#### Phase 6 — Pricing + support + GA cut (10 min)

32. Open pricing tiers; show billing portal with sample invoices.
33. Show the support runbook for "user cannot open shared deck" being run live.
34. Demo operator pulls up the §10 DoD checklist; every box ticked; release captain signs off; GA flag flipped (in staging for the demo; production GA flag flip is a separate ceremony at the appointed hour).
35. Post-GA monitoring; the demo ends.

### 8.2 Demo pass criteria

- Every §6 verification row has a corresponding live moment in the demo.
- No step triggers a PII leak or biometric leak in a packet capture.
- The replay is byte-identical on three machines.
- All 24 service-status probes are green throughout the demo.
- Every §10 DoD box is checked at the end.

---

## 9. Definition of Done — **GA gate**

P22 is **done** when *every* box below is checked. The list is the gate for the GA flag to flip.

### 9.1 Performance & scale

- [ ] Nightly perf CI green for 14 consecutive nights.
- [ ] Canvas FPS regression suite in CI; zero perf regressions vs. baseline.
- [ ] CRDT convergence at 1k editors green.
- [ ] 2-hour presenter bench green on three reference machines.
- [ ] Frontier perf budgets (F205, F211, F213, F214, F218, F219) met at design-partner scale.
- [ ] DB query-plan review complete; top-20 hot queries indexed.
- [ ] Cost model signed by Finance; per-tenant per-day unit economics reported.

### 9.2 Reliability & observability

- [ ] SLO catalogue published; every service and frontier feature has an SLO.
- [ ] Error budget policy adopted; burn-rate alerts live.
- [ ] Every alert routes to a primary + secondary on-call; missing-routing gaps closed.
- [ ] Every alert has a runbook; every runbook has a tabletop test entry.
- [ ] Every service + frontier feature has a Grafana dashboard.
- [ ] Log redaction audit green; no raw biometric / PII ever logged.
- [ ] Tracing coverage at 100% for user-facing root actions.
- [ ] Post-mortem template adopted; last 3 incidents triaged through it.
- [ ] Synthetic probes live in multiple regions.
- [ ] Status page public; all P21 services monitored.

### 9.3 Load & chaos

- [ ] All k6 / Locust scripts in `infra/loadtest/` pass against scaled staging at design-partner scale.
- [ ] 24-hour soak green with no memory leaks and no clock skew.
- [ ] Postgres failover drill: RTO ≤ 60 s, RPO = 0.
- [ ] NATS partition drill: no data loss on resume.
- [ ] AI provider failure drill: fallback within 5 s.
- [ ] CDN outage drill: core renders still served; status incident opens.
- [ ] Regional isolation drill: traffic shift within 30 s.
- [ ] Biometric sandbox escape drill: failure closed.
- [ ] RTO ≤ 1 h / RPO ≤ 15 min for tier-1 services validated by game day.

### 9.4 Accessibility & internationalization

- [ ] WCAG 2.2 AA certificate issued by external firm; stored at `docs/a11y/cert-WCAG-2.2-AA.md`.
- [ ] axe-core CI green on every surface; zero AA/AAA violations.
- [ ] Keyboard-only navigation recorded for every interactive surface.
- [ ] NVDA + VoiceOver pass recorded for editor, presenter, audience.
- [ ] Bangla UI shipping with numeral display policy enforced; RTL scaffolds ready for Arabic + Hebrew.
- [ ] Locale / currency / timezone coverage verified end-to-end (Dhaka vs. New York test).

### 9.5 Security & compliance

- [ ] External security review signed off; criticals / highs closed.
- [ ] Penetration test report action items closed.
- [ ] SOC 2 Type II evidence binder handed to auditor; observation period begins at GA cut.
- [ ] PDPA / GDPR binder finalised; DSR endpoints tested in staging.
- [ ] Bangladesh localisation compliance signed off by counsel; CII classification review complete.

### 9.6 GA operational

- [ ] Pricing model approved; billing live with bKash / Nagad / card support (per market).
- [ ] Invoicing, dunning, refunds tested.
- [ ] Status page public and populated.
- [ ] On-call rotation staffed 24/7 with primary + secondary; escalation tree documented.
- [ ] Support runbooks complete for top 50 categories; tier-1/2/3 split + SLAs.
- [ ] Design-partner migration plan executed.

### 9.7 Documentation completeness

- [ ] Every feature #1–#219 has a doc at `/docs/features/{NN}-*.md`.
- [ ] Every doc has a demo (video or written).
- [ ] Every endpoint documented at `/docs/api/`.
- [ ] Every runbook has an owner and a tabletop-pass entry.
- [ ] Onboarding guide exercises dev env, contracts, test pyramid, deploy path.

### 9.8 Sign-off

- [ ] Head of Engineering sign-off.
- [ ] Head of Product sign-off.
- [ ] Head of Security / DPO sign-off.
- [ ] Head of Design sign-off.
- [ ] Head of Support sign-off.
- [ ] Head of BD / PMM sign-off.
- [ ] Release captain flips the GA flag.

### 9.9 Post-GA stabilisation window

- [ ] 30-day stabilisation window begins; only critical fixes land.
- [ ] Incident review at day 30 informs the post-GA roadmap.
