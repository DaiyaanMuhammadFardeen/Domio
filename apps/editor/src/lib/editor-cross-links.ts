/**
 * editor-cross-links — typed cross-link registry for the editor rail.
 *
 * Per Wave 13 Phase C. Maps every EditorLeftTab id to 2-4 related
 * pages that surface adjacent concepts (docs, features, services).
 * Rendered beneath the active panel via `<PanelFooter>` so users
 * can navigate from a panel directly into the canonical docs
 * without a global re-route.
 *
 * Every `href` is produced by the typed `landing()` builder from
 * `@domio/ui` so paths stay canonical and port-aware.
 */

import { landing } from '@domio/ui';

export interface EditorCrossLink {
  readonly label: string;
  readonly href: string;
  readonly tagline?: string;
}

/**
 * Cross-links per panel id. Keys mirror the registry ids exactly:
 *   layers, insert, library, stickers, icons, theme-brand,
 *   canvas-controls, data-sources, filters, animations, connections,
 *   prototyping, device-frame, variables, deep-links, state-inspector,
 *   m6-quizzes, m6-leaderboard, m6-sequence, m8-audit, m8-nl-patch,
 *   m8-deck-diff, p12-copilot, m11-media, m11-licenses, m11-recording,
 *   marketplace, copilot-hub.
 *
 * The set is exhaustive: a missing key for a known panel id would
 * silently drop the related-links rail for that panel, so we list
 * every panel with at least 2 entries.
 */
export const EDITOR_CROSS_LINKS: Record<string, ReadonlyArray<EditorCrossLink>> = {
  layers: [
    {
      label: 'Layers & stacking',
      href: landing('docs', { slug: 'editor/layers' }),
      tagline: 'Z-order, groups, and isolation',
    },
    {
      label: 'Real-time canvas',
      href: landing('feature', { slug: 'real-time-canvas' }),
      tagline: 'How multi-cursor edits compose',
    },
  ],
  insert: [
    {
      label: 'Insert reference',
      href: landing('docs', { slug: 'editor/insert' }),
      tagline: 'Quick-add catalog',
    },
    {
      label: 'Library',
      href: landing('docs', { slug: 'editor/library' }),
      tagline: 'Reusable inserts across decks',
    },
  ],
  library: [
    {
      label: 'Library & assets',
      href: landing('docs', { slug: 'editor/library' }),
      tagline: 'Personal and team libraries',
    },
    {
      label: 'Marketplace',
      href: landing('feature', { slug: 'marketplace' }),
      tagline: 'Sell templates and themes',
    },
  ],
  stickers: [
    {
      label: 'Sticker packs',
      href: landing('docs', { slug: 'editor/stickers' }),
      tagline: 'Bundled and custom sticker packs',
    },
    {
      label: 'Iconography',
      href: landing('docs', { slug: 'editor/icons' }),
      tagline: 'When to reach for an icon instead',
    },
  ],
  icons: [
    {
      label: 'Iconography',
      href: landing('docs', { slug: 'editor/icons' }),
      tagline: 'Lucide-style icon catalog',
    },
    {
      label: 'Stickers',
      href: landing('docs', { slug: 'editor/stickers' }),
      tagline: 'Decorative graphics',
    },
  ],
  'theme-brand': [
    {
      label: 'Theme tokens',
      href: landing('docs', { slug: 'editor/theme-tokens' }),
      tagline: 'Tokens, themes, and brand kits',
    },
    {
      label: 'Theme store',
      href: landing('feature', { slug: 'theme-store' }),
      tagline: 'Buy and sell design tokens',
    },
  ],
  'canvas-controls': [
    {
      label: 'Canvas shortcuts',
      href: landing('docs', { slug: 'editor/canvas-shortcuts' }),
      tagline: 'Keyboard cheatsheet',
    },
    {
      label: 'Real-time canvas',
      href: landing('feature', { slug: 'real-time-canvas' }),
      tagline: 'Multi-cursor live editing',
    },
  ],
  'data-sources': [
    {
      label: 'Live data sources',
      href: landing('docs', { slug: 'editor/data-sources' }),
      tagline: 'Bind spreadsheets, APIs, warehouses',
    },
    {
      label: 'Filters',
      href: landing('docs', { slug: 'editor/filters' }),
      tagline: 'Slice the source data',
    },
  ],
  filters: [
    {
      label: 'Filters & segments',
      href: landing('docs', { slug: 'editor/filters' }),
      tagline: 'Filter bindings',
    },
    {
      label: 'Data sources',
      href: landing('docs', { slug: 'editor/data-sources' }),
      tagline: 'Connect before filtering',
    },
  ],
  animations: [
    {
      label: 'Animations reference',
      href: landing('docs', { slug: 'editor/animations' }),
      tagline: 'Entrances, transitions, choreography',
    },
    {
      label: 'Real-time canvas',
      href: landing('feature', { slug: 'real-time-canvas' }),
      tagline: 'Live multi-user playback',
    },
  ],
  connections: [
    {
      label: 'Connections & links',
      href: landing('docs', { slug: 'editor/connections' }),
      tagline: 'Element-to-element wiring',
    },
    {
      label: 'Variables',
      href: landing('docs', { slug: 'editor/variables' }),
      tagline: 'Pass state through connections',
    },
  ],
  prototyping: [
    {
      label: 'Prototyping flows',
      href: landing('docs', { slug: 'editor/prototyping' }),
      tagline: 'Branching prototypes',
    },
    {
      label: 'Connections',
      href: landing('docs', { slug: 'editor/connections' }),
      tagline: 'Wire interactions to elements',
    },
  ],
  'device-frame': [
    {
      label: 'Device frame',
      href: landing('docs', { slug: 'editor/device-frame' }),
      tagline: 'Frame mockups for presentations',
    },
    {
      label: 'Themes',
      href: landing('docs', { slug: 'editor/themes' }),
      tagline: 'Apply a brand to the frame',
    },
  ],
  variables: [
    {
      label: 'Variables',
      href: landing('docs', { slug: 'editor/variables' }),
      tagline: 'State and bindings',
    },
    {
      label: 'Connections',
      href: landing('docs', { slug: 'editor/connections' }),
      tagline: 'Write variables via flows',
    },
  ],
  'deep-links': [
    {
      label: 'Deep links',
      href: landing('docs', { slug: 'editor/deep-links' }),
      tagline: 'URL params and shared state',
    },
    {
      label: 'State inspector',
      href: landing('docs', { slug: 'editor/state-inspector' }),
      tagline: 'Inspect live state at runtime',
    },
  ],
  'state-inspector': [
    {
      label: 'State inspector',
      href: landing('docs', { slug: 'editor/state-inspector' }),
      tagline: 'Live variable watch',
    },
    {
      label: 'Variables',
      href: landing('docs', { slug: 'editor/variables' }),
      tagline: 'Define what you inspect',
    },
  ],
  'm6-quizzes': [
    {
      label: 'Audience quizzes',
      href: landing('docs', { slug: 'editor/quizzes' }),
      tagline: 'Build interactive quizzes',
    },
    {
      label: 'Leaderboard',
      href: landing('docs', { slug: 'editor/leaderboard' }),
      tagline: 'Score and rank the audience',
    },
  ],
  'm6-leaderboard': [
    {
      label: 'Leaderboard',
      href: landing('docs', { slug: 'editor/leaderboard' }),
      tagline: 'Live audience scoring',
    },
    {
      label: 'Quizzes',
      href: landing('docs', { slug: 'editor/quizzes' }),
      tagline: 'Source of leaderboard data',
    },
  ],
  'm6-sequence': [
    {
      label: 'Audience sequence',
      href: landing('docs', { slug: 'editor/sequence' }),
      tagline: 'Step-by-step guided flows',
    },
    {
      label: 'Prototyping',
      href: landing('docs', { slug: 'editor/prototyping' }),
      tagline: 'Underlying flow editor',
    },
  ],
  'm8-audit': [
    {
      label: 'Audit trail',
      href: landing('docs', { slug: 'editor/audit-trail' }),
      tagline: 'Every agent and human action',
    },
    {
      label: 'Trust & compliance',
      href: landing('feature', { slug: 'trust-compliance' }),
      tagline: 'SOC2-ready controls',
    },
  ],
  'm8-nl-patch': [
    {
      label: 'NL patches',
      href: landing('docs', { slug: 'editor/nl-patches' }),
      tagline: 'Edit decks with natural language',
    },
    {
      label: 'AI copilot',
      href: landing('feature', { slug: 'ai-copilot' }),
      tagline: 'All agentic surfaces',
    },
  ],
  'm8-deck-diff': [
    {
      label: 'Deck diffs',
      href: landing('docs', { slug: 'editor/deck-diff' }),
      tagline: 'Compare revisions side by side',
    },
    {
      label: 'Audit trail',
      href: landing('docs', { slug: 'editor/audit-trail' }),
      tagline: 'Who changed what, when',
    },
  ],
  'p12-copilot': [
    {
      label: 'AI copilot',
      href: landing('feature', { slug: 'ai-copilot' }),
      tagline: 'Agentic editing surfaces',
    },
    {
      label: 'NL patches',
      href: landing('docs', { slug: 'editor/nl-patches' }),
      tagline: 'Conversational edits',
    },
  ],
  'm11-media': [
    {
      label: 'Media uploads',
      href: landing('docs', { slug: 'editor/media' }),
      tagline: 'Video, audio, and images',
    },
    {
      label: 'Recording',
      href: landing('docs', { slug: 'editor/recording' }),
      tagline: 'Capture media inline',
    },
  ],
  'm11-licenses': [
    {
      label: 'Media licensing',
      href: landing('docs', { slug: 'editor/media-licensing' }),
      tagline: 'Rights and attribution',
    },
    {
      label: 'Marketplace',
      href: landing('feature', { slug: 'marketplace' }),
      tagline: 'Licensed templates and media',
    },
  ],
  'm11-recording': [
    {
      label: 'Recording',
      href: landing('docs', { slug: 'editor/recording' }),
      tagline: 'Capture narration and gestures',
    },
    {
      label: 'Media',
      href: landing('docs', { slug: 'editor/media' }),
      tagline: 'Manage recordings',
    },
  ],
  marketplace: [
    {
      label: 'Marketplace overview',
      href: landing('feature', { slug: 'marketplace' }),
      tagline: 'Buy and sell templates',
    },
    {
      label: 'Theme store',
      href: landing('feature', { slug: 'theme-store' }),
      tagline: 'Themes inside the marketplace',
    },
  ],
  'copilot-hub': [
    {
      label: 'AI copilot',
      href: landing('feature', { slug: 'ai-copilot' }),
      tagline: 'All agentic surfaces',
    },
    {
      label: 'Plugins SDK',
      href: landing('plugins-sdk'),
      tagline: 'Extend the copilot',
    },
  ],
};
