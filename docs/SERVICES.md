# Domio — Services catalog

> **Source of truth:** `services/` directory (84 entries). Derived from the
> filesystem; do not edit by hand — re-run the audit.
> **Last regenerated:** 2026-08-16.

## 1. Edge / gateways

| Service                  | Runtime | Purpose                                                       |
| ------------------------ | ------- | ------------------------------------------------------------- |
| `realtime-gateway`       | Go      | CRDT presence + WS presence; main realtime fan-out (gorilla/websocket + NATS). |
| `participant-ws-gateway` | Go      | Audience-facing WS gateway.                                   |
| `query-gateway`          | TS      | Unified query router for service mesh / REST.                 |
| `edge-pubsub`            | TS      | Region-aware pub/sub bridge.                                 |
| `embed-proxy`            | TS      | Sanitised iframe + oEmbed proxy.                             |
| `deep-link-svc`          | TS      | Generates and resolves shareable deep links.                  |
| `api`                    | TS      | App-level HTTP/gRPC facade (`apps/api/`).                     |

## 2. Control plane + core

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `control-plane`          | Modular HTTP/gRPC core, business modules, table-per-service in Postgres. |
| `registry`               | Service registry + capability discovery.                      |
| `theme`                  | Theme storage + design-token resolution.                      |
| `brand`                  | Brand-kit storage + URL-based auto-extraction.                |
| `font`                   | Font asset registry + custom font upload.                     |
| `license`                | License JWT issuance + verification.                          |
| `component-registry`     | Component / template registry.                                |
| `templates`              | Template authoring + versioning.                              |
| `lint`                   | Style linting (off-brand detection, contrast, accessibility). |
| `localization`           | Translation keys + locale-aware content.                      |
| `permission-engine`      | RBAC + ABAC resolver (own service, used by all).              |
| `audit`                  | Append-only audit log; CSV export, retention.                 |
| `share-api`              | Deck sharing + per-link visibility rules.                     |
| `library`                | Team slide library + auto-update propagation.                 |
| `merge-requests`         | Deck merge requests with visual diff.                         |
| `suggestions`            | Suggestion-mode edits (Google-Docs-style).                    |
| `expiry`                 | Content expiry policies + scanners.                           |
| `guests`                 | Guest collaborators with scoped, expiring access.             |
| `schema-migration`       | Live schema migration harness (online ALTER).                 |
| `live-marker`            | Author-time live markers for presenter replay.                |

## 3. Realtime + collaboration

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `collab`                 | Server-side collab cursor/selection fan-in.                   |
| `timeline-api`           | Presentation state timeline (replay events).                 |
| `annotation-engine`      | Pen / highlight / spotlight annotations during present.       |
| `prototype-runtime`      | Variable, conditional, hotspot & branching runtime (sliders, calculators). |
| `prototype-recorder`     | Records prototype playback events for replay.                 |
| `magic-move`             | Shared-element morph between slides.                          |
| `keyframes-svc`          | Animation keyframe manager + camera keyframes.                |
| `shader-registry`        | GLSL shader registry for particle + shader backgrounds.       |
| `physics`                | Physics-enabled element simulation.                           |

## 4. AI + agentic

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `ai-orchestrator`        | Core HTTP API for AI features.                                |
| `ai-adapters`            | Pluggable model provider adapters (Anthropic, OpenAI, etc.).  |
| `mcp-server`             | **Model Context Protocol** server — first-class agent surface. |
| `brand-extract` (worker) | URL → brand kit (colors, fonts, logo).                        |
| `theme-pair` (worker)    | Light/dark theme pair generator.                              |
| `ai-eval` (worker)       | AI eval harness for prompts / completions.                    |
| `data-analysis` (worker) | Data prep for live data binding.                              |
| `ingest-docs` (worker)   | Document ingestion for doc-to-deck.                           |

## 5. Live data + connectors

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `connector-framework`    | Connector SDK for Sheets / Airtable / Postgres / APIs.        |
| `scenario-manager`       | Multi-scenario (base/bull/bear) data switchers.               |
| `mock-data` (package)    | Realistic schema-aware fake data generator.                   |

## 6. Media + render + export

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `export-pipeline`        | Headless deck export (PDF, PPTX, MP4, GIF, printable).       |
| `asset-api`              | Object-store backed asset upload + retrieval.                 |
| `thumbnail`              | On-demand thumbnail rendering.                                |
| `video-pipeline`         | Video transcoding + captions + chaptering.                    |
| `audio` (package)        | Audio tracks + voiceover.                                     |
| `latex-render`           | Server-side LaTeX rendering.                                  |
| `code-sandbox`           | JS sandbox for runnable code blocks.                          |
| `cad-jobs`               | STEP/FBX → optimized web 3D conversion.                       |
| `ar-sessions`            | AR handoff (QR → on-device 3D).                               |
| `export-render` (worker) | Long-running export queue worker.                             |
| `handout-generator` (worker) | Notes / 4-up handout generation.                         |
| `scorm-packager` (worker)| SCORM packaging for LMS import.                               |

## 7. Presenter + audience

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `presenter-session`      | Presenter session state + handoff.                            |
| `participant-session`    | Audience-side session state.                                  |
| `audience`               | Audience aggregation + entrance tracking.                    |
| `phone-pairing`          | Phone-as-remote pairing (QR + bluetooth).                     |
| `session-coordinator`    | Cross-tier session fan-out (designer/presenter/audience).     |
| `annotation-engine`      | (also under collab) — live annotation sync.                   |
| `recording-orchestrator` | Multi-track recording + replay.                               |
| `attendance-logger`      | Attendance + engagement capture.                              |
| `poll-engine`            | Live polls + results charts.                                  |
| `qa-engine`              | Q&A with upvoting + anonymous.                                |
| `quiz-engine`            | Live quizzes with leaderboards.                               |
| `word-cloud-engine`      | Live word clouds.                                             |
| `reaction-broadcaster`   | Emoji reactions, broadcast at scale.                          |
| `nav-vote-collector`     | Audience-driven navigation voting.                            |
| `sentiment-collector`    | Slider sentiment inputs.                                      |
| `raise-hand-queue`       | Raise-hand queue for hybrid meetings.                         |
| `feedback-collector`     | Post-session CSAT per slide.                                  |
| `moderation-blocklist`   | Block-list moderation.                                        |
| `moderation-ml`          | ML-based moderation.                                          |
| `moderation-flagger` (worker) | Async moderator flagging.                                |
| `presentation-sequence`  | Authored sequence runtime.                                    |

## 8. Real-time audio / translation

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `stt-provider`           | Speech-to-text (provider-pluggable).                          |
| `mt-provider`            | Machine translation.                                          |
| `tts-provider`           | Text-to-speech.                                               |
| `translation-pipeline`   | Pipeline combining STT → MT → TTS for live captions.          |

## 9. Analytics + engagement

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `event-ingest`           | High-throughput event ingestion (Kafka).                      |
| `clickhouse-loader`      | Streams events from Kafka to ClickHouse.                      |
| `analytics-warehouse`    | Columnar warehouse + aggregations.                            |
| `sessionization`         | Session reconstruction.                                       |
| `viewer-identity`        | Identity resolution (identified / pseudonymous / anonymous).  |
| `heatmap-generator`      | Scroll-mode attention heatmaps.                               |
| `live-analytics`         | Live presenter HUD analytics.                                 |
| `team-analytics`         | Template/component engagement rankings.                       |
| `creator-analytics`      | Marketplace creator-side analytics.                           |
| `ab-assignment`          | A/B test deterministic splitter.                              |
| `ab-measurement`         | A/B measurement collector.                                    |
| `ab-statistics`          | Statistical significance calc.                                |
| `crm-sync`               | Salesforce / HubSpot / Pipedrive / Dynamics sync.             |
| `notification-dispatcher`| Sales-mode notifications (Slack/Teams/email/webhook/push).    |
| `benchmark`              | Cohort benchmark percentiles.                                 |
| `freshness-tracker` (worker) | Data freshness monitor.                                   |
| `refresh-scheduler` (worker) | Periodic data refresh.                                    |
| `session-archiver` (worker) | Long-term cold storage.                                   |

## 10. Commerce + marketplace

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `marketplace`            | Marketplace listings + transactions.                          |
| `marketplace-preview`    | Live preview rendering for listings.                          |
| `subscription-billing` (worker) | Recurring billing.                                    |
| `refund-processor` (worker)     | Refund flow.                                         |
| `payout-executor` (worker)      | Creator payouts.                                      |
| `fx-rate-cacher` (worker)       | FX rate cache.                                        |
| `kyc-poller` (worker)           | KYC status polling.                                   |
| `kyc-rescreen` (worker)         | Periodic KYC re-screening.                            |
| `billing` (admin)               | Billing admin (in admin-console).                     |

## 11. Enterprise + governance

| Service                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `accessibility-audit` (worker) | axe + manual audit pipeline.                          |
| `meeting-integration`    | Zoom / Meet / Teams native integration.                       |
| `calendar`               | Calendar integrations (deck = meeting asset).                 |
| `task-manager`           | Asana / Jira / Linear integration.                            |
| `obs-control-plane`      | SLO / alerting / status page control plane.                   |
| `sync` (worker)          | Cross-tenant sync worker.                                     |
| `diff-engine` (worker)   | Document diff orchestrator.                                   |
| `library-propagator` (worker) | Shared-slide update propagator.                          |

## 12. Cross-cutting packages worth knowing

| Package                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `canvas`                 | WebGL2/WebGPU/Canvas2D scene graph.                           |
| `schema`                 | Typed deck schema + JSON Schema codegen.                      |
| `yjs-shared`             | Shared CRDT bindings + presence.                              |
| `redact-pii`             | PII redaction at ingest.                                      |
| `web-security`           | CSP / cookie hardening for Next.js apps.                      |
| `audit-ts`               | Append-only audit outbox.                                     |
| `observability`          | OTel + Prometheus + structured logging.                       |
| `protocol`               | Wire protocol primitives.                                     |
| `model-adapter`          | Pluggable model provider adapter.                             |
| `prompt-registry`        | Prompt template registry.                                     |
| `agent-schema`           | MCP tool schemas.                                             |
| `signed-link-token`      | Signed share-link tokens.                                     |
| `decimal128`             | Decimal128 for financial calculations.                        |
| `easing`                 | Bezier easing curves.                                         |
| `animation-runtime`      | Animation runtime.                                            |
| `chart`                  | Chart components (50+ chart types).                           |
| `tokens`                 | Design-token system.                                          |
| `theme`                  | Theme resolution helpers.                                     |
| `deep-link`              | Deep-link encoding.                                           |
| `i18n`                   | Locale + RTL helpers.                                         |
| `sdk-ts`                 | Public TypeScript SDK.                                        |
| `api-client`             | Generated API client.                                         |
| `analytics-sdk`          | Event-tracking SDK.                                           |
| `components`             | Shared UI components.                                         |
| `session-code`           | 6-char session code generator.                                |
| `text-normalize`         | Unicode + i18n normalization.                                 |
| `recording`              | Recording primitives.                                         |
| `recording-extensions`   | Recording extension points.                                   |
| `object-store`           | S3 client wrapper.                                            |
| `video`                  | Video primitives.                                             |
| `audio`                  | Audio primitives.                                             |
| `physics`                | Physics primitives.                                           |
| `prototype-runtime`      | Prototype runtime (variables, conditionals).                  |
| `prototype-recorder`     | Prototype recorder.                                           |
| `mock-data`              | Mock data generator.                                          |
| `common`                 | Shared utilities.                                             |
| `ui`                     | UI primitives.                                                |
| `schema-prop`            | Prop schema helpers.                                          |

---

## 13. Where to go next

- `docs/ARCHITECTURE.md` — layered topology and contract rule.
- `docs/CONTRACTS.md` — wire format catalog.
- `docs/STATUS.md` — what is shipped vs. planned today.
