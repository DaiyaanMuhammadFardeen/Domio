/**
 * Feature deep-dive catalogue — Wave 12 §S12.2.
 *
 * Each entry powers one route under `/features/[slug]`:
 *   - the hero (title, tagline, hero_description)
 *   - the 30-second GIF demo placeholder
 *   - the tutorial step walkthrough
 *   - the related-features cross-link rail
 *   - the "Try it now" CTA href (`/signup?feature=<slug>`)
 *
 * The catalogue is sourced from `marketing-data.ts` (created in S12.1)
 * for the surface metadata (title, description, category, icon) and
 * augmented with the S12.2-specific narrative (tagline, steps,
 * related). When the upstream file is missing — e.g. during the early
 * hours of S12.2 before S12.1 lands — we fall back to a small local
 * seed so the route can still render without a hard dependency.
 */

import {
  FEATURES,
  type FeatureCard,
  type FeatureCategory,
} from './marketing-data';

export interface FeatureStep {
  readonly title: string;
  readonly description: string;
  readonly screenshot_alt: string;
}

export interface FeatureDetail {
  readonly slug: string;
  readonly title: string;
  readonly tagline: string;
  readonly hero_description: string;
  readonly category: FeatureCategory;
  readonly icon: string;
  readonly steps: ReadonlyArray<FeatureStep>;
  readonly related_slugs: ReadonlyArray<string>;
  /** /signup?feature=<slug> — built once so callers don't recompute. */
  readonly try_cta_href: string;
}

/* ------------------------------------------------------------------ */
/* Local fallback (used only if marketing-data.ts is unavailable).     */
/* ------------------------------------------------------------------ */

interface FallbackFeatureSeed {
  readonly slug: string;
  readonly title: string;
  readonly tagline: string;
  readonly category: FeatureCategory;
  readonly icon: string;
}

const FALLBACK_SEEDS: ReadonlyArray<FallbackFeatureSeed> = [
  {
    slug: 'real-time-canvas',
    title: 'Real-time canvas',
    tagline: 'CRDT-backed multi-cursor editing.',
    category: 'editor',
    icon: 'pencil',
  },
  {
    slug: 'scenario-switching',
    title: 'Scenario switching',
    tagline: 'Branch a deck into many tailored narratives.',
    category: 'editor',
    icon: 'split',
  },
  {
    slug: 'ai-copilot',
    title: 'AI copilot',
    tagline: 'Draft slides wired to your live data.',
    category: 'editor',
    icon: 'sparkles',
  },
  {
    slug: 'scroll-mode',
    title: 'Scroll mode',
    tagline: 'A scroll-driven viewer for long-form reads.',
    category: 'viewer',
    icon: 'scroll',
  },
  {
    slug: 'embed-anywhere',
    title: 'Embed anywhere',
    tagline: 'One iframe, every CMS.',
    category: 'viewer',
    icon: 'code',
  },
  {
    slug: 'consent-banner',
    title: 'Consent banner',
    tagline: 'Pluggable GDPR / CCPA / PIPL flows.',
    category: 'viewer',
    icon: 'shield',
  },
  {
    slug: 'live-hud',
    title: 'Live HUD',
    tagline: 'Presenter-only heads-up display.',
    category: 'presenter',
    icon: 'gauge',
  },
  {
    slug: 'qa-mode',
    title: 'Q&A mode',
    tagline: 'Moderated audience questions.',
    category: 'presenter',
    icon: 'message',
  },
  {
    slug: 'polls',
    title: 'Live polls',
    tagline: 'Polls that write straight to analytics.',
    category: 'presenter',
    icon: 'bar-chart',
  },
  {
    slug: 'mobile-first',
    title: 'Mobile-first join',
    tagline: 'Tap-to-join from any phone.',
    category: 'audience',
    icon: 'smartphone',
  },
  {
    slug: 'qr-join',
    title: 'QR join',
    tagline: 'Project, scan, present.',
    category: 'audience',
    icon: 'qr',
  },
  {
    slug: 'real-time-sync',
    title: 'Real-time sync',
    tagline: 'Sub-second slide propagation.',
    category: 'audience',
    icon: 'refresh',
  },
  {
    slug: 'heatmap',
    title: 'Attention heatmap',
    tagline: 'See where attention spikes.',
    category: 'analytics',
    icon: 'flame',
  },
  {
    slug: 'sentiment',
    title: 'Sentiment signals',
    tagline: 'Spot the slide that lost the room.',
    category: 'analytics',
    icon: 'heart',
  },
  {
    slug: 'funnels',
    title: 'Funnel reports',
    tagline: 'From first impression to CTA click.',
    category: 'analytics',
    icon: 'filter',
  },
  {
    slug: 'theme-store',
    title: 'Theme store',
    tagline: 'Vetted themes, one-click install.',
    category: 'marketplace',
    icon: 'palette',
  },
  {
    slug: 'asset-store',
    title: 'Asset store',
    tagline: 'Stock photos, icons, viz components.',
    category: 'marketplace',
    icon: 'image',
  },
  {
    slug: 'creator-studio',
    title: 'Creator studio',
    tagline: 'Listings, payouts, replies — in one console.',
    category: 'marketplace',
    icon: 'store',
  },
  {
    slug: 'sso',
    title: 'SSO + SCIM',
    tagline: 'Okta, Entra ID, JumpCloud — pre-configured.',
    category: 'enterprise',
    icon: 'lock',
  },
  {
    slug: 'audit-logs',
    title: 'Audit logs',
    tagline: 'Every action, streamed to your SIEM.',
    category: 'enterprise',
    icon: 'file-text',
  },
  {
    slug: 'data-residency',
    title: 'Data residency',
    tagline: 'Pin data to US, EU, UK, APAC.',
    category: 'enterprise',
    icon: 'globe',
  },
  {
    slug: 'tool-calls',
    title: 'Agent tool calls',
    tagline: 'Claude / GPT / your model — typed.',
    category: 'agentic',
    icon: 'wrench',
  },
  {
    slug: 'handoff-inspector',
    title: 'Handoff inspector',
    tagline: 'Step through every agent action.',
    category: 'agentic',
    icon: 'git-branch',
  },
  {
    slug: 'dry-run-preview',
    title: 'Dry-run preview',
    tagline: 'See the result before you commit.',
    category: 'agentic',
    icon: 'play',
  },
];

/* ------------------------------------------------------------------ */
/* Tutorial content (4-6 steps per feature).                            */
/* ------------------------------------------------------------------ */

interface StepTemplate {
  readonly title: string;
  readonly description: string;
  readonly screenshot_alt: string;
}

const GENERIC_STEPS: ReadonlyArray<StepTemplate> = [
  {
    title: 'Open the feature',
    description:
      'Navigate to the feature from the editor sidebar or the dashboard quick actions. The surface loads with sensible defaults so you can explore before configuring.',
    screenshot_alt: 'Feature surface loading with default configuration.',
  },
  {
    title: 'Configure your setup',
    description:
      'Pick the data source, theme, or workflow that matches your team. Every setting has an inline preview so you see the effect before you save.',
    screenshot_alt: 'Configuration panel with live preview.',
  },
  {
    title: 'Try it on a real deck',
    description:
      'Open an existing deck or start from a sample. The feature wires itself into your slide so you can see it in context.',
    screenshot_alt: 'Feature applied to a working slide.',
  },
  {
    title: 'Share with a teammate',
    description:
      'Send a share link or invite a co-editor. Multiplayer changes reconcile instantly — no refresh, no merge conflicts.',
    screenshot_alt: 'Share modal with collaborator picker.',
  },
  {
    title: 'Measure the outcome',
    description:
      'Open the analytics tab to see who saw the change, who engaged, and what to iterate next.',
    screenshot_alt: 'Analytics panel showing engagement metrics.',
  },
];

const STEPS_BY_CATEGORY: Readonly<Record<FeatureCategory, ReadonlyArray<StepTemplate>>> = {
  editor: [
    {
      title: 'Create or open a deck',
      description:
        'Start from a template, an existing deck, or a blank canvas. The editor opens in the sidebar you used last.',
      screenshot_alt: 'Editor with a fresh deck open in the sidebar.',
    },
    {
      title: 'Activate the feature',
      description:
        'Toggle the feature on from the canvas toolbar. The control respects your workspace defaults and your personal overrides.',
      screenshot_alt: 'Feature toggle highlighted in the toolbar.',
    },
    {
      title: 'Edit a slide',
      description:
        'Click any slide to bring it into focus. Edits reconcile across every collaborator in under 80 ms.',
      screenshot_alt: 'A slide being edited with two cursors visible.',
    },
    {
      title: 'Preview the result',
      description:
        'Switch to the preview tab to see the slide as your audience will. The preview is read-only and never touches production data.',
      screenshot_alt: 'Preview tab rendering the edited slide.',
    },
    {
      title: 'Publish',
      description:
        'Hit Publish to roll the change to your live deck. The version history captures the diff so you can revert in one click.',
      screenshot_alt: 'Publish confirmation dialog with diff summary.',
    },
  ],
  viewer: [
    {
      title: 'Pick a deck to share',
      description:
        'Open the deck you want to embed. The viewer generates a stable share link and an embed snippet in parallel.',
      screenshot_alt: 'Deck list with share controls highlighted.',
    },
    {
      title: 'Choose the embed style',
      description:
        'Switch between scroll mode, paginated mode, or a single-slide embed. The viewer adapts its size to the container.',
      screenshot_alt: 'Embed style picker with three layout options.',
    },
    {
      title: 'Copy the embed code',
      description:
        'Grab the iframe snippet or the JS embed. Both honor your consent banner and respect lazy-loading.',
      screenshot_alt: 'Embed code snippet with copy button.',
    },
    {
      title: 'Paste into your CMS',
      description:
        'Drop the snippet into Notion, Confluence, WordPress, or any HTML surface. The viewer figures out its own dimensions.',
      screenshot_alt: 'CMS editor with the Domio embed pasted.',
    },
    {
      title: 'Track engagement',
      description:
        'Watch the embed in the analytics tab. Per-slide attention and CTA clicks flow back to your dashboard.',
      screenshot_alt: 'Engagement dashboard for the embedded deck.',
    },
  ],
  presenter: [
    {
      title: 'Schedule or start a session',
      description:
        'Open the deck, then click Present. The presenter grabs a session token and broadcasts the URL to the room screen.',
      screenshot_alt: 'Present button launching a live session.',
    },
    {
      title: 'Activate the feature',
      description:
        'Toggle the feature from the presenter HUD. Each toggle ships with a hotkey so you can stay focused on the audience.',
      screenshot_alt: 'HUD with the feature toggle active.',
    },
    {
      title: 'Engage the audience',
      description:
        'Watch the audience join counter, the latency meter, and the engagement gauge update live as people react.',
      screenshot_alt: 'Live audience engagement indicators.',
    },
    {
      title: 'Wrap up gracefully',
      description:
        'Hand off to a co-presenter, drop a recap slide, or close the session. The audit log captures every transition.',
      screenshot_alt: 'Session wrap-up screen with handoff options.',
    },
  ],
  audience: [
    {
      title: 'Scan the join code',
      description:
        'Open the phone camera and aim at the QR code on the room screen. The join page opens in your default browser — no app download.',
      screenshot_alt: 'Phone scanning a QR code on a presentation screen.',
    },
    {
      title: 'Pick a display name',
      description:
        'Type a name (real or handle) and you are in. The session remembers your seat so re-joining is instant.',
      screenshot_alt: 'Join form with display name field.',
    },
    {
      title: 'See the slides live',
      description:
        'Slides advance in lock-step with the presenter. Pinch to zoom, tap to react, swipe to scrub back a slide.',
      screenshot_alt: 'Audience view showing the current slide.',
    },
    {
      title: 'React and respond',
      description:
        'Send reactions, answer polls, and ask questions without leaving the slide. Your input is anonymous by default.',
      screenshot_alt: 'Audience reaction tray open on a phone.',
    },
  ],
  analytics: [
    {
      title: 'Open the analytics tab',
      description:
        'From the dashboard, open the deck you want to inspect. The analytics tab defaults to the latest session.',
      screenshot_alt: 'Analytics tab opened for a specific deck.',
    },
    {
      title: 'Pick a metric',
      description:
        'Switch between heatmap, sentiment, and funnel views. Each view has its own filter bar so you can isolate the audience you care about.',
      screenshot_alt: 'Metric picker with heatmap, sentiment, and funnel.',
    },
    {
      title: 'Drill into a slide',
      description:
        'Click any slide in the chart to see who saw it, who bounced, and where attention spiked. The drill-down is instant — no page reload.',
      screenshot_alt: 'Slide drill-down showing per-viewer engagement.',
    },
    {
      title: 'Export or alert',
      description:
        'Export the report as CSV, schedule a weekly digest, or wire an alert when a key metric drops below threshold.',
      screenshot_alt: 'Export and alert configuration panel.',
    },
  ],
  marketplace: [
    {
      title: 'Browse the catalogue',
      description:
        'Open the marketplace and filter by category, price, or rating. Every listing includes a live preview so you know what you are buying.',
      screenshot_alt: 'Marketplace catalogue with filters applied.',
    },
    {
      title: 'Install to your workspace',
      description:
        'One-click install — themes and assets land in your workspace under a license-clean namespace. Plugins scope themselves to your permission model.',
      screenshot_alt: 'Install confirmation dialog with license summary.',
    },
    {
      title: 'Customize',
      description:
        'Edit colors, swap assets, or configure the plugin. Customizations stay in your workspace and never leak back to the marketplace.',
      screenshot_alt: 'Customization panel for an installed theme.',
    },
    {
      title: 'Share or sell',
      description:
        'If you are a creator, open Creator Studio to manage listings, payouts, and review replies from one console.',
      screenshot_alt: 'Creator Studio listing management view.',
    },
  ],
  enterprise: [
    {
      title: 'Connect your identity provider',
      description:
        'Pick SAML, OIDC, or SCIM. Okta, Entra ID, and JumpCloud ship as pre-configured templates so the connection takes minutes, not days.',
      screenshot_alt: 'Identity provider picker with Okta highlighted.',
    },
    {
      title: 'Map roles',
      description:
        'Map IdP groups to Domio roles. Role changes propagate via SCIM within seconds — no nightly sync, no stale permissions.',
      screenshot_alt: 'Role mapping table with group-to-role assignments.',
    },
    {
      title: 'Configure audit log streaming',
      description:
        'Point the audit log stream at your SIEM. Every viewer join, every export, every share link is logged with actor, IP, and timestamp.',
      screenshot_alt: 'Audit log streaming configuration with SIEM endpoint.',
    },
    {
      title: 'Set residency',
      description:
        'Pin data to US, EU, UK, or APAC. Residency is enforced at the row level in the database, not just the cluster.',
      screenshot_alt: 'Data residency picker with regional indicators.',
    },
    {
      title: 'Verify compliance',
      description:
        'Run the compliance report from the trust center. The report bundles SOC 2 evidence, pen-test summaries, and DPA references.',
      screenshot_alt: 'Compliance report generation dialog.',
    },
  ],
  agentic: [
    {
      title: 'Pick an agent',
      description:
        'Choose Claude, GPT, or your own model. The agent surface is typed end-to-end, so the model only sees the operations you allow.',
      screenshot_alt: 'Agent picker with model cards.',
    },
    {
      title: 'Draft the task',
      description:
        'Describe the slide change you want in natural language. The agent parses the task and proposes a plan before touching anything.',
      screenshot_alt: 'Task draft with proposed plan.',
    },
    {
      title: 'Dry-run in a sandbox',
      description:
        'Run the plan in a sandbox first. You see every slide the agent wants to change, with a diff and an undo button.',
      screenshot_alt: 'Sandbox preview showing proposed slide diffs.',
    },
    {
      title: 'Approve or edit',
      description:
        'Approve the plan as-is, edit it, or reject it. Every action is logged with the model that proposed it.',
      screenshot_alt: 'Approval panel with edit and reject buttons.',
    },
    {
      title: 'Inspect the result',
      description:
        'Open the handoff inspector to step through what the model saw, decided, and changed. Revert any step in one click.',
      screenshot_alt: 'Handoff inspector timeline view.',
    },
  ],
};

const TUTORIAL_STEP_COUNT = 5;

/* ------------------------------------------------------------------ */
/* Related features (2-4 per feature, deterministic by category).     */
/* ------------------------------------------------------------------ */

const RELATED_BY_CATEGORY: Readonly<Record<FeatureCategory, ReadonlyArray<string>>> = {
  editor: ['scenario-switching', 'real-time-canvas', 'ai-copilot'],
  viewer: ['scroll-mode', 'embed-anywhere', 'consent-banner'],
  presenter: ['qa-mode', 'live-hud', 'polls'],
  audience: ['qr-join', 'real-time-sync', 'mobile-first'],
  analytics: ['heatmap', 'sentiment', 'funnels'],
  marketplace: ['theme-store', 'asset-store', 'creator-studio'],
  enterprise: ['sso', 'audit-logs', 'data-residency'],
  agentic: ['tool-calls', 'handoff-inspector', 'dry-run-preview'],
};

/* ------------------------------------------------------------------ */
/* Catalogue construction                                              */
/* ------------------------------------------------------------------ */

function pickSteps(category: FeatureCategory): ReadonlyArray<StepTemplate> {
  return STEPS_BY_CATEGORY[category] ?? GENERIC_STEPS;
}

function pickRelated(
  category: FeatureCategory,
  selfSlug: string,
): ReadonlyArray<string> {
  const siblings = RELATED_BY_CATEGORY[category] ?? [];
  return siblings.filter((slug) => slug !== selfSlug).slice(0, 4);
}

function heroDescriptionFor(title: string, tagline: string): string {
  return `${title} — ${tagline}. Walk through a 30-second demo, follow the tutorial, and try it on your own deck in under a minute.`;
}

function buildDetail(card: FeatureCard): FeatureDetail {
  const steps = pickSteps(card.category);
  const related = pickRelated(card.category, card.slug);
  // Trim or pad the steps so every feature lands within the 4-6 range.
  const trimmed = steps.slice(0, Math.min(Math.max(steps.length, 4), 6));
  const tagline = card.description.slice(0, 80);
  const hero_description = heroDescriptionFor(card.title, tagline);
  return {
    slug: card.slug,
    title: card.title,
    tagline,
    hero_description,
    category: card.category,
    icon: card.icon,
    steps: trimmed.slice(0, TUTORIAL_STEP_COUNT),
    related_slugs: related,
    try_cta_href: `/signup?feature=${encodeURIComponent(card.slug)}`,
  };
}

function fromMarketingData(): ReadonlyArray<FeatureDetail> {
  return FEATURES.map(buildDetail);
}

function fromFallback(): ReadonlyArray<FeatureDetail> {
  return FALLBACK_SEEDS.map((seed) => {
    const steps = pickSteps(seed.category).slice(0, TUTORIAL_STEP_COUNT);
    const related = pickRelated(seed.category, seed.slug);
    return {
      slug: seed.slug,
      title: seed.title,
      tagline: seed.tagline,
      hero_description: heroDescriptionFor(seed.title, seed.tagline),
      category: seed.category,
      icon: seed.icon,
      steps,
      related_slugs: related,
      try_cta_href: `/signup?feature=${encodeURIComponent(seed.slug)}`,
    } satisfies FeatureDetail;
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const CATALOGUE: ReadonlyArray<FeatureDetail> =
  FEATURES.length > 0 ? fromMarketingData() : fromFallback();

const CATALOGUE_BY_SLUG: ReadonlyMap<string, FeatureDetail> = new Map(
  CATALOGUE.map((detail) => [detail.slug, detail]),
);

export function getFeature(slug: string): FeatureDetail | null {
  return CATALOGUE_BY_SLUG.get(slug) ?? null;
}

export function listAllFeatures(): ReadonlyArray<FeatureDetail> {
  return CATALOGUE;
}
