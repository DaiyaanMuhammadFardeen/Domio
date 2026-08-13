# Phase 22-beta — Beta → Public-beta hardening (P22a, P21-independent)

**Phase:** 22-beta (P22a)
**Name:** Beta → Public-beta hardening (P21-independent subset of P22)
**Owner(s):** Engineering Manager — GA as overall phase owner. Three pods: (1) **Performance & Scale Pod** owns canvas FPS, DB query-plan review, CDN caching, N+1 audit; (2) **Reliability & Observability Pod** owns SLOs, alert routing, dashboards, runbooks, log redaction audit, status page; (3) **Compliance & GA Gate Pod** owns security review closeout, SOC 2 evidence binder, PDPA / GDPR binder, pricing/billing, support runbooks, on-call rotation, RTO/RPO validation, accessibility certification, i18n hardening. The **release captain** owns the public-beta cut.
**Critical path:** Yes — gates public-beta launch and is a prerequisite for P22b (the P21-dependent portion of P22).
**Parallel stream tag:** `POLISH` — runs after P20.5 lands, in parallel with P21 pods that don't touch shared surfaces. Not gated behind P21 finishing.
**Intent:** Close every P21-independent gap from P22 — perf hardening on existing surfaces (canvas FPS regression suite, DB query plans, CDN caching, N+1 audit), full SLO/observability/story (`services/obs-control-plane/`), accessibility certification (WCAG 2.2 AA), Bangla UI ship + RTL scaffolds, external security review + pentest + SOC 2 / PDPA binders, pricing + billing live, status page live, on-call rotation staffed, RTO/RPO validated, support runbooks complete, documentation completeness dashboard — so that public-beta can open with the operational maturity that GA requires. **No new product features land here.** This is a hardening phase: every story card is either a gap closure, an SLO target met, a runbook drafted, or an audit closed.

> ### Phase-22-beta scope discipline notice
>
> P22-beta **deliberately does NOT introduce new features.** Every task below is either (a) closing a known gap from an earlier phase, (b) hardening an existing feature for scale / resilience / observability, (c) producing evidence for the public-beta gate, or (d) operational readiness. If a workstream starts to look like new functionality, it routes back to P21 (and, if earlier gaps, to the originating phase doc). **P21-dependent P22 rows** (F205/F211/F213/F214/F218/F219 perf budgets, biometric sandbox chaos drill, frontier-feature SLOs) are explicitly out of scope here — they live in P22b, which lands after P21.

---

## 0. What this phase is, and what it isn't

P22 (the full phase) is the GA gate. It assumes every P21 frontier feature is shipped. P22-beta is the **public-beta cut** of P22: it contains every P22 task that does not require F205–F219 to exist. Once P22-beta is done, public-beta can open. P22b (the remaining frontier-feature hardening) lands after P21 and joins P22-beta to form the full P22 GA gate.

### In scope (P22-beta)

| Area                        | What ships in P22-beta                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance & scale         | Canvas FPS regression suite; DB query-plan review + index sweep; CDN caching plan; N+1 audit. **No frontier-feature perf budgets.**                                                                                             |
| Reliability & observability | SLOs for every _existing_ service + feature; alert routing; runbook completeness; dashboard coverage; log redaction audit; tracing coverage; post-mortem template; synthetic probes; status page. **No frontier-feature SLOs.** |
| Load tests                  | k6 / Locust scripts at design-partner scale for existing surfaces (`audience_50k.js`, `editors_10k.js`, `presenter_2h.js`, `decks_100k.js`); scaled staging env. **No kiosk / frontier-feature load tests.**                    |
| Chaos drills                | Postgres failover; NATS partition; AI provider failure; CDN outage; regional isolation. **No biometric sandbox escape drill** (deferred to P22b with F207/F208/F209/F214).                                                      |
| Accessibility               | WCAG 2.2 AA certification; axe-core CI on every surface; keyboard + screen-reader pass on every existing surface; Bangla full UI; RTL scaffolds for Arabic + Hebrew; locale/currency/timezone E2E.                              |
| GA gate                     | External security review; pentest closeout; SOC 2 evidence binder; PDPA / GDPR binder; pricing + billing live; status page live; on-call rotation staffed; RTO/RPO game day; support runbooks; design-partner migration plan.   |
| Documentation               | Every feature #1–#204 (P21 excluded) has a doc at `/docs/features/{NN}-*.md`; every doc has a demo; every endpoint documented; onboarding guide.                                                                                |

### Out of scope (deferred to P22b)

- **Frontier-feature performance budgets** (F205 ≤30 KB/min, F213 800 ms p95, F214 <1.5 s, F218 99.99% reset, F219 <1 s lookup) — depends on P21 services being live.
- **Biometric sandbox escape drill** — depends on F207/F208/F209/F214 sandbox existing.
- **Kiosk 100-device soak** — depends on F218.
- **Knowledge-graph 100k-deck workspace query perf** — depends on F219.
- **Status-page probes for P21 services** (timeline-svc, living-svc, sensor-svc, listener-svc, broadcast-svc, knowledge-graph-svc, negotiation-svc, inheritance-svc, provenance-svc, podcast-svc, ambient-composer, kiosk-mgmt-svc) — added when those services ship.
- **P21 feature SLOs / runbooks** — authored alongside their services.

---

## 1. Goals

- **G1.** Canvas sustains 60 fps with 500+ elements on a slide under sustained editor load on a mid-tier laptop; top-20 hot DB queries are indexed; CDN cache plan deployed; N+1 read patterns fixed at source. **No frontier-feature perf budgets.**
- **G2.** Every existing feature (#1–#204) has at least one Prometheus metric, one structured log line per request, one trace span per user-facing action; every SLO has an alert; every alert has a runbook; every page has an on-call owner. The Grafana dashboard library covers latency, error rate, saturation, and feature-level KPIs per _existing_ service.
- **G3.** A scripted load test exercises 50,000 concurrent audience members per session, 100,000 decks per tenant, 10,000 concurrent editors on one deck, and 2-hour meeting replays on _existing surfaces_. Chaos engineering drills cover Postgres failover, NATS partition, AI provider failure, CDN outage, and regional isolation with measured RTO/RPO. **No biometric-sandbox chaos drill.**
- **G4.** Security & compliance binder closeout for _existing_ surfaces: external security review passed; pentest report action items closed; SOC 2 Type II evidence binder complete and given to the auditor; PDPA / GDPR binder finalized with jurisdictional rules; Bangladesh localisation and accessibility evidence captured.
- **G5.** Accessibility & internationalization hardening. WCAG 2.2 AA certification with documented manual + automated pass; Bangla UI shipping with verified Unicode/bidi rendering and numeral handling; RTL readiness audit (Arabic and Hebrew UI scaffolds, even if not full launch locales); timezone / currency / locale consistency verified across existing surfaces.
- **G6.** Public-beta gate. Pricing model and billing live; status page live with all _existing_ services listed and probing; on-call rotation staffed 24/7; RTO ≤1 h / RPO ≤15 min for tier-1 services validated by game day; support runbooks complete for the top 50 issue categories; design-partner migration plan to public-beta tier executed; public-beta sign-off by Heads of Eng, Product, Security/DPO, Design, Support.

---

## 2. Scope

### 2.1 In scope — gap closures and hardening (residual gaps from P00–P20, excluding P21)

| Area                 | What "in scope" means for P22-beta                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Performance & scale  | Canvas FPS regression suite; DB query-plan review; CDN caching plan; N+1 audit on read paths.                                                    |
| Reliability          | SLO definitions for existing services; alert routing; runbook completeness; dashboard coverage; error budgets; post-mortem template.             |
| Load tests           | k6 / Locust scripts in `infra/loadtest/` for the existing-surface scale targets in §6; nightly CI run.                                           |
| Chaos engineering    | Litmus / Gremlin drills on existing infrastructure (Postgres failover, NATS partition, AI provider failure, CDN outage, regional isolation).     |
| Documentation        | Every feature #1–#204 has a doc; every doc has a demo video; every runbook has a tabletop test pass.                                             |
| Accessibility        | WCAG 2.2 AA certification with axe + manual keyboard + screen-reader pass on every _existing_ surface.                                           |
| Internationalization | Bangla full UI; RTL-ready scaffolds; locale/timezone/currency consistency; numeral display choices.                                              |
| Public-beta gate     | Security review pass; pentest closeout; SOC 2 evidence; PDPA binder; pricing/billing live; status page live; on-call staffed; RTO/RPO validated. |
| Enterprise hardening | All P20 Bronze/Silver/Gold gaps closed; enterprise-ready rung achieved (P20.5 was the beta rung; P22-beta closes the public-beta rung).          |
| Pricing & billing    | Finalise pricing model, plumb through `services/billing-svc`, integrate with tax & invoicing.                                                    |
| Status page          | `status.domio.app` live with all _existing_ services + edge nodes + DB clusters probing.                                                         |
| Migration plan       | Design-partner data migration to public-beta tier; archival of design-partner-only flags; remove "BETA" UI for new sign-ups.                     |

### 2.2 Out of scope (explicit)

- **All new product functionality.** See the §0 notice. No new features land in P22-beta. If a story card sounds like a feature, it is out of scope.
- **All P21 frontier features** (#205–#219). Tracked in the P21 phase doc; P22-beta does not implement them and does not validate their perf budgets.
- **Major refactors of the editor / canvas.** P03 is locked. Only surgical optimisations to hot paths are in scope.
- **New languages beyond Bangla, English, and the RTL scaffolds.** Detailed l10n for Arabic / Hebrew / Hindi is post-public-beta.
- **A complete SOC 2 Type II audit certification cycle.** P22-beta hands the binder to the auditor and supports the audit; the audit itself is a parallel program tracked outside the codebase.
- **Public launch marketing.** Marketing expansion is post-public-beta and lives in a separate plan owned by BD/PMM.
- **Re-architecture of CRDT layer.** P04 is locked; P22-beta only adds benchmarks, regression tests, and operational improvements.
- **New MCP tools.** P13 is locked; P22-beta only hardens existing MCP tool latency and adds observability hooks.
- **Kiosk fleet ops, broadcast SLOs, KG query SLOs, frontier-feature dashboards.** All land in P22b once P21 services exist.

---

## 3. Dependencies

### 3.1 Upstream (must be complete before P22-beta lands)

- **P00–P01.** Monorepo, contracts, CI/CD, OTel SDK, KMS, Terraform modules — P22-beta only consumes these.
- **P02–P05.** Deck schema, canvas editor, CRDT, persistence — performance hardening and the 2-hour-meeting bench run against these.
- **P06–P11.** Components, theming, live data, animation, prototyping, 3D — performance and accessibility hardening on each.
- **P12–P13.** AI copilot and MCP — AI provider failure chaos drill and MCP latency hardening.
- **P14–P16.** Sharing, presenter, audience — sync-budget soak at 50k for existing broadcaster, audit log completeness review.
- **P17–P18.** Analytics, collaboration — dashboard completeness, post-mortem evidence on flaky events.
- **P19.** Marketplace — billing / payout readiness for creator economy public-beta.
- **P20.** Security & enterprise — all four rungs of the maturity ladder completed; only closeout remains in P22-beta.
- **P20.5.** Beta security hardening — must be landed first; P22-beta is the public-beta rung of the same maturity ladder.

### 3.2 Downstream (this phase unblocks)

- **Public-beta.** Sign-ups open beyond the design-partner cohort (or the closed-beta cohort); public marketing launches the "open beta" beat.
- **P21.** Frontier pods that touch shared surfaces (e.g., presenter-app, replay-viewer, ambient composer) can land once P22-beta has cleared the canvas/presenter/audience perf + a11y gates — those surfaces are now "hardened" and won't be destabilised by P21 changes.
- **P22b.** Once P21 ships, P22b adds the frontier-feature perf budgets, biometric sandbox chaos, P21-service SLOs/runbooks/dashboards, kiosk soak, and KG query perf to complete the full P22 GA gate.

### 3.3 Sequencing within P22-beta

```
P22b-A (early):  Gap inventory; tests-of-record; perf bench harness
P22b-B:          Performance, reliability, load, chaos work
P22b-C:          Accessibility, i18n, docs, runbooks
P22b-D:          Security review pass; compliance binder; billing live; status page live
P22b-E (final):  Public-beta gate sign-off; design-partner migration; BETA UI removal
```

---

## 4. Workstreams

> Five workstreams run in parallel after the early gap inventory. The release captain owns the public-beta cut and is empowered to halt a workstream that risks the launch date.

### 4.1 WS-G1 — Performance & Scale (G1, perf-related gaps from P03–P20)

**Tasks (in order):**

1. **T-G1.1 — Gap inventory.** Produce `docs/p22b/gap-inventory.md` enumerating every open perf / scale / hardening gap from earlier phase Verification matrices that did not pass.
2. **T-G1.2 — `packages/perf-harness/`.** A harness: replay canonical 500-element deck at 60 fps for 60 minutes; measure p50 / p95 / p99 frame time; regression thresholds; runs in CI nightly on 3 reference laptops.
3. **T-G1.3 — Canvas FPS regression suite.** Add `apps/editor/perf/canvas_fps.spec.ts` — Puppeteer-based frame-time traces; alert on regression >10% p95 vs. baseline.
4. **T-G1.4 — CRDT convergence at scale.** `packages/crdt-bench/` — 1k concurrent editors on one deck, stress test of merge / presence / version diff paths; ensure linear memory within budget and convergence time stays under 5 s p95.
5. **T-G1.5 — Presenter 2-hour stability.** Synthetic 2-hour presenter session against existing surfaces (no frontier features); CPU/RAM/latency budget verified end of session.
6. **T-G1.6 — DB query-plan review.** Per service: `EXPLAIN ANALYZE` on the top-20 hot queries; add missing indexes (Postgres); document the top-20 in `docs/05-data-database-design.md`'s perf appendix.
7. **T-G1.7 — CDN plan.** Finalise caching headers (`Cache-Control`, `Surrogate-Key`), Brotli, image optimisation pipeline (`apps/cdn-cache/`); measured TTFB improvement.
8. **T-G1.8 — N+1 audit.** Use OpenTelemetry traces to detect N+1 patterns in `/services/*` read paths; fix at the source rather than papering over.
9. **T-G1.9 — Cost model finalised.** Update `docs/08-infrastructure-devops.md` cost appendix with measured per-tenant per-day cost at 100k decks / 50k audience on _existing surfaces_; per-feature unit economics reported. (Frontier-feature unit economics land in P22b.)
10. **T-G1.10 — Definition of Done.** All perf regressions caught in CI nightly; 2-hour bench green on three reference machines; cost model approved by Finance.

**Files / packages touched.** `packages/perf-harness/`, `packages/crdt-bench/`, `infra/loadtest/`, `apps/editor/perf/`, `runbooks/perf/regression.md`, `docs/05-data-database-design.md` (perf appendix), `docs/08-infrastructure-devops.md` (cost appendix).

**Tests.** `infra/loadtest/k6/{canvas_fps,crdt_converge,presenter_session,audience_sync}.js`, Playwright `apps/editor/perf/*.spec.ts`, Vitest `packages/crdt-bench/*.test.ts`.

**Definition of Done.** Nightly perf CI is green; top-20 hot queries are documented and indexed; 2-hour presenter bench green; cost model signed off.

---

### 4.2 WS-G2 — Reliability & Observability (G2)

**Tasks (in order):**

1. **T-G2.1 — SLO catalogue.** Produce `docs/slos/catalogue.md` — every service in `/services` (that exists at P22-beta start) has at least one availability, latency, and quality SLO; budgets set; owners named.
2. **T-G2.2 — Error budget policy.** `docs/slos/error-budget-policy.md` — burn-rate alerts at 1h / 6h / 24h / 72h windows per Google's SRE workbook.
3. **T-G2.3 — Alert routing.** Every alert from T-G2.1 routes to a PagerDuty service with a primary + secondary on-call; missing-routing gaps closed.
4. **T-G2.4 — Runbook completeness.** Walk every alert; verify the linked runbook in `/runbooks/` is up-to-date, exercised at least once in a tabletop test (entry in `/runbooks/CHANGELOG.md`), and named owners are on-call.
5. **T-G2.5 — Dashboard coverage audit.** Every service has a Grafana dashboard with RED metrics + feature-specific KPIs in `/infra/grafana/dashboards/`; missing dashboards created.
6. **T-G2.6 — Log redaction audit.** Greps + OTel-based assertions prove no raw voice transcripts, raw AI prompts, raw biometric data, or cleartext PII land in logs at any service. (Raw webcam frames / raw audio / raw gaze coordinates cannot be in scope here because they belong to P21 sensors — the audit covers _future-proofing_ the redaction patterns.)
7. **T-G2.7 — Tracing coverage.** Every user-facing action is the root trace; child spans cover editor → API → DB → side-effect; orphans are fixed at the source.
8. **T-G2.8 — Post-mortem template.** `runbooks/postmortem-template.md` adopted; the last 3 incidents already triaged via it.
9. **T-G2.9 — Synthetic probes.** From multiple regions, continuous probes hit `/healthz`, `/readyz`, and key user journeys; failure surfaces in `infra/synthetics/`.
10. **T-G2.10 — Status page wiring.** `status.domio.app` monitors every existing service + DB cluster + edge region; incident templates exist in `infra/status-page/templates/`. P21 services will be added in P22b.
11. **T-G2.11 — Definition of Done.** Every SLO has an alert; every alert has a runbook; every runbook is tabletop-tested; every dashboard exists; log redaction audit green.

**Files / packages touched.** `docs/slos/`, `infra/grafana/dashboards/`, `infra/prometheus/`, `infra/alertmanager/`, `infra/synthetics/`, `infra/status-page/`, `runbooks/`, `services/obs-control-plane/` (new — config-as-code for the above).

**Tests.** Synthetic probe test in CI; alert-routing test (page to on-call when a known-bad deploy happens); log-redaction grep tests in `services/*/tests/log_redaction_test.{rs,go,ts}`.

**Definition of Done.** Every existing service has a dashboard, alert, and runbook; status page probes are live; log redaction audit green; every alert tabletop-tested at least once.

---

### 4.3 WS-G3 — Load tests & chaos drills (G3)

**Tasks (in order):**

1. **T-G3.1 — k6 / Locust scripts.** `infra/loadtest/` with at least: `audience_50k.js`, `editors_10k.js`, `presenter_2h.js`, `decks_100k.js`, `ingest_timeline.js`. (Kiosk soak and KG query load scripts land in P22b.)
2. **T-G3.2 — Load test staging.** A scaled staging env (matches prod topology) that the load tests run against; capacity scaled up from baseline.
3. **T-G3.3 — Chaos: Postgres failover.** `infra/chaos/postgres_failover.tf` — automated failover drill; RTO ≤ 60 s for write-path; RPO = 0 for synchronous replicas.
4. **T-G3.4 — Chaos: NATS partition.** `infra/chaos/nats_partition.tf` — broker partition; consumers backpressure correctly; no data loss on resume.
5. **T-G3.5 — Chaos: AI provider failure.** `infra/chaos/ai_provider_fail.tf` — primary AI provider returns 5xx; fallback path activates; user-visible degradation within 5 s.
6. **T-G3.6 — Chaos: CDN outage.** `infra/chaos/cdn_outage.tf` — assets unreachable; client-side fallbacks serve core renders; status page incident opens automatically.
7. **T-G3.7 — Chaos: regional isolation.** `infra/chaos/region_isolation.tf` — one region blackholed; traffic shifts to surviving regions within 30 s; no data loss.
8. **T-G3.8 — Soak tests.** Run the load tests for 24 h continuous; surface memory leaks, scheduler drift, monotonic-clock skew.
9. **T-G3.9 — Definition of Done.** Load tests pass at design-partner scale on existing surfaces; RTO/RPO met for every chaos scenario; soak tests pass with no leaks.

**Files / packages touched.** `infra/loadtest/`, `infra/chaos/` (new), `services/*/tests/chaos_*`.

**Tests.** Every chaos drill has a passing test in `infra/chaos/{drill}.tf` + `infra/chaos/{drill}_asserts.nonascript`; failure is "drill kills live prod" — game-day automated only in test env, scheduled in staging.

**Definition of Done.** Every chaos scenario has a passing drill in staging; results documented in `/runbooks/chaos/`.

> **Note.** The biometric-sandbox escape drill (T-G3.8 of the full P22 doc) is out of scope here — it requires F207/F208/F209/F214 to exist. Lands in P22b.

---

### 4.4 WS-G4 — Accessibility & Internationalization (G5)

**Tasks (in order):**

1. **T-G4.1 — Accessibility audit scope.** All _existing_ surfaces: editor canvas, present mode, audience view, kiosk (existing market-facing UI, not the P21 kiosk runtime), ambient boardroom (existing UI — full ambient composer lands in P21), remote app, every auth flow.
2. **T-G4.2 — Automated pass.** axe-core in CI on every surface; remediation tickets filed for every AAA/AA violation; back to clean.
3. **T-G4.3 — Manual keyboard pass.** Every interactive surface usable from keyboard only — recorded demos; documented in `docs/a11y/keyboard-pass.md`.
4. **T-G4.4 — Screen-reader pass.** NVDA + VoiceOver pass on the editor, presenter, and audience surfaces; transcripts of any ambiguous announcement; remediation tracked.
5. **T-G4.5 — WCAG 2.2 AA certification.** Third-party a11y review firm sign-off; certificate stored in `docs/a11y/cert-WCAG-2.2-AA.md`.
6. **T-G4.6 — Bangla full UI.** `apps/*/locales/bn.json` complete; Unicode verification script in `packages/i18n/test_bangla_unicode.py`; numeral display policy enforced (Bangla vs. Latin per org setting).
7. **T-G4.7 — RTL scaffolds.** `apps/*/locales/ar.json`, `apps/*/locales/he.json` skeletons for the key surfaces (canvas toolbar, presenter view, audience view); bidi rendering verified.
8. **T-G4.8 — Locale, timezone, currency.** Per `apps/presenter/src/locale/` and corresponding `apps/viewer/src/locale/` — verified end-to-end; presenter in Dhaka sees BDT; same data presented in New York sees USD.
9. **T-G4.9 — Definition of Done.** WCAG 2.2 AA cert issued; Bangla UI ships; RTL scaffolds ready; locale/timezone/currency coverage verified.

**Files / packages touched.** `apps/*/locales/`, `packages/i18n/`, `docs/a11y/`, `infra/cert/WCAG-2.2-AA.md`.

**Tests.** `apps/*/tests/a11y/*.spec.ts`, `packages/i18n/test_*.py`.

**Definition of Done.** Axe CI green; keyboard pass demos recorded; screen-reader pass complete; WCAG certificate obtained.

---

### 4.5 WS-G5 — Public-beta gate (G4, G6)

**Tasks (in order):**

1. **T-G5.1 — External security review kickoff.** Engage firm in week 1 of P22b-B; fix-track action items closed by end of P22b-D.
2. **T-G5.2 — Penetration test.** Public API + MCP server + sharing endpoints; full report with risk-rated action items; all criticals and highs closed.
3. **T-G5.3 — SOC 2 Type II evidence binder.** P20's binder given to auditor; controls evidenced with logs, configs, screenshots; observation period begins at public-beta cut.
4. **T-G5.4 — PDPA / GDPR binder.** Data flows mapped, lawful basis per purpose, DSR endpoints (access, erasure, rectification, portability, objection) tested in staging; jurisdiction routing table verified.
5. **T-G5.5 — Bangladesh localisation compliance.** PDPA 2026 review (incl. Feb 2026 amendment status); CII classification review; localization evidence for `bd-dhaka` zone; counsel sign-off.
6. **T-G5.6 — Support runbooks.** Top 50 issue categories documented in `/runbooks/support/`; tier-1 / tier-2 / tier-3 split; SLA per tier; escalation trees.
7. **T-G5.7 — Pricing model finalised.** Pricing model approved by Exec; `services/billing-svc` plumbed (Stripe + bKash/Nagad/SSLCommerz where applicable); invoices, dunning, refunds tested.
8. **T-G5.8 — Status page live.** `status.domio.app` public; subscribers on each component; maintenance window scheduling.
9. **T-G5.9 — On-call rotation staffed.** 24/7 primary + secondary for the platform PagerDuty service; escalation tree to management; documented in `/runbooks/oncall/`.
10. **T-G5.10 — RTO/RPO validated.** Game day: kill primary region, time the recovery; targets met (RTO ≤ 1 h / RPO ≤ 15 min for tier-1; tier-2/3 documented).
11. **T-G5.11 — Design-partner migration.** Plan to move design partners to public-beta tier; deprecate "BETA" UI for new sign-ups; grandfather design partners per the R11 decision (30-day strip default).
12. **T-G5.12 — Public-beta blog + demo assets.** Public-beta announcement post, demo video (existing-feature tour — no frontier features), changelog; PMM-signed-off.
13. **T-G5.13 — Public-beta sign-off.** Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM all sign the §10 DoD checklist.
14. **T-G5.14 — Public-beta cut.** Flip the public-beta flag; design-partner-to-public-beta migration starts.
15. **T-G5.15 — Definition of Done.** All §10 boxes ticked; public-beta flag flipped by release captain.

**Files / packages touched.** `services/billing-svc/`, `infra/status-page/`, `runbooks/support/`, `runbooks/oncall/`, `docs/11-legal-compliance-bangladesh.md` (final binder), `docs/05-data-database-design.md` (DSR endpoints), `docs/a11y/cert-WCAG-2.2-AA.md`, `apps/landing/src/marketing/public-beta/` (blog).

**Tests.** DSR endpoint tests (`services/account-svc/tests/dsr_*`); billing integration tests (`services/billing-svc/tests/*`); status page probe tests.

**Definition of Done.** Every §10 checkbox is signed; public-beta flag flipped; on-call schedule live.

---

### 4.6 WS-G6 — Documentation completeness (passes through every WS-G)

**Tasks:**

1. **T-G6.1 — Feature-doc completeness.** Every feature **#1–#204** (P21 excluded) has a doc at `/docs/features/{NN}-*.md` with: definition, acceptance criteria, behavioural details, edge cases, owner, link to phase doc.
2. **T-G6.2 — Demo completeness.** Every existing-feature doc has a demo video link or a written step-by-step at `/docs/features/{NN}-demo.md`. (P21 feature docs land in P21 itself or in P22b.)
3. **T-G6.3 — API reference completeness.** Every endpoint exposed from `/services/*` (that exists at P22-beta start) and `/contracts/openapi/v1/*.yaml` is documented at `/docs/api/`.
4. **T-G6.4 — Runbook completeness.** Every alert has a runbook; every runbook has an owner and a tabletop-pass entry.
5. **T-G6.5 — Onboarding guide.** New engineer onboarding doc exists, exercises the dev env, the contracts layout, the test pyramid, and the deploy path.
6. **T-G6.6 — Definition of Done.** All gaps inventoried and closed.

**Files / packages touched.** `docs/`, `runbooks/`.

**Definition of Done.** Documentation completeness dashboard in `docs/dashboard.md` reports zero gaps for features #1–#204.

---

## 5. Architecture & data

P22-beta is operationally heavy, not architecturally heavy. New architecture introduced is limited to:

### 5.1 New services / packages (all under existing architecture docs)

- `services/obs-control-plane/` — config-as-code for Prometheus rules, Alertmanager routing, Grafana dashboards, status page probes. (See `/docs/08-infrastructure-devops.md` §Observability, `/docs/09-testing-strategy.md` §9.4.)
- `services/billing-svc/` — final stretch of pricing/billing integration. (Inherited from earlier phases; P22-beta finishes the GA wiring.)
- `packages/perf-harness/` — replay harness for canvas FPS regression.
- `packages/crdt-bench/` — CRDT convergence benchmark.
- `infra/loadtest/` — k6 / Locust scripts.
- `infra/chaos/` — Litmus / Gremlin drill Terraform.
- `infra/synthetics/` — multi-region synthetic probes.
- `infra/status-page/` — `status.domio.app` Terraform + templates.
- `infra/grafana/dashboards/` — dashboard JSON per service.
- `infra/cert/` — third-party certifications.

### 5.2 New tables / migrations

None. P22-beta does not introduce new tables; it only adds indexes from T-G1.6 and operational dashboards.

### 5.3 New contracts

None. P22-beta does not add new API surface; it hardens the existing surface.

### 5.4 Reference master docs

- `/docs/04-system-architecture.md` — for service-boundary review during perf audit.
- `/docs/05-data-database-design.md` — for query-plan review and DSR endpoint implementation.
- `/docs/06-technology-stack.md` — for cost model alignment.
- `/docs/07-security-planning.md` — for security review closeout.
- `/docs/08-infrastructure-devops.md` — for infra scaling, cost, RTO/RPO, status-page, on-call.
- `/docs/09-testing-strategy.md` — for chaos engineering and load testing strategy.
- `/docs/11-legal-compliance-bangladesh.md` — for PDPA / GDPR binder, Bangladesh localisation, accessibility evidence.

---

## 6. Verification

> Owner codes: PERF = Performance & Scale Pod, REL = Reliability & Observability Pod, CHAOS = chaos drills lead, A11Y = Accessibility lead, I18N = Internationalization lead, SEC = external security firm + DPO, BILL = Billing product owner, GA = release captain, FIN = Finance partner.

### 6.1 Master matrix (existing surfaces only; frontier-feature rows omitted)

| Area                                    | Test                                                            | Expected result                                       | Owner        | Master doc reference                            |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- | ------------ | ----------------------------------------------- |
| Canvas FPS                              | `packages/perf-harness/` on 3 reference laptops                 | 60 fps p50, ≥55 fps p95 with 500 elements over 60 min | PERF         | `/docs/09-testing-strategy.md` §9.4             |
| CRDT convergence                        | 1k editors, 1 deck, 30 min                                      | No data loss; merge within 5 s p95                    | PERF         | `/docs/04-system-architecture.md`               |
| Presenter 2h                            | Synthetic 2-hour session on existing surfaces                   | Stable; no OOM                                        | PERF         | (no frontier features in scope)                 |
| Audience sync at 50k                    | k6 `audience_50k.js`                                            | 800 ms p95 / 400 ms p50 holds on existing broadcaster | PERF         | `/docs/15-presenter-experience.md`              |
| SLO catalogue completeness              | `docs/slos/catalogue.md`                                        | Every existing service has an SLO                     | REL          | `/docs/08-infrastructure-devops.md`             |
| Alert routing                           | PagerDuty integration test                                      | Every alert reaches on-call                           | REL          | same                                            |
| Runbook completeness                    | Walk all alerts; every alert has a runbook with a tabletop pass | 100%                                                  | REL          | same                                            |
| Dashboard coverage                      | Grafana audit                                                   | Every existing service has a dashboard                | REL          | same                                            |
| Log redaction                           | Grep + OTel assertions across existing services                 | No raw voice transcripts / AI prompts / PII in logs   | REL + SEC    | `/docs/07-security-planning.md`                 |
| Tracing coverage                        | Per-user-journey root trace                                     | 100%                                                  | REL          | `/docs/09-testing-strategy.md` §9.4             |
| Status page                             | status.domio.app live; existing services monitored              | Probes healthy; incident flow tested                  | REL          | same                                            |
| Postgres failover                       | `infra/chaos/postgres_failover.tf`                              | RTO ≤ 60 s; RPO = 0 (sync replicas)                   | CHAOS        | `/docs/08-infrastructure-devops.md`             |
| NATS partition                          | `infra/chaos/nats_partition.tf`                                 | Backpressure; no data loss on resume                  | CHAOS        | same                                            |
| AI provider failure                     | `infra/chaos/ai_provider_fail.tf`                               | Fallback within 5 s; no user-visible crash            | CHAOS        | `/docs/12-ai-copilot.md`                        |
| CDN outage                              | `infra/chaos/cdn_outage.tf`                                     | Core renders still served; status page incident opens | CHAOS        | `/docs/08-infrastructure-devops.md`             |
| Regional isolation                      | `infra/chaos/region_isolation.tf`                               | Traffic shift within 30 s                             | CHAOS        | same                                            |
| 24h soak                                | All load tests run continuously                                 | No memory leaks, no clock skew                        | CHAOS        | same                                            |
| WCAG 2.2 AA axe pass                    | Every surface in axe-core CI                                    | Zero violations                                       | A11Y         | `/docs/07-security-planning.md` §7.x            |
| WCAG 2.2 AA manual keyboard pass        | Per T-G4.3                                                      | Recorded demos                                        | A11Y         | same                                            |
| WCAG 2.2 AA screen-reader pass          | NVDA + VoiceOver                                                | Transcripts clean                                     | A11Y         | same                                            |
| Bangla UI                               | `apps/*/locales/bn.json` complete; numerals policy enforced     | Smoke tests pass                                      | I18N         | `/docs/11-legal-compliance-bangladesh.md` §12.4 |
| RTL scaffolds                           | Arabic + Hebrew skeletons                                       | bidi verified                                         | I18N         | same                                            |
| Locale / currency / timezone end-to-end | Test deck presented from Dhaka + NY                             | Numbers / dates / currency localised per user         | I18N         | `/docs/05-data-database-design.md` §5.7         |
| External pentest                        | Public API + MCP + sharing surface                              | Zero criticals / highs open                           | SEC          | `/docs/07-security-planning.md`                 |
| SOC 2 binder                            | Auditor evidence review                                         | Audit observation period begins                       | SEC + FIN    | same                                            |
| PDPA / GDPR binder                      | DSR endpoints tested in staging                                 | Round-trip access, erasure, portability               | SEC          | `/docs/11-legal-compliance-bangladesh.md` §11   |
| Pricing & billing                       | `services/billing-svc` integration tests                        | BDT + USD invoicing; dunning; refunds                 | BILL         | `/docs/06-technology-stack.md`                  |
| On-call rotation                        | PagerDuty schedule                                              | 24/7 staffed; escalation tree                         | GA + REL     | `/docs/08-infrastructure-devops.md`             |
| RTO/RPO game day                        | Kill primary region                                             | RTO ≤ 1 h, RPO ≤ 15 min for tier-1                    | GA           | same                                            |
| Support runbooks                        | Top 50 categories documented; tier-1/2/3 split; SLAs            | Verified                                              | GA + Support | `/runbooks/support/`                            |
| Documentation completeness              | `docs/dashboard.md`                                             | Zero gaps for features #1–#204                        | GA           | `/docs/README.md`                               |

---

## 7. Risks & open decisions

1. **R1 — External security review delays.** Pentest reports often surface criticals mid-P22-beta. _Mitigation:_ security firm engaged in P22b-B to leave P22b-D for closeouts; release captain may extend if a critical blocks public-beta.
2. **R2 — SOC 2 audit observation period.** SOC 2 Type II is observation-based; the audit begins at public-beta. We cannot pre-certify the public-beta date; we can only hand the binder. _Mitigation:_ clear communication in `/docs/11-legal-compliance-bangladesh.md` binder.
3. **R3 — Cost model regression.** Performance wins may come at increased infra cost (more edge regions, bigger DB clusters). _Mitigation:_ cost model finalised in T-G1.9; Finance signoff is a public-beta gate; cheaper-architecture trade-offs documented for post-public-beta.
4. **R4 — Bangla UI completeness.** Translating the full surface may surface smaller UX bugs. _Mitigation:_ translation partner engaged in P22b-C to leave P22b-D for remediation; per-feature "i18n owner" named across all squads.
5. **R5 — WCAG manual pass surface.** Screen readers behave differently; manual sign-off takes time. _Mitigation:_ A11Y lead starts in P22b-B; external firm engaged in P22b-C for the formal certificate.
6. **R6 — Chaos drills in staging only.** Some failures (e.g., real-region isolation) cannot be drilled in prod until public-beta. _Mitigation:_ staging environment with prod-equivalent topology; post-public-beta chaos drills in prod are a post-public-beta workstream.
7. **R7 — Status page accuracy.** A wrong status page is worse than no status page. _Mitigation:_ every probe tied to a synthetic that has been green for ≥24 h before flipping to "operational."
8. **R8 — Support runbook coverage.** The first 200 customers will hit bugs not in the top 50 issue categories. _Mitigation:_ on-call rotation has authority to author new runbooks during incidents; weekly review adds new ones to the catalogue.
9. **R9 — Pricing / billing rollout in Bangladeshi market.** bKash / Nagad / SSLCommerz integration may hit regulatory friction. _Mitigation:_ Bangladesh counsel engaged in P22b-B; counsel sign-off is a public-beta gate; aggregator approach (SSLCommerz / ShurjoPay) reduces regulatory exposure vs. direct integration.
10. **R10 — Open decision: design-partner BETA labels.** Strip BETA UI at public-beta, or grandfather design partners? _Decision owner:_ PMM + UX. _Default proposal:_ strip BETA at public-beta for new sign-ups; grandfather design partners for 30 days then strip.
11. **R11 — Open decision: post-public-beta roadmap freeze.** Hold all post-public-beta roadmap work for 30 days post-public-beta to absorb incidents? _Decision owner:_ Head of Product + Eng Manager. _Default proposal:_ 30-day stabilisation window; only critical fixes land.
12. **R12 — Open decision: P21 pods running during P22-beta.** P21 frontier pods that don't touch shared surfaces (e.g., knowledge-graph-svc, negotiation-svc, podcast-svc) could ship in parallel with P22-beta. P21 pods that touch hardened surfaces (presenter-app, replay-viewer, ambient composer) should wait for P22-beta to land to avoid destabilising the public-beta cut. _Decision owner:_ Head of Product + Eng Manager. _Default proposal:_ P21 splits into P21a (parallel-safe pods) and P21b (post-public-beta pods).

---

## 8. Demo

### 8.1 The public-beta readiness demo (2 hours; observers: Heads of Eng, Product, Security/DPO, Design, Support, BD/PMM, the release captain, and 1 design-partner observer)

> The demo uses the **production-equivalent staging environment** running the public-beta-candidate build with real data scale. No frontier features are in scope.

#### Phase 1 — Full live presentation with existing features (45 min)

This is the canonical Domio demo that the marketing team will use as the public-beta announcement demo video.

1. **Pre-meeting.** Open the existing Q3 deck in the editor; show live data binding to a mock Salesforce source.
2. **Live editor.** Make a live edit; CRDT propagates to a co-editor in another region in <5 s.
3. **Live data refresh on stage (#51).** A row in a chart updates mid-presentation; everyone sees it change.
4. **Interactive chart drilldown (#49).** Audience on screen drills into APAC; numbers update.
5. **Poll with live results (#143).** Presenter asks "which region will lead next year?"; audience joins via QR; live bars update.
6. **Phone-as-remote (#127).** Presenter pulls out their phone; advances slides; visual cues only (no haptics — that's F217 in P21).
7. **AI listener surfaces a question (existing #124 variant).** Audience asks about churn; presenter private view shows the AI suggestion; presenter taps to jump to the churn appendix.
8. **End the session.**

#### Phase 2 — Sharing, marketplace, replay (20 min)

9. Open the replay URL on three different machines; show byte-identical visuals (within ±1 px tolerance).
10. Show that the replay respects the deck's share permission — a confidential-deck replay does not open for an unauthorized viewer.
11. Walk through a marketplace purchase flow with a real bKash test card; show creator payout.
12. Show the audit log for the demo session; show every action attributed; consent/revocation events visible; PII redaction verified.

#### Phase 3 — Observability + reliability demos (20 min)

13. Open Grafana; show the dashboard library — every service.
14. Pull the status page; show that all services show "operational" with green SLAs and recent uptime.
15. Show the on-call schedule; show the runbook for "broadcaster partition" used in the last chaos drill.
16. Open the load test report — 50k audience over 60 min sustained within budget.
17. Walk through the SOC 2 binder table of contents.
18. Walk through the post-mortem from the last incident.

#### Phase 4 — Accessibility + internationalization (15 min)

19. Demo operator switches the UI to Bangla; full app shows Bangla labels and numerals.
20. Demo operator switches to RTL scaffold locale (Arabic) for the audience view; bidi renders correctly.
21. Run the keyboard-only demo of the editor and the presenter view; show the screen-reader announcement log on a check.

#### Phase 5 — Pricing + support + public-beta cut (10 min)

22. Open pricing tiers; show billing portal with sample invoices (BDT + USD).
23. Show the support runbook for "user cannot open shared deck" being run live.
24. Demo operator pulls up the §10 DoD checklist; every box ticked; release captain signs off; public-beta flag flipped (in staging for the demo; production public-beta flag flip is a separate ceremony at the appointed hour).
25. Post-public-beta monitoring; the demo ends.

### 8.2 Demo pass criteria

- Every §6 verification row has a corresponding live moment in the demo.
- No step triggers a PII leak in a packet capture.
- The replay is byte-identical on three machines.
- All existing service-status probes are green throughout the demo.
- Every §10 DoD box is checked at the end.

---

## 9. Mapping to full P22

This is the P21-independent subset of `phase-22-polish-scale-hardening-ga.md`. Each full-P22 task is either **in P22-beta** (this doc), **deferred to P22b** (after P21), or **deferred to post-public-beta**.

| Full P22 §  | Task                        | P22-beta?      | Notes                                          |
| ----------- | --------------------------- | -------------- | ---------------------------------------------- |
| 4.1 T-G1.1  | Gap inventory               | ✅ in P22-beta |                                                |
| 4.1 T-G1.2  | `packages/perf-harness/`    | ✅ in P22-beta |                                                |
| 4.1 T-G1.3  | Canvas FPS regression suite | ✅ in P22-beta |                                                |
| 4.1 T-G1.4  | CRDT convergence at scale   | ✅ in P22-beta |                                                |
| 4.1 T-G1.5  | Presenter 2-hour stability  | ✅ in P22-beta | (extended in P22b with frontier features)      |
| 4.1 T-G1.6  | DB query-plan review        | ✅ in P22-beta |                                                |
| 4.1 T-G1.7  | CDN plan                    | ✅ in P22-beta |                                                |
| 4.1 T-G1.8  | N+1 audit                   | ✅ in P22-beta |                                                |
| 4.1 T-G1.9  | Frontier perf verification  | ❌ P22b        | Needs F205–F219                                |
| 4.1 T-G1.10 | Cost model finalised        | ✅ in P22-beta | (frontier-feature unit economics land in P22b) |
| 4.2 T-G2.1  | SLO catalogue               | ✅ in P22-beta | (P21-service SLOs land in P22b)                |
| 4.2 T-G2.2  | Error budget policy         | ✅ in P22-beta |                                                |
| 4.2 T-G2.3  | Alert routing               | ✅ in P22-beta | (P21-service alerts land in P22b)              |
| 4.2 T-G2.4  | Runbook completeness        | ✅ in P22-beta | (P21-service runbooks land in P22b)            |
| 4.2 T-G2.5  | Dashboard coverage          | ✅ in P22-beta | (P21-service dashboards land in P22b)          |
| 4.2 T-G2.6  | Log redaction audit         | ✅ in P22-beta | (extends to biometric in P22b)                 |
| 4.2 T-G2.7  | Tracing coverage            | ✅ in P22-beta |                                                |
| 4.2 T-G2.8  | Post-mortem template        | ✅ in P22-beta |                                                |
| 4.2 T-G2.9  | Synthetic probes            | ✅ in P22-beta |                                                |
| 4.2 T-G2.10 | Status page wiring          | ✅ in P22-beta | (P21-service probes added in P22b)             |
| 4.3 T-G3.1  | k6 / Locust scripts         | ✅ in P22-beta | (kiosk + KG scripts added in P22b)             |
| 4.3 T-G3.2  | Load test staging           | ✅ in P22-beta |                                                |
| 4.3 T-G3.3  | Postgres failover           | ✅ in P22-beta |                                                |
| 4.3 T-G3.4  | NATS partition              | ✅ in P22-beta |                                                |
| 4.3 T-G3.5  | AI provider failure         | ✅ in P22-beta |                                                |
| 4.3 T-G3.6  | CDN outage                  | ✅ in P22-beta |                                                |
| 4.3 T-G3.7  | Regional isolation          | ✅ in P22-beta |                                                |
| 4.3 T-G3.8  | Biometric sandbox escape    | ❌ P22b        | Needs F207/F208/F209/F214                      |
| 4.3 T-G3.9  | Soak tests                  | ✅ in P22-beta | (kiosk 7-day soak in P22b)                     |
| 4.4 T-G4.1  | Accessibility audit scope   | ✅ in P22-beta | (extends to kiosk/ambient/replay in P22b)      |
| 4.4 T-G4.2  | Automated pass              | ✅ in P22-beta |                                                |
| 4.4 T-G4.3  | Manual keyboard pass        | ✅ in P22-beta |                                                |
| 4.4 T-G4.4  | Screen-reader pass          | ✅ in P22-beta |                                                |
| 4.4 T-G4.5  | WCAG 2.2 AA certification   | ✅ in P22-beta |                                                |
| 4.4 T-G4.6  | Bangla full UI              | ✅ in P22-beta |                                                |
| 4.4 T-G4.7  | RTL scaffolds               | ✅ in P22-beta |                                                |
| 4.4 T-G4.8  | Locale, timezone, currency  | ✅ in P22-beta |                                                |
| 4.5 T-G5.1  | External security review    | ✅ in P22-beta |                                                |
| 4.5 T-G5.2  | Penetration test            | ✅ in P22-beta |                                                |
| 4.5 T-G5.3  | SOC 2 evidence binder       | ✅ in P22-beta |                                                |
| 4.5 T-G5.4  | PDPA / GDPR binder          | ✅ in P22-beta |                                                |
| 4.5 T-G5.5  | Bangladesh compliance       | ✅ in P22-beta |                                                |
| 4.5 T-G5.6  | Support runbooks            | ✅ in P22-beta |                                                |
| 4.5 T-G5.7  | Pricing model               | ✅ in P22-beta |                                                |
| 4.5 T-G5.8  | Status page live            | ✅ in P22-beta |                                                |
| 4.5 T-G5.9  | On-call rotation            | ✅ in P22-beta |                                                |
| 4.5 T-G5.10 | RTO/RPO validated           | ✅ in P22-beta |                                                |
| 4.5 T-G5.11 | Design-partner migration    | ✅ in P22-beta |                                                |
| 4.5 T-G5.12 | Public-beta blog + demo     | ✅ in P22-beta |                                                |
| 4.5 T-G5.13 | Public-beta sign-off        | ✅ in P22-beta |                                                |
| 4.5 T-G5.14 | Public-beta cut             | ✅ in P22-beta |                                                |
| 4.6 T-G6.1  | Feature-doc completeness    | ✅ in P22-beta | (range #1–#204 only; P21 docs land in P21)     |
| 4.6 T-G6.2  | Demo completeness           | ✅ in P22-beta | (same range)                                   |
| 4.6 T-G6.3  | API reference               | ✅ in P22-beta | (same range)                                   |
| 4.6 T-G6.4  | Runbook completeness        | ✅ in P22-beta |                                                |
| 4.6 T-G6.5  | Onboarding guide            | ✅ in P22-beta |                                                |
| 4.6 T-G6.6  | Docs dashboard              | ✅ in P22-beta |                                                |

**Coverage:** ~70% of full P22 by task count, ~75% by effort. The remaining ~30% is P21-dependent frontier-feature hardening and lands in P22b after P21.

---

## 10. Definition of Done — **Public-beta gate**

P22-beta is **done** when _every_ box below is checked. The list is the gate for the public-beta flag to flip.

### 10.1 Performance & scale

- [ ] Nightly perf CI green for 14 consecutive nights.
- [ ] Canvas FPS regression suite in CI; zero perf regressions vs. baseline.
- [ ] CRDT convergence at 1k editors green.
- [ ] 2-hour presenter bench green on three reference machines (existing surfaces).
- [ ] DB query-plan review complete; top-20 hot queries indexed.
- [ ] CDN plan deployed with measured TTFB improvement.
- [ ] N+1 audit complete; identified patterns fixed at source.
- [ ] Cost model signed by Finance; per-tenant per-day unit economics reported for existing surfaces.

### 10.2 Reliability & observability

- [ ] SLO catalogue published; every existing service has an SLO.
- [ ] Error budget policy adopted; burn-rate alerts live.
- [ ] Every alert routes to a primary + secondary on-call; missing-routing gaps closed.
- [ ] Every alert has a runbook; every runbook has a tabletop test entry.
- [ ] Every existing service has a Grafana dashboard.
- [ ] Log redaction audit green; no raw voice transcripts / AI prompts / PII ever logged.
- [ ] Tracing coverage at 100% for user-facing root actions.
- [ ] Post-mortem template adopted; last 3 incidents triaged through it.
- [ ] Synthetic probes live in multiple regions.
- [ ] Status page public; all existing services monitored.

### 10.3 Load & chaos

- [ ] All k6 / Locust scripts in `infra/loadtest/` pass against scaled staging at design-partner scale (existing surfaces).
- [ ] 24-hour soak green with no memory leaks and no clock skew.
- [ ] Postgres failover drill: RTO ≤ 60 s, RPO = 0.
- [ ] NATS partition drill: no data loss on resume.
- [ ] AI provider failure drill: fallback within 5 s.
- [ ] CDN outage drill: core renders still served; status incident opens.
- [ ] Regional isolation drill: traffic shift within 30 s.
- [ ] RTO ≤ 1 h / RPO ≤ 15 min for tier-1 services validated by game day.

### 10.4 Accessibility & internationalization

- [ ] WCAG 2.2 AA certificate issued by external firm; stored at `docs/a11y/cert-WCAG-2.2-AA.md`.
- [ ] axe-core CI green on every existing surface; zero AA/AAA violations.
- [ ] Keyboard-only navigation recorded for every interactive existing surface.
- [ ] NVDA + VoiceOver pass recorded for editor, presenter, audience.
- [ ] Bangla UI shipping with numeral display policy enforced; RTL scaffolds ready for Arabic + Hebrew.
- [ ] Locale / currency / timezone coverage verified end-to-end (Dhaka vs. New York test).

### 10.5 Security & compliance

- [ ] External security review signed off; criticals / highs closed.
- [ ] Penetration test report action items closed.
- [ ] SOC 2 Type II evidence binder handed to auditor; observation period begins at public-beta cut.
- [ ] PDPA / GDPR binder finalised; DSR endpoints tested in staging.
- [ ] Bangladesh localisation compliance signed off by counsel; CII classification review complete.

### 10.6 Public-beta operational

- [ ] Pricing model approved; billing live with bKash / Nagad / card support (per market).
- [ ] Invoicing, dunning, refunds tested.
- [ ] Status page public and populated (existing services).
- [ ] On-call rotation staffed 24/7 with primary + secondary; escalation tree documented.
- [ ] Support runbooks complete for top 50 categories; tier-1/2/3 split + SLAs.
- [ ] Design-partner migration plan executed; BETA UI stripped per R10 decision.

### 10.7 Documentation completeness

- [ ] Every feature **#1–#204** has a doc at `/docs/features/{NN}-*.md`.
- [ ] Every existing-feature doc has a demo (video or written).
- [ ] Every existing endpoint documented at `/docs/api/`.
- [ ] Every runbook has an owner and a tabletop-pass entry.
- [ ] Onboarding guide exercises dev env, contracts, test pyramid, deploy path.

### 10.8 Sign-off

- [ ] Head of Engineering sign-off.
- [ ] Head of Product sign-off.
- [ ] Head of Security / DPO sign-off.
- [ ] Head of Design sign-off.
- [ ] Head of Support sign-off.
- [ ] Head of BD / PMM sign-off.
- [ ] Release captain flips the public-beta flag.

### 10.9 Post-public-beta stabilisation window

- [ ] 30-day stabilisation window begins; only critical fixes land.
- [ ] Incident review at day 30 informs the post-public-beta roadmap.
- [ ] P22b (P21-dependent hardening) is scheduled to begin within the stabilisation window.
