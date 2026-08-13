/**
 * Hardcoded changelog data backing the public `/changelog` page.
 *
 * Wave 12 §S12.5 — single source of truth for release notes surfaced on
 * the marketing site. Each entry maps 1:1 to a card rendered by
 * `ReleaseEntry`, and the array is consumed in display order
 * (newest-first).
 *
 * Data lives under /lib (not /components) so it stays decoupled from
 * the React surface and can be re-used by future docs sites, RSS
 * feeds, or marketing experiments without dragging the rendering
 * surface along.
 */

export interface ChangelogEntry {
  readonly version: string;
  readonly date_iso: string;
  readonly highlights: ReadonlyArray<string>;
  readonly fixes?: ReadonlyArray<string>;
  readonly breaking_changes?: ReadonlyArray<string>;
  readonly migration_guide_href?: string;
}

/**
 * Release entries, newest-first. The order in this literal is the
 * order rendered on the page — do NOT sort at render time, that
 * would hide accidental mis-ordering. Tests in `changelog-data.test.ts`
 * assert the invariant.
 */
export const CHANGELOG: ReadonlyArray<ChangelogEntry> = [
  {
    version: '2.4.0',
    date_iso: '2026-08-01',
    highlights: [
      'AI listener — turn audience reactions into realtime sentiment cards',
      'Knowledge graph — connect slides, data, and tokens across decks',
      'Deck-to-podcast — auto-narrate a deck to a multi-host audio export',
      'Improved CRDT merge conflict surface in the editor inspector',
    ],
    fixes: [
      'Resolved a regression where voice handoff could drop after 12 minutes',
      'Fixed z-ordering on sticky tokens when scrolled into the slide stack',
    ],
  },
  {
    version: '2.3.0',
    date_iso: '2026-07-15',
    highlights: [
      'Marketplace — browse, install, and rate plugins and themes',
      'Creator console — publish listings, manage versions, and track payouts',
      'Theme marketplace — drop in coordinated typography and color packs',
      'New in-app review flow with screenshot capture and rating prompts',
    ],
    fixes: ['Prevented duplicate install prompts when refreshing the marketplace grid'],
  },
  {
    version: '2.2.0',
    date_iso: '2026-06-20',
    highlights: [
      'MCP server — expose deck operations to any MCP-compatible agent',
      'Webhooks — subscribe to slide, deck, and session events over HTTPS',
      'Tool-call audit — per-actor log of every agent invocation',
      'Scoped agent tokens with tenant-isolated permissions',
    ],
    fixes: [
      'Webhook deliveries now retry with exponential backoff (was: linear)',
      'MCP tool manifests refresh when the editor publishes a new schema',
    ],
    migration_guide_href: '/docs/migrations/2.1-to-2.2',
  },
  {
    version: '2.1.0',
    date_iso: '2026-05-30',
    highlights: [
      'Enterprise SSO — SAML 2.0 and OIDC with SCIM 2.0 provisioning',
      'Audit logs — immutable, exportable, and tenant-scoped event history',
      'Data residency — pin workspaces to EU, US, or APAC regions',
      'Custom retention windows per deck with legal-hold overrides',
    ],
    fixes: ['SCIM group sync no longer drops members on large directory pulls'],
    migration_guide_href: '/docs/migrations/2.0-to-2.1',
  },
  {
    version: '2.0.0',
    date_iso: '2026-04-10',
    highlights: [
      'General availability — Domio is out of beta',
      'New `/v1/decks` API surface with cursor pagination and ETags',
      'Rebuilt editor inspector with progressive disclosure and saved views',
      'Faster realtime sync via the new presence protocol',
    ],
    breaking_changes: [
      '`GET /v1/decks` returns a `{ data, next_cursor }` envelope — the legacy `decks[]` top-level array is removed',
      'Slide IDs are now opaque strings; numeric ids are no longer accepted on write paths',
      'OAuth refresh tokens rotate on every use; clients must handle 401-with-rotate',
    ],
    fixes: ['Editor no longer reflows the canvas when the inspector panel is collapsed'],
    migration_guide_href: '/docs/migrations/1.x-to-2.0',
  },
  {
    version: '1.9.0',
    date_iso: '2026-03-01',
    highlights: [
      'Analytics — benchmarks compare your deck against peers by industry and audience size',
      'Scheduled reports — email weekly or monthly PDF/CSV digests to stakeholders',
      'New funnel view surfaces drop-off between consecutive slides',
      'Cohort segmentation by acquisition channel and referrer',
    ],
    fixes: ['Heatmap tile requests no longer 503 during peak export windows'],
  },
  {
    version: '1.8.0',
    date_iso: '2026-02-10',
    highlights: [
      'Audience participation — live polls with bar, donut, and word-cloud results',
      'Q&A queue with upvoting, moderation, and pinned answers',
      'Two-way sliders — viewers steer a value and watch the deck react',
      'Per-slide participation metrics now stream to the dashboard',
    ],
    fixes: ['Poll results no longer flash stale values when the presenter advances'],
  },
  {
    version: '1.7.0',
    date_iso: '2026-01-15',
    highlights: [
      'Viewer scroll mode — paginated reading experience for long decks',
      'Embeds — drop a viewer into Notion, Confluence, or any iframe-able surface',
      'Consent banner — GDPR/CCPA-ready with region-aware copy and a reject-all path',
      'Per-deck share tokens with optional expiry and revocation',
    ],
    fixes: [
      'Scroll mode now preserves slide anchor links in shared URLs',
      'Consent banner focus trap restored after the v1.6 keyboard refactor',
    ],
  },
];
