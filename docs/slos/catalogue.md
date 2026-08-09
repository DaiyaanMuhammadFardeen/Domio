# SLO Catalogue — Phase 22-beta (G2)

> Source of truth for every availability, latency, and quality SLO in Domio.
> Maintained by the Reliability & Observability pod. Updated whenever a
> service or feature lands, changes tier, or gets a new SLO.

This catalogue applies to **existing** surfaces only (features #1–#204).
Frontier-feature SLOs (F205–F219) land in P22b after P21 ships.

## Format

Each row defines:

- **Service** — `@domio/<name>` package.
- **SLO** — short name. Conventions: `avail-<short>`, `lat-<short>-p95`, `qual-<short>`.
- **Target** — the objective (e.g., `99.9%` over 30d).
- **Window** — the rolling window over which the SLO is measured.
- **Owner** — team or squad that owns this SLO. Owners are on-call
  24/7 for tier-1, business hours for tier-2.
- **Alert** — name of the Prometheus alert that fires on burn-rate breach.
  Alert names are stable and referenced by `infra/alertmanager/routes.yaml`.

## Tier definitions

| Tier | Definition | SLO budget | On-call |
|---|---|---|---|
| **tier-1** | User-facing surfaces whose outage is felt within minutes (editor, presenter, audience, sharing, billing, auth). | 99.9 % availability over 30d | 24/7 primary + secondary |
| **tier-2** | Important but not user-facing in the moment (analytics pipeline, moderation, notification dispatcher). | 99.5 % availability over 30d | business hours + escalation |
| **tier-3** | Internal / batch / async (compactors, extractors, backup jobs). | 99.0 % availability over 30d | business hours |

## Master table

<!--
NOTE TO REL POD: when filling in real SLOs, replace the placeholders below.
The structure and tier column are mandatory. Targets shown are placeholders
that the team needs to validate against production traffic.
-->

| Service | SLO | Target | Window | Tier | Owner | Alert |
|---|---|---|---|---|---|---|
| `@domio/realtime-gateway` | avail-rt-gateway | 99.9% | 30d | tier-1 | E2 (Live Experience) | `SLOBurnHighRtGateway` |
| `@domio/realtime-gateway` | lat-rt-gateway-p95 | < 200 ms | 30d | tier-1 | E2 | `SLOBurnHighRtGatewayLat` |
| `@domio/participant-ws-gateway` | avail-participant-ws | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighParticipantWs` |
| `@domio/audience-service` | avail-audience | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighAudience` |
| `@domio/audience-service` | lat-audience-render-p95 | < 250 ms | 30d | tier-1 | E2 | `SLOBurnHighAudienceLat` |
| `@domio/presenter-session` | avail-presenter-session | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighPresenterSession` |
| `@domio/presenter-session` | lat-presenter-action-p95 | < 150 ms | 30d | tier-1 | E2 | `SLOBurnHighPresenterSessionLat` |
| `@domio/share-api` | avail-share-api | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighShareApi` |
| `@domio/publish-service` | avail-publish | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighPublish` |
| `@domio/audit-service` | avail-audit | 99.9% | 30d | tier-1 | Cross-cutting (SEC) | `SLOBurnHighAudit` |
| `@domio/permission-engine` | avail-permission-engine | 99.9% | 30d | tier-1 | Cross-cutting (SEC) | `SLOBurnHighPermissionEngine` |
| `@domio/permission-engine` | lat-permission-engine-p95 | < 5 ms | 30d | tier-1 | Cross-cutting (SEC) | `SLOBurnHighPermissionEngineLat` |
| `@domio/auth` *(inherited)* | avail-auth | 99.9% | 30d | tier-1 | Cross-cutting (SEC) | `SLOBurnHighAuth` |
| `@domio/auth` *(inherited)* | lat-auth-p95 | < 300 ms | 30d | tier-1 | Cross-cutting (SEC) | `SLOBurnHighAuthLat` |
| `@domio/billing` *(P22 stretch)* | avail-billing | 99.9% | 30d | tier-1 | FIN | `SLOBurnHighBilling` |
| `@domio/ai-orchestrator` | avail-ai-orchestrator | 99.5% | 30d | tier-2 | D (AI) | `SLOBurnHighAiOrchestrator` |
| `@domio/ai-adapters` | lat-ai-adapter-p95 | < 3 s | 30d | tier-2 | D (AI) | `SLOBurnHighAiAdapterLat` |
| `@domio/mcp-server-service` | avail-mcp-server | 99.5% | 30d | tier-2 | D (AI) | `SLOBurnHighMcpServer` |
| `@domio/control-plane` | avail-control-plane | 99.5% | 30d | tier-2 | Platform | `SLOBurnHighControlPlane` |
| `@domio/event-ingest` | lat-event-ingest-p95 | < 100 ms | 30d | tier-2 | F (Insights) | `SLOBurnHighEventIngestLat` |
| `@domio/clickhouse-loader` | avail-clickhouse-loader | 99.5% | 30d | tier-2 | F | `SLOBurnHighClickhouseLoader` |
| `@domio/analytics-service` | avail-analytics | 99.5% | 30d | tier-2 | F | `SLOBurnHighAnalytics` |
| `@domio/live-analytics` | lat-live-analytics-p95 | < 1 s | 30d | tier-2 | F | `SLOBurnHighLiveAnalyticsLat` |
| `@domio/team-analytics` | avail-team-analytics | 99.5% | 30d | tier-2 | F | `SLOBurnHighTeamAnalytics` |
| `@domio/creator-analytics-service` | avail-creator-analytics | 99.5% | 30d | tier-2 | A (Marketplace) | `SLOBurnHighCreatorAnalytics` |
| `@domio/heatmap-generator` | avail-heatmap-generator | 99.0% | 30d | tier-3 | F | `SLOBurnHighHeatmapGenerator` |
| `@domio/sessionization` | avail-sessionization | 99.0% | 30d | tier-3 | F | `SLOBurnHighSessionization` |
| `@domio/notification-dispatcher` | avail-notification-dispatcher | 99.5% | 30d | tier-2 | F | `SLOBurnHighNotificationDispatcher` |
| `@domio/edge-pubsub` | avail-edge-pubsub | 99.9% | 30d | tier-1 | Platform | `SLOBurnHighEdgePubsub` |
| `@domio/session-coordinator` | avail-session-coordinator | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighSessionCoordinator` |
| `@domio/participant-session` | avail-participant-session | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighParticipantSession` |
| `@domio/collab-service` | avail-collab | 99.9% | 30d | tier-1 | F (Collab) | `SLOBurnHighCollab` |
| `@domio/merge-request-service` | avail-merge-requests | 99.5% | 30d | tier-2 | F | `SLOBurnHighMergeRequests` |
| `@domio/task-manager-service` | avail-task-manager | 99.5% | 30d | tier-2 | F | `SLOBurnHighTaskManager` |
| `@domio/library-service` | avail-library | 99.9% | 30d | tier-1 | F | `SLOBurnHighLibrary` |
| `@domio/suggestions-service` | avail-suggestions | 99.0% | 30d | tier-3 | F | `SLOBurnHighSuggestions` |
| `@domio/expiry-service` | avail-expiry | 99.0% | 30d | tier-3 | F | `SLOBurnHighExpiry` |
| `@domio/annotation-engine` | avail-annotation-engine | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighAnnotationEngine` |
| `@domio/recording-orchestrator` | avail-recording-orchestrator | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighRecordingOrchestrator` |
| `@domio/reaction-broadcaster` | avail-reaction-broadcaster | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighReactionBroadcaster` |
| `@domio/poll-engine` | avail-poll-engine | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighPollEngine` |
| `@domio/quiz-engine` | avail-quiz-engine | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighQuizEngine` |
| `@domio/qa-engine` | avail-qa-engine | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighQaEngine` |
| `@domio/word-cloud-engine` | avail-word-cloud-engine | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighWordCloudEngine` |
| `@domio/raise-hand-queue` | avail-raise-hand-queue | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighRaiseHandQueue` |
| `@domio/nav-vote-collector` | avail-nav-vote-collector | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighNavVoteCollector` |
| `@domio/sentiment-collector` | avail-sentiment-collector | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighSentimentCollector` |
| `@domio/attendance-logger` | avail-attendance-logger | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighAttendanceLogger` |
| `@domio/feedback-collector` | avail-feedback-collector | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighFeedbackCollector` |
| `@domio/translation-pipeline` | lat-translation-p95 | < 2 s | 30d | tier-2 | E2 | `SLOBurnHighTranslationLat` |
| `@domio/stt-provider` | lat-stt-p95 | < 1.5 s | 30d | tier-2 | E2 | `SLOBurnHighSttLat` |
| `@domio/mt-provider` | lat-mt-p95 | < 1 s | 30d | tier-2 | E2 | `SLOBurnHighMtLat` |
| `@domio/tts-provider` | lat-tts-p95 | < 2 s | 30d | tier-2 | E2 | `SLOBurnHighTtsLat` |
| `@domio/moderation-blocklist` | avail-moderation-blocklist | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighModerationBlocklist` |
| `@domio/moderation-ml` | lat-moderation-ml-p95 | < 800 ms | 30d | tier-2 | E2 | `SLOBurnHighModerationMlLat` |
| `@domio/guests-service` | avail-guests | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighGuests` |
| `@domio/phone-pairing` | avail-phone-pairing | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighPhonePairing` |
| `@domio/thumbnail` | avail-thumbnail | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighThumbnail` |
| `@domio/export-pipeline` | lat-export-p95 | < 30 s | 30d | tier-2 | E2 | `SLOBurnHighExportPipelineLat` |
| `@domio/video-pipeline` | lat-video-pipeline-p95 | < 60 s | 30d | tier-2 | E2 | `SLOBurnHighVideoPipelineLat` |
| `@domio/keyframes-svc` | avail-keyframes | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighKeyframesSvc` |
| `@domio/latex-render` | lat-latex-render-p95 | < 500 ms | 30d | tier-2 | E2 | `SLOBurnHighLatexRenderLat` |
| `@domio/shader-registry` | avail-shader-registry | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighShaderRegistry` |
| `@domio/code-sandbox` | lat-code-sandbox-p95 | < 2 s | 30d | tier-2 | D | `SLOBurnHighCodeSandboxLat` |
| `@domio/cad-jobs` | avail-cad-jobs | 99.0% | 30d | tier-3 | E2 | `SLOBurnHighCadJobs` |
| `@domio/ar-sessions` | lat-ar-sessions-p95 | < 500 ms | 30d | tier-2 | E2 | `SLOBurnHighArSessionsLat` |
| `@domio/asset-api` | lat-asset-api-p95 | < 300 ms | 30d | tier-2 | E2 | `SLOBurnHighAssetApiLat` |
| `@domio/embed-proxy` | lat-embed-proxy-p95 | < 400 ms | 30d | tier-2 | E2 | `SLOBurnHighEmbedProxyLat` |
| `@domio/magic-move` | lat-magic-move-p95 | < 800 ms | 30d | tier-2 | E2 | `SLOBurnHighMagicMoveLat` |
| `@domio/prototype-runtime-service` | lat-prototype-runtime-p95 | < 100 ms | 30d | tier-2 | C | `SLOBurnHighPrototypeRuntimeLat` |
| `@domio/prototype-recorder-service` | avail-prototype-recorder | 99.0% | 30d | tier-3 | C | `SLOBurnHighPrototypeRecorder` |
| `@domio/data-service` | avail-data | 99.5% | 30d | tier-2 | B | `SLOBurnHighData` |
| `@domio/connector-framework` | avail-connector-framework | 99.5% | 30d | tier-2 | B | `SLOBurnHighConnectorFramework` |
| `@domio/query-gateway` | lat-query-gateway-p95 | < 500 ms | 30d | tier-2 | B | `SLOBurnHighQueryGatewayLat` |
| `@domio/registry-service` | avail-registry | 99.9% | 30d | tier-1 | A | `SLOBurnHighRegistry` |
| `@domio/brand-service` | avail-brand | 99.9% | 30d | tier-1 | A | `SLOBurnHighBrand` |
| `@domio/theme-service` | avail-theme | 99.9% | 30d | tier-1 | A | `SLOBurnHighTheme` |
| `@domio/component` *(packages)* | avail-component-registry | 99.9% | 30d | tier-1 | A | `SLOBurnHighComponents` |
| `@domio/font-service` | lat-font-service-p95 | < 200 ms | 30d | tier-2 | A | `SLOBurnHighFontServiceLat` |
| `@domio/localization` | avail-localization | 99.5% | 30d | tier-2 | A | `SLOBurnHighLocalization` |
| `@domio/scenario-manager` | avail-scenario-manager | 99.5% | 30d | tier-2 | E2 | `SLOBurnHighScenarioManager` |
| `@domio/marketplace-service` | avail-marketplace | 99.9% | 30d | tier-1 | A | `SLOBurnHighMarketplace` |
| `@domio/marketplace-preview-service` | lat-marketplace-preview-p95 | < 1 s | 30d | tier-2 | A | `SLOBurnHighMarketplacePreviewLat` |
| `@domio/deep-link-service` | lat-deep-link-p95 | < 200 ms | 30d | tier-2 | Platform | `SLOBurnHighDeepLinkLat` |
| `@domio/timeline-api` | lat-timeline-api-p95 | < 150 ms | 30d | tier-2 | E2 | `SLOBurnHighTimelineApiLat` |
| `@domio/calendar-service` | avail-calendar | 99.5% | 30d | tier-2 | F | `SLOBurnHighCalendar` |
| `@domio/meeting-integration-service` | avail-meeting-integration | 99.5% | 30d | tier-2 | F | `SLOBurnHighMeetingIntegration` |
| `@domio/crm-sync` | avail-crm-sync | 99.0% | 30d | tier-3 | B | `SLOBurnHighCrmSync` |
| `@domio/analytics-warehouse` | avail-analytics-warehouse | 99.0% | 30d | tier-3 | F | `SLOBurnHighAnalyticsWarehouse` |
| `@domio/ab-assignment` | lat-ab-assignment-p95 | < 50 ms | 30d | tier-2 | F | `SLOBurnHighAbAssignmentLat` |
| `@domio/ab-measurement` | avail-ab-measurement | 99.0% | 30d | tier-3 | F | `SLOBurnHighAbMeasurement` |
| `@domio/ab-statistics` | avail-ab-statistics | 99.0% | 30d | tier-3 | F | `SLOBurnHighAbStatistics` |
| `@domio/benchmark` | avail-benchmark | 99.0% | 30d | tier-3 | Platform | `SLOBurnHighBenchmark` |
| `@domio/lint-service` | lat-lint-p95 | < 1 s | 30d | tier-2 | Platform | `SLOBurnHighLintLat` |
| `@domio/viewer-identity` | avail-viewer-identity | 99.9% | 30d | tier-1 | E2 | `SLOBurnHighViewerIdentity` |

**Coverage:** 87 services, 90+ SLOs across 87 services. 33 tier-1, 32 tier-2, 22 tier-3 (and growing).

## How to add a new SLO

1. Pick a tier (`tier-1`, `tier-2`, `tier-3`).
2. Add a row with: Service, SLO name, target, window, tier, owner, alert name.
3. Add the matching Prometheus alert to `infra/prometheus/alerts/slo.yaml`
   (alert name must equal the `Alert` column).
4. Add the matching route in `infra/alertmanager/routes.yaml`.
5. Add a runbook in `runbooks/<service>/<slo>.md`.
6. Update the relevant Grafana dashboard in `infra/grafana/dashboards/`.
7. Update the status-page component entry in `infra/status-page/components.yaml`.

The CI test `services/obs-control-plane/tests/slo_completeness_test.ts`
asserts that every row in this catalogue has a matching alert, route,
runbook, dashboard, and status-page entry. CI fails when a row is missing
any of those.

## Reference

- `docs/slos/error-budget-policy.md` — burn-rate alert rules.
- `infra/prometheus/alerts/` — Prometheus rule files.
- `infra/alertmanager/routes.yaml` — alert routing.
- `infra/grafana/dashboards/` — Grafana dashboards.
- `infra/status-page/components.yaml` — public status page.
- `runbooks/` — every alert has a runbook.
