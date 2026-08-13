/**
 * Hardcoded metadata for the Demo gallery (Wave 12 §S12.6).
 *
 * The gallery surfaces one tile per featured capability, each pointing at
 * a public viewer iframe plus an "open in editor" CTA so the marketing
 * site can drive adoption from a 30-second look-and-feel loop.
 *
 * `viewer_url` and `editor_url` are absolute URLs to the local dev hosts
 * (viewer :3200, editor :3100). They are constructed via the
 * `@domio/ui` routing helpers so the ports stay in sync with the rest of
 * the repo.
 */

import { localUrl } from '@domio/ui';

export interface DemoEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly feature_slug: string;
  readonly viewer_url: string;
  readonly editor_url: string;
  readonly thumbnail_alt: string;
  readonly tags: ReadonlyArray<string>;
}

/**
 * Stable, sorted set of tags surfaced as filter chips in the gallery.
 * Derived from `DEMOS` so it stays in sync.
 */
export const DEMO_TAGS: ReadonlyArray<string> = [
  'editor',
  'ai',
  'presenter',
  'audience',
  'sensor',
  'commerce',
  'knowledge',
];

function deckUrl(kind: 'viewer' | 'editor', deckId: string, panel?: string): string {
  if (kind === 'viewer') {
    return localUrl('viewer', `/${encodeURIComponent(deckId)}`);
  }
  const base = localUrl('editor', `/${encodeURIComponent(deckId)}`);
  return panel ? `${base}?panel=${encodeURIComponent(panel)}` : base;
}

export const DEMOS: ReadonlyArray<DemoEntry> = [
  {
    id: 'editor-canvas',
    title: 'Editor canvas',
    description:
      'Reactive canvas with live data bindings, branching flows, and brand-aware copy. Drag nodes, watch tokens propagate.',
    feature_slug: 'editor',
    viewer_url: deckUrl('viewer', 'demo-editor-canvas'),
    editor_url: deckUrl('editor', 'demo-editor-canvas', 'canvas'),
    thumbnail_alt: 'Editor canvas showing reactive nodes and live token bindings.',
    tags: ['editor'],
  },
  {
    id: 'scenario-toggle',
    title: 'Scenario toggle',
    description:
      'Switch a slide between three live scenarios — pricing tier, region, persona — and watch charts rebind instantly.',
    feature_slug: 'scenario-toggle',
    viewer_url: deckUrl('viewer', 'demo-scenario-toggle'),
    editor_url: deckUrl('editor', 'demo-scenario-toggle', 'scenarios'),
    thumbnail_alt: 'Scenario toggle bar cycling through pricing tiers.',
    tags: ['editor'],
  },
  {
    id: 'ai-copilot',
    title: 'AI copilot',
    description:
      'Ask in plain English, watch the copilot draft a slide outline, generate speaker notes, and propose chart bindings.',
    feature_slug: 'ai-copilot',
    viewer_url: deckUrl('viewer', 'demo-ai-copilot'),
    editor_url: deckUrl('editor', 'demo-ai-copilot', 'ai'),
    thumbnail_alt: 'AI copilot chat drafting a slide outline on the right rail.',
    tags: ['editor', 'ai'],
  },
  {
    id: 'presenter-live',
    title: 'Presenter live',
    description:
      'Run a live session with audience prompts, hand-offs, and offline-friendly rehearsals. Tokens keep presenters in lock-step.',
    feature_slug: 'presenter-live',
    viewer_url: deckUrl('viewer', 'demo-presenter-live'),
    editor_url: deckUrl('editor', 'demo-presenter-live', 'presenter'),
    thumbnail_alt: 'Live presenter view with countdown and audience pulse.',
    tags: ['presenter'],
  },
  {
    id: 'polls',
    title: 'Live polls',
    description:
      'Drop a poll into any slide. Watch responses stream into a live histogram and let the presenter steer the narrative.',
    feature_slug: 'polls',
    viewer_url: deckUrl('viewer', 'demo-polls'),
    editor_url: deckUrl('editor', 'demo-polls', 'polls'),
    thumbnail_alt: 'Audience poll results streaming into a histogram.',
    tags: ['presenter', 'audience'],
  },
  {
    id: 'two-way-slider',
    title: 'Two-way slider',
    description:
      'Let the audience drag a slider in real time — sentiment, forecast, or budget split — and bind it back into charts.',
    feature_slug: 'two-way-slider',
    viewer_url: deckUrl('viewer', 'demo-two-way-slider'),
    editor_url: deckUrl('editor', 'demo-two-way-slider', 'sliders'),
    thumbnail_alt: 'Two-way slider driving a live chart on slide three.',
    tags: ['presenter', 'audience'],
  },
  {
    id: 'voice-trigger',
    title: 'Voice trigger',
    description:
      'Configure phrases like "next slide" or "show sources" and let presenters advance with their voice while staying hands-free.',
    feature_slug: 'voice-trigger',
    viewer_url: deckUrl('viewer', 'demo-voice-trigger'),
    editor_url: deckUrl('editor', 'demo-voice-trigger', 'voice'),
    thumbnail_alt: 'Voice trigger transcript advancing slides via spoken phrases.',
    tags: ['sensor'],
  },
  {
    id: 'gaze-highlight',
    title: 'Gaze highlight',
    description:
      'Use webcam-based gaze tracking to highlight the region of the slide the audience is actually looking at.',
    feature_slug: 'gaze-highlight',
    viewer_url: deckUrl('viewer', 'demo-gaze-highlight'),
    editor_url: deckUrl('editor', 'demo-gaze-highlight', 'gaze'),
    thumbnail_alt: 'Gaze heatmap overlaid on a slide thumbnail.',
    tags: ['sensor'],
  },
  {
    id: 'gesture-control',
    title: 'Gesture control',
    description:
      'Swipe, point, and zoom with hand gestures. Useful for big-stage presentations where a clicker would be awkward.',
    feature_slug: 'gesture-control',
    viewer_url: deckUrl('viewer', 'demo-gesture-control'),
    editor_url: deckUrl('editor', 'demo-gesture-control', 'gesture'),
    thumbnail_alt: 'Hand gesture overlay advancing slides without a clicker.',
    tags: ['sensor'],
  },
  {
    id: 'kiosk',
    title: 'Kiosk mode',
    description:
      'Lock the viewer into an unattended kiosk — lobby screens, trade-show booths, retail demos — with auto-advance and recovery.',
    feature_slug: 'kiosk',
    viewer_url: deckUrl('viewer', 'demo-kiosk'),
    editor_url: deckUrl('editor', 'demo-kiosk', 'kiosk'),
    thumbnail_alt: 'Kiosk deck auto-advancing through a lobby screen loop.',
    tags: ['presenter'],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    description:
      'Browse, install, and rate community plugins — canvas nodes, data connectors, export formats — without leaving the editor.',
    feature_slug: 'marketplace',
    viewer_url: deckUrl('viewer', 'demo-marketplace'),
    editor_url: deckUrl('editor', 'demo-marketplace', 'marketplace'),
    thumbnail_alt: 'Marketplace grid showing featured plugins and ratings.',
    tags: ['commerce', 'editor'],
  },
  {
    id: 'knowledge-graph',
    title: 'Knowledge graph',
    description:
      'Visualise the entities, sources, and citations behind every claim on a slide. Click a node to trace the evidence chain.',
    feature_slug: 'knowledge-graph',
    viewer_url: deckUrl('viewer', 'demo-knowledge-graph'),
    editor_url: deckUrl('editor', 'demo-knowledge-graph', 'graph'),
    thumbnail_alt: 'Knowledge graph node with citation chain panel.',
    tags: ['knowledge', 'ai'],
  },
];