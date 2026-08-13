/**
 * Hardcoded data backing the public marketing landing page.
 *
 * Wave 12 §S12.1 — this module is the single source of truth for every
 * marketing string used by the home page. It lives in /lib (not
 * /components) so the data layer stays decoupled from React and can be
 * imported by future docs sites, marketing experiments, or email blasts.
 *
 * Shapes are exported as TypeScript types so the page, components, and
 * tests all share the same contract.
 */

export type FeatureCategory =
  | 'editor'
  | 'viewer'
  | 'presenter'
  | 'audience'
  | 'analytics'
  | 'marketplace'
  | 'enterprise'
  | 'agentic';

export interface FeatureCard {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly category: FeatureCategory;
}

export type PricingTierId = 'free' | 'pro' | 'enterprise';

export interface PricingTier {
  readonly id: PricingTierId;
  readonly name: string;
  readonly price_monthly_usd: number | null;
  readonly price_yearly_usd: number | null;
  readonly tagline: string;
  readonly features: ReadonlyArray<string>;
  readonly cta_label: string;
  readonly cta_href: string;
  readonly highlighted: boolean;
}

export interface FaqItem {
  readonly q: string;
  readonly a: string;
  readonly category: string;
}

export interface CustomerLogo {
  readonly name: string;
  readonly initials: string;
}

export const FEATURE_CATEGORIES: ReadonlyArray<{
  readonly id: FeatureCategory;
  readonly label: string;
  readonly tagline: string;
}> = [
  {
    id: 'editor',
    label: 'Editor',
    tagline: 'Build reactive decks with branching flows and live data.',
  },
  {
    id: 'viewer',
    label: 'Viewer',
    tagline: 'Ship read-only playback that embeds anywhere.',
  },
  {
    id: 'presenter',
    label: 'Presenter',
    tagline: 'Drive live sessions with prompts, polls, and handoffs.',
  },
  {
    id: 'audience',
    label: 'Audience',
    tagline: 'Mobile-first participation for everyone in the room.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    tagline: 'See what landed, what bounced, and what to fix next.',
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    tagline: 'Buy themes, sell assets, and grow a creator business.',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    tagline: 'SSO, audit, residency, and the controls large teams need.',
  },
  {
    id: 'agentic',
    label: 'Agentic',
    tagline: 'AI agents that act on your data with full oversight.',
  },
];

/**
 * Twelve feature cards per category × 8 categories = 24 features.
 * Each category contributes exactly 3 entries.
 */
export const FEATURES: ReadonlyArray<FeatureCard> = [
  // editor (3)
  {
    slug: 'real-time-canvas',
    title: 'Real-time canvas',
    description:
      'Edit slides collaboratively with CRDT-backed sync. Every keystroke and pointer move is reconciled across every client in under 80 ms.',
    icon: 'pencil',
    category: 'editor',
  },
  {
    slug: 'scenario-switching',
    title: 'Scenario switching',
    description:
      'Branch a deck into multiple scenarios driven by data. One source, many tailored narratives — no copy-paste slides.',
    icon: 'split',
    category: 'editor',
  },
  {
    slug: 'ai-copilot',
    title: 'AI copilot',
    description:
      'Ask for a slide, get a draft wired to your live data. The copilot never reaches the network without your explicit approval.',
    icon: 'sparkles',
    category: 'editor',
  },
  // viewer (3)
  {
    slug: 'scroll-mode',
    title: 'Scroll mode',
    description:
      'A scroll-driven viewer that feels like a long-form read. Drop a deck into a long article and the slides pace themselves.',
    icon: 'scroll',
    category: 'viewer',
  },
  {
    slug: 'embed-anywhere',
    title: 'Embed anywhere',
    description:
      'Drop a single iframe into Notion, Confluence, or a CMS. The embed figures out its own size and respects your consent banner.',
    icon: 'code',
    category: 'viewer',
  },
  {
    slug: 'consent-banner',
    title: 'Consent banner',
    description:
      'Pluggable consent flows for GDPR, CCPA, and PIPL. Block tracking pixels until the audience grants permission.',
    icon: 'shield',
    category: 'viewer',
  },
  // presenter (3)
  {
    slug: 'live-hud',
    title: 'Live HUD',
    description:
      'A presenter-only heads-up display showing latency, attendees, and engagement counts without leaving the slide.',
    icon: 'gauge',
    category: 'presenter',
  },
  {
    slug: 'qa-mode',
    title: 'Q&A mode',
    description:
      'Moderated audience questions that surface the highest-upvoted threads. Hand questions to a co-presenter in one keystroke.',
    icon: 'message',
    category: 'presenter',
  },
  {
    slug: 'polls',
    title: 'Live polls',
    description:
      'Multiple-choice, range, and free-text polls that write straight into your analytics warehouse — no chrome polls.',
    icon: 'bar-chart',
    category: 'presenter',
  },
  // audience (3)
  {
    slug: 'mobile-first',
    title: 'Mobile-first join',
    description:
      'Tap-to-join from any phone. No app download, no account — just a six-character code and a QR code.',
    icon: 'smartphone',
    category: 'audience',
  },
  {
    slug: 'qr-join',
    title: 'QR join',
    description:
      'Project a QR code on the room screen. Audience members scan and they are in the session in under a second.',
    icon: 'qr',
    category: 'audience',
  },
  {
    slug: 'real-time-sync',
    title: 'Real-time sync',
    description:
      'Slide changes, poll results, and annotations propagate to every device in the room with sub-second latency.',
    icon: 'refresh',
    category: 'audience',
  },
  // analytics (3)
  {
    slug: 'heatmap',
    title: 'Attention heatmap',
    description:
      'Per-slide heatmaps showing where attention spikes and drops. Compare decks side-by-side to spot winners.',
    icon: 'flame',
    category: 'analytics',
  },
  {
    slug: 'sentiment',
    title: 'Sentiment signals',
    description:
      'Aggregate sentiment from polls, reactions, and chat. Spot the slide that lost the room before you finish the talk.',
    icon: 'heart',
    category: 'analytics',
  },
  {
    slug: 'funnels',
    title: 'Funnel reports',
    description:
      'Track viewers from first impression through to CTA click. Funnels surface the slide that breaks the journey.',
    icon: 'filter',
    category: 'analytics',
  },
  // marketplace (3)
  {
    slug: 'theme-store',
    title: 'Theme store',
    description:
      'Buy and sell themes vetted by the Domio design team. Every theme is license-clean and a one-click install.',
    icon: 'palette',
    category: 'marketplace',
  },
  {
    slug: 'asset-store',
    title: 'Asset store',
    description:
      'Stock photos, icons, and data viz components from independent creators. Pay once, use everywhere in your workspace.',
    icon: 'image',
    category: 'marketplace',
  },
  {
    slug: 'creator-studio',
    title: 'Creator studio',
    description:
      'Listings, statements, payouts, and review replies in one console. Build a side business on top of Domio.',
    icon: 'store',
    category: 'marketplace',
  },
  // enterprise (3)
  {
    slug: 'sso',
    title: 'SSO + SCIM',
    description:
      'SAML, OIDC, and SCIM provisioning out of the box. Okta, Entra ID, and JumpCloud are pre-configured.',
    icon: 'lock',
    category: 'enterprise',
  },
  {
    slug: 'audit-logs',
    title: 'Audit logs',
    description:
      'Every viewer join, every export, every share link is logged with actor and IP. Stream to your SIEM in real time.',
    icon: 'file-text',
    category: 'enterprise',
  },
  {
    slug: 'data-residency',
    title: 'Data residency',
    description:
      'Pin deck and analytics data to US, EU, UK, or APAC regions. Residency is enforced at the row level, not just the cluster.',
    icon: 'globe',
    category: 'enterprise',
  },
  // agentic (3)
  {
    slug: 'tool-calls',
    title: 'Agent tool calls',
    description:
      'Connect Claude, GPT, or your own model to Domio through a typed tool surface. Agents can read, draft, and patch slides.',
    icon: 'wrench',
    category: 'agentic',
  },
  {
    slug: 'handoff-inspector',
    title: 'Handoff inspector',
    description:
      'Step through every agent action with a diff and an undo. Inspect what the model saw, decided, and changed.',
    icon: 'git-branch',
    category: 'agentic',
  },
  {
    slug: 'dry-run-preview',
    title: 'Dry-run preview',
    description:
      'Run a multi-step agent task in a sandbox first. See the resulting slides before you commit to the change.',
    icon: 'play',
    category: 'agentic',
  },
];

/**
 * Three pricing tiers: Free, Pro, Enterprise.
 *
 * The free tier is always $0. The pro tier charges monthly or yearly.
 * The enterprise tier is custom — prices are null and the CTA goes to
 * a sales contact.
 */
export const PRICING_TIERS: ReadonlyArray<PricingTier> = [
  {
    id: 'free',
    name: 'Free',
    price_monthly_usd: 0,
    price_yearly_usd: 0,
    tagline: 'For solo presenters exploring Domio for the first time.',
    features: [
      '1 active deck',
      '50 viewers per month',
      'Basic editor with 8 templates',
      'Viewer + scroll mode',
      'Community support',
      'Domio watermark on exports',
    ],
    cta_label: 'Start free',
    cta_href: '/signup',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price_monthly_usd: 19,
    price_yearly_usd: 190,
    tagline: 'For working teams that ship a deck every week.',
    features: [
      '50 active decks',
      '10,000 viewers per month',
      'Full editor with AI copilot',
      'Live sessions, polls, and Q&A',
      'Analytics: heatmaps, sentiment, funnels',
      'Marketplace themes and assets',
      'Email support, 24-hour response',
      'No Domio watermark',
    ],
    cta_label: 'Start 14-day trial',
    cta_href: '/signup?plan=pro',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly_usd: null,
    price_yearly_usd: null,
    tagline: 'For organizations with security, residency, and SLA needs.',
    features: [
      'Unlimited decks and viewers',
      'SSO, SCIM, and audit log streaming',
      'Data residency (US, EU, UK, APAC)',
      'Custom retention and legal hold',
      'MCP server and webhook delivery',
      'Dedicated customer success manager',
      '99.95% uptime SLA',
      'Custom contracts and invoicing',
    ],
    cta_label: 'Contact sales',
    cta_href: '/contact?plan=enterprise',
    highlighted: false,
  },
];

/**
 * Twenty-plus FAQs spanning pricing, security, integrations, support,
 * migration, data export, retention, GDPR, accessibility, mobile, offline,
 * custom branding, AI training, multi-region, API, rate limits, billing,
 * cancellation, SLAs, and version history.
 */
export const FAQS: ReadonlyArray<FaqItem> = [
  {
    q: 'How does Domio pricing work?',
    a: 'You pay per workspace, not per seat. The Free tier is forever free for one deck. Pro is $19/month or $190/year per workspace. Enterprise is custom with a sales contract.',
    category: 'pricing',
  },
  {
    q: 'Can I switch plans or cancel anytime?',
    a: 'Yes. You can upgrade or downgrade from the billing page at any time. Downgrades take effect at the end of the current billing period. You can cancel and keep access until the period ends.',
    category: 'pricing',
  },
  {
    q: 'What happens to my data if I downgrade or cancel?',
    a: 'Your decks are kept for 90 days after a downgrade or cancellation. You can re-activate or export every deck as PDF, PPTX, or HTML at any point during that window.',
    category: 'pricing',
  },
  {
    q: 'Is Domio SOC 2 and GDPR compliant?',
    a: 'Domio is SOC 2 Type II certified and GDPR compliant. We sign DPAs and offer EU SCCs as standard. Audit reports and the latest pen-test summary are available under NDA.',
    category: 'security',
  },
  {
    q: 'Where is my data stored?',
    a: 'By default, decks live in our US region. Enterprise customers can pin data to the US, EU, UK, or APAC. Residency is enforced at the row level in the database.',
    category: 'security',
  },
  {
    q: 'How does Domio handle retention and legal hold?',
    a: 'Workspace admins can set retention policies per deck. Legal hold freezes decks from deletion and audit logs forever, even when retention would otherwise purge them.',
    category: 'security',
  },
  {
    q: 'Which integrations are supported?',
    a: 'Slack, Microsoft Teams, Notion, Confluence, Salesforce, HubSpot, Snowflake, BigQuery, and webhooks for everything else. Enterprise plans expose a typed API and an MCP server.',
    category: 'integrations',
  },
  {
    q: 'What support channels are available?',
    a: 'Free users get community support on Discord. Pro users get email support with a 24-hour response SLA. Enterprise customers get a dedicated CSM and a private Slack channel.',
    category: 'support',
  },
  {
    q: 'How do I migrate from PowerPoint or Google Slides?',
    a: 'Use the importer on the dashboard — it pulls .pptx, .key, and Google Slides via OAuth. Themes are auto-mapped to the closest Domio template. The migration is reversible until you commit.',
    category: 'migration',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Export every deck as PDF, PPTX, HTML, or JSON. Analytics exports include per-slide heatmaps and per-viewer funnels. Enterprise plans can stream exports to S3 or GCS.',
    category: 'data export',
  },
  {
    q: 'How long are version histories kept?',
    a: 'On Pro, 90 days of version history with full restore. On Enterprise, version history is configurable — we have customers running 7 years of versions on cold storage.',
    category: 'version history',
  },
  {
    q: 'Does Domio work with screen readers and keyboard navigation?',
    a: 'Yes. The editor, viewer, and presenter all meet WCAG 2.2 AA. We publish a quarterly accessibility audit on the trust page and fix every high-impact issue within 30 days.',
    category: 'accessibility',
  },
  {
    q: 'Is there a mobile experience?',
    a: 'The viewer and join pages are designed mobile-first. The editor is desktop-only. The presenter runs on tablets but is not optimized for phones as a presenting device.',
    category: 'mobile',
  },
  {
    q: 'Does Domio work offline?',
    a: 'The viewer caches the current deck for offline playback. The editor and presenter require a connection — they surface queued edits and reconcile when the network returns.',
    category: 'offline',
  },
  {
    q: 'Can I rebrand the viewer and domain?',
    a: 'Pro users can swap logos, colors, and the viewer domain (deck.your-company.com). Enterprise users can add a full custom domain with a managed TLS certificate.',
    category: 'custom branding',
  },
  {
    q: 'Does Domio train AI on my decks?',
    a: 'No. Deck content is never used to train foundation models. Enterprise customers can opt into zero-retention mode where prompt + response are discarded after the call resolves.',
    category: 'AI training data',
  },
  {
    q: 'Where are model inference requests processed?',
    a: 'Copilot requests are routed to the data-residency region you selected. We never proxy inference to a third-party region. Inference is logged with a 30-day retention on Pro, configurable on Enterprise.',
    category: 'multi-region',
  },
  {
    q: 'Do I get API access?',
    a: 'Yes. Pro users get a workspace API token with 600 requests per minute. Enterprise plans get a server token with 6,000 RPM and a typed TypeScript client.',
    category: 'API access',
  },
  {
    q: 'What are the rate limits?',
    a: 'Pro: 600 RPM per workspace token, 10k requests per day. Enterprise: 6,000 RPM and configurable daily limits. Rate-limit headers are returned on every API response.',
    category: 'rate limits',
  },
  {
    q: 'How does billing work for mid-cycle plan changes?',
    a: 'Upgrades are pro-rated immediately. Downgrades take effect at the end of the current period and you keep your existing features until then.',
    category: 'billing changes',
  },
  {
    q: 'What is the cancellation flow?',
    a: 'From the billing page, click Cancel. You keep access until the end of the period, then your workspace moves to the Free tier. Your decks are kept for 90 days.',
    category: 'cancellation',
  },
  {
    q: 'What SLAs do you offer?',
    a: 'Pro: 99.9% uptime with a 10% credit if we miss. Enterprise: 99.95% uptime with a 25% credit, plus a defined RTO and RTO. Status page at status.domio.app.',
    category: 'SLAs',
  },
];

/**
 * Twelve customer logos rendered as initials. Order is intentional —
 * the strip reads enterprise → scale-up → startup from left to right.
 */
export const CUSTOMER_LOGOS: ReadonlyArray<CustomerLogo> = [
  { name: 'Helio Labs', initials: 'HL' },
  { name: 'Northwind', initials: 'NW' },
  { name: 'Vega Robotics', initials: 'VR' },
  { name: 'Atlas Health', initials: 'AH' },
  { name: 'Pinecone Capital', initials: 'PC' },
  { name: 'Lumen Studios', initials: 'LS' },
  { name: 'Orbit Logistics', initials: 'OL' },
  { name: 'Foundry Nine', initials: 'F9' },
  { name: 'Meridian Press', initials: 'MP' },
  { name: 'Quartz Energy', initials: 'QE' },
  { name: 'Beacon Edu', initials: 'BE' },
  { name: 'Driftwood', initials: 'DW' },
];
