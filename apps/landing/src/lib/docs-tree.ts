/**
 * Static documentation tree backing the public docs site.
 *
 * Per Wave 12 §S12.4, the marketing app hosts a /docs route powered by
 * a Next 15 catch-all segment. The catch-all resolves a `DocsSection`
 * plus `DocsPage` pair from this tree, then renders the markdown body
 * through the docs route components.
 *
 * This file is the single source of truth — every section exposes at
 * least five pages so the sidebar stays dense and the search index
 * covers every documented surface.
 */

export interface DocsPage {
  readonly slug: string;
  readonly title: string;
  readonly body_md: string;
}

export interface DocsSection {
  readonly id: string;
  readonly title: string;
  readonly pages: ReadonlyArray<DocsPage>;
}

/**
 * Helper for terse stub pages. Keeps each page declaration to a single
 * line of meaningful copy while still satisfying the `DocsPage` shape.
 */
function page(slug: string, title: string, body_md: string): DocsPage {
  return { slug, title, body_md };
}

/**
 * Twelve top-level sections, each with five or more stub pages. The
 * shape and the order mirror the sidebar expected by the docs route.
 */
export const DOCS_TREE: ReadonlyArray<DocsSection> = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    pages: [
      page(
        'index',
        'Introduction',
        'Welcome to Domio. This guide walks you through your first reactive deck, from signing in to publishing a share link. You will learn the core vocabulary — slides, scenes, data sources, and bindings — and meet the editor, viewer, and presenter surfaces you will spend the rest of your time in.\n\nDomio is a single workspace for authoring interactive decks, driving live sessions, and broadcasting to audiences. Whether you are building a pitch, a product walkthrough, or a training programme, the same primitives apply.',
      ),
      page(
        'install',
        'Install the CLI',
        'The `deckctl` CLI is the fastest way to script decks from your terminal. Install it on macOS, Linux, or Windows with the package manager you already use.\n\nOnce installed, run `deckctl --version` to confirm the binary is on your PATH, then `deckctl login` to authenticate against your Domio workspace.',
      ),
      page(
        'first-deck',
        'Your first deck',
        'Open the editor, hit ⌘N to scaffold a fresh deck, and drop in your first scene. Scenes are the atomic unit of a Domio deck — each one is a reactive surface that re-evaluates when its data sources change.\n\nBy the end of this guide you will have a three-scene deck with one data-bound chart and a live share link you can send to a teammate.',
      ),
      page(
        'workspaces',
        'Workspaces & permissions',
        'Every Domio deck lives inside a workspace. Workspaces have members, roles, and a billing seat. Roles map to the actions you can take — Owners manage members, Editors author decks, Presenters drive sessions, and Viewers watch recordings.',
      ),
      page(
        'key-concepts',
        'Key concepts',
        'Before you build anything serious, internalise four ideas: decks are trees of scenes, scenes are reactive graphs, data sources are first-class, and bindings are how you wire data into copy. The rest of the documentation assumes these are second nature.',
      ),
      page(
        'next-steps',
        'Next steps',
        'When you have finished the quickstart, jump to the Editor guide for a tour of the canvas, the Viewer guide for embedding and analytics, or the AI guide to learn how agents assist with authoring.',
      ),
    ],
  },
  {
    id: 'editor',
    title: 'Editor',
    pages: [
      page(
        'index',
        'Editor overview',
        'The editor is a reactive canvas. You build scenes by dropping nodes onto a grid, wire them to data sources, and let the reactive runtime keep everything in sync. Every node knows how to render itself, how to react to changes, and how to participate in branching flows.',
      ),
      page(
        'canvas',
        'Canvas & nodes',
        'The canvas is a pan-and-zoom surface that hosts scenes. Each scene is composed of nodes — text, images, charts, embeds, and custom plugin nodes. Drag a node from the palette onto the canvas to add it; drag its handles to resize or restructure.',
      ),
      page(
        'data-sources',
        'Data sources',
        'Data sources are how your scenes stay current. Point a source at a CSV, a Notion database, a REST endpoint, or a streaming pipeline, and the canvas re-renders the moment the source emits a new value. Sources are typed and versioned so bindings can refuse to compile when the shape changes.',
      ),
      page(
        'bindings',
        'Bindings & expressions',
        'Bindings connect data sources to nodes. Use the `{{ ... }}` expression language to interpolate values, call helpers, or compose complex text. The expression editor surfaces completions and type errors as you type.',
      ),
      page(
        'shortcuts',
        'Keyboard shortcuts',
        'Master a handful of shortcuts and the editor starts to feel like an instrument. ⌘K opens the command palette, ⌘D duplicates the selection, ⌘/ toggles a comment, and ⌘⇧P previews the scene as your audience will see it.',
      ),
      page(
        'versioning',
        'Versioning & drafts',
        'Every save creates a draft. Promote a draft to publish when you are happy; drafts let you experiment without disturbing the live deck. The version history is searchable and supports diffing between any two revisions.',
      ),
    ],
  },
  {
    id: 'viewer',
    title: 'Viewer',
    pages: [
      page(
        'index',
        'Viewer overview',
        'The viewer is the read-only playback surface. Viewers can step through scenes at their own pace, follow branching flows, and reach interactive embeds without ever needing an account. Embed the viewer in any iframe-friendly host.',
      ),
      page(
        'embed',
        'Embedding a deck',
        'Drop a single `<iframe>` onto your page and point it at the share URL Domio gives you. The viewer is responsive, supports dark mode, and exposes a small JS API for cross-frame messaging if you need to drive it from the host page.',
      ),
      page(
        'branches',
        'Branching flows',
        'When a scene includes a choice node, the viewer renders a branch picker and routes the audience down the path they select. Branches are first-class in the editor — you design them with the same primitives as every other scene.',
      ),
      page(
        'offline',
        'Offline playback',
        'Viewers cache the latest published snapshot in IndexedDB, so a deck you have loaded once will continue to play offline. The viewer surfaces a small banner when it detects it is serving cached content.',
      ),
      page(
        'theming',
        'Theming viewers',
        'Override the viewer theme by passing a `theme` query parameter or by hosting a CSS file that redefines the documented custom properties. Theming is fully decoupled from the editor, so authors and consumers never collide.',
      ),
    ],
  },
  {
    id: 'presenter',
    title: 'Presenter',
    pages: [
      page(
        'index',
        'Presenter overview',
        'The presenter app drives live sessions. Presenters advance scenes, monitor audience prompts, and hand off control to co-presenters — all from a single window that is resilient to network blips.',
      ),
      page(
        'live-mode',
        'Live mode',
        'Live mode keeps the presenter view and every connected viewer in lock-step. Presenters see what the audience sees, plus presenter-only notes, a countdown, and the next-scene preview.',
      ),
      page(
        'rehearsals',
        'Rehearsals',
        'Run a private rehearsal before going live. Rehearsals capture timing data — per-scene dwell, audience fall-off, and your transitions — and surface them as a report you can review offline.',
      ),
      page(
        'handoff',
        'Hand-off & co-presenters',
        'Invite a co-presenter to drive a specific section of the deck. The handoff is explicit, reversible, and survives flaky connections thanks to the offline cache.',
      ),
      page(
        'teleprompter',
        'Teleprompter',
        'The teleprompter overlay surfaces speaker notes for the current scene without leaking them to the audience. Notes can be authored inline in the editor or imported from a Markdown file.',
      ),
    ],
  },
  {
    id: 'audience',
    title: 'Audience',
    pages: [
      page(
        'index',
        'Audience overview',
        'Audience participation turns a one-way deck into a conversation. Polls, prompts, and reactions surface in the presenter view in real time, so you can adjust your run-of-show on the fly.',
      ),
      page(
        'polls',
        'Polls',
        'Drop a poll node onto a scene to capture audience sentiment. Polls are anonymous by default, can be timed, and accumulate results into the analytics pipeline for post-session review.',
      ),
      page(
        'prompts',
        'Open prompts',
        'Open prompts invite free-form audience responses. The presenter view surfaces a curated stream of responses, with built-in moderation tools so you never lose control of the room.',
      ),
      page(
        'reactions',
        'Reactions',
        'Reactions are lightweight one-tap signals — applause, laugh, surprise, confusion. They are aggregated server-side and rendered as a small chart in the analytics dashboard.',
      ),
      page(
        'moderation',
        'Moderation',
        'Moderation tools let the presenter pause submissions, hide individual responses, or hand moderation to a co-host. All moderation actions are logged for the post-session report.',
      ),
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing',
    pages: [
      page(
        'index',
        'Sharing overview',
        'Every deck has a share model. Share links can be public, link-only, password-protected, or scoped to a domain. Permissions are inherited from the workspace but can be tightened per-share.',
      ),
      page(
        'public-links',
        'Public links',
        'Public links let anyone with the URL open the deck. Use them for marketing pages, product walk-throughs, or recruiting loops where the deck is intentionally open to the world.',
      ),
      page(
        'passwords',
        'Password-protected shares',
        'Add a passphrase on top of any share link. Password-protected shares are rate-limited and audited, and the passphrase is rotated when the share is regenerated.',
      ),
      page(
        'domains',
        'Domain-restricted shares',
        'Restrict a share to a list of email domains. Useful for circulating an internal deck to contractors without giving them access to the rest of the workspace.',
      ),
      page(
        'expiry',
        'Expiry & revocation',
        'Shares can expire on a date or after N views. Revoke a share at any time and every existing viewer is cut off at the next reconnect.',
      ),
    ],
  },
  {
    id: 'ai',
    title: 'AI',
    pages: [
      page(
        'index',
        'AI overview',
        'Domio ships an agent-first authoring surface. Agents can propose scenes, generate bindings, summarise feedback, and operate the editor end-to-end via the same primitives human authors use.',
      ),
      page(
        'assist',
        'Inline assist',
        'Highlight any text node and ask the assistant to rewrite, shorten, or translate. The assistant respects the surrounding context — bindings, tone, and audience — so its suggestions drop in cleanly.',
      ),
      page(
        'scene-builder',
        'Scene builder agent',
        'Describe the scene you want in a sentence and the Scene Builder agent scaffolds the nodes, wires the data sources, and proposes a thumbnail. You stay in control of every edit the agent proposes.',
      ),
      page(
        'feedback',
        'Feedback synthesis',
        'After a live session, the Feedback agent clusters audience responses into themes and surfaces the most actionable ones. The synthesis is auditable so you can inspect the raw responses behind any cluster.',
      ),
      page(
        'safety',
        'Safety & review',
        'Every agent action is proposed, not applied. Authors see a diff and approve, edit, or discard before anything lands in the deck. The audit log is searchable and exportable.',
      ),
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    pages: [
      page(
        'index',
        'Analytics overview',
        'Domio analytics answer one question: how did the audience actually experience the deck? You get per-scene dwell, fall-off, poll responses, and a heatmap of audience interactions.',
      ),
      page(
        'dwell',
        'Per-scene dwell',
        'Dwell time tells you how long the audience spent on each scene. Use it to find scenes that over-stay their welcome or scenes that need more breathing room.',
      ),
      page(
        'falloff',
        'Fall-off curve',
        'The fall-off curve plots how many viewers were still watching at each scene boundary. Steep drops point at pacing problems; flat curves mean the audience is with you.',
      ),
      page(
        'polls-reactions',
        'Polls & reactions',
        'Aggregate poll results and reaction charts land here the moment a session ends. Cross-tabulate against dwell to find the scenes that resonated.',
      ),
      page(
        'export',
        'Exporting analytics',
        'Export raw analytics as CSV or JSON, or pipe them into your warehouse via the API. Exports are signed and time-limited.',
      ),
    ],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    pages: [
      page(
        'index',
        'Marketplace overview',
        'The marketplace hosts plugins, templates, and data connectors built by the community and by Domio. Every listing is reviewed before it goes live and ships with a clear licence.',
      ),
      page(
        'browse',
        'Browse listings',
        'Browse the catalogue by category, by rating, or by install count. Every listing page shows screenshots, a changelog, and the permissions the plugin requests.',
      ),
      page(
        'install',
        'Install a plugin',
        'Click Install on any listing to add the plugin to your workspace. Installs are versioned, so rolling back is always one click away.',
      ),
      page(
        'templates',
        'Templates',
        'Templates are decks you can clone. They ship with sample scenes, sample data sources, and a README that explains how the pieces fit together.',
      ),
      page(
        'submit',
        'Submit a listing',
        'Developers can submit plugins and templates for review. The review checklist covers security, privacy, and quality gates before the listing goes public.',
      ),
    ],
  },
  {
    id: 'enterprise',
    title: 'Enterprise',
    pages: [
      page(
        'index',
        'Enterprise overview',
        'Enterprise plans add the controls larger organisations need: SSO, SCIM, audit logs, regional data residency, dedicated support, and a 99.9% uptime SLA.',
      ),
      page(
        'sso',
        'Single sign-on',
        'Domio supports SAML 2.0 and OIDC. Map your IdP groups to Domio roles so access is governed by the systems you already trust.',
      ),
      page(
        'scim',
        'SCIM provisioning',
        'Provision and de-provision users automatically with SCIM 2.0. Role mappings stay in sync with your directory of record.',
      ),
      page(
        'audit',
        'Audit logs',
        'Every workspace event — share, role change, export, agent action — is logged with the actor, target, and timestamp. Stream logs into your SIEM via webhook.',
      ),
      page(
        'residency',
        'Data residency',
        'Choose where your data lives. Domio operates in multiple regions; pinning a workspace to a region keeps every byte inside the boundary you specify.',
      ),
    ],
  },
  {
    id: 'agentic',
    title: 'Agentic',
    pages: [
      page(
        'index',
        'Agentic overview',
        'Domio is built to be operated by agents. The same reactive primitives, bindings, and data sources that power human authors are exposed over a stable, typed surface for AI agents.',
      ),
      page(
        'protocol',
        'Agent protocol',
        "The agent protocol is a JSON-RPC 2.0 surface that mirrors the editor's command model. Every operation has a stable name, an input schema, and an output schema — so agents can plan, propose, and verify.",
      ),
      page(
        'auth',
        'Authenticating agents',
        'Issue scoped tokens for your agents. Tokens carry a list of allowed operations and an expiry; rotate them independently of human credentials.',
      ),
      page(
        'plan-apply',
        'Plan & apply',
        'Agents propose a plan, the user reviews the diff, then the plan is applied. The protocol separates propose, approve, and apply so humans stay in the loop at every step.',
      ),
      page(
        'safety',
        'Safety rails',
        'Scoped tokens, dry-run flags, and per-workspace rate limits are the three primary safety rails. Agents operating inside those rails can be left unattended with confidence.',
      ),
    ],
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    pages: [
      page(
        'index',
        'API overview',
        'The Domio REST API mirrors the workspace you see in the editor. Every resource is addressable by URL, versioned, and documented in OpenAPI 3.1.',
      ),
      page(
        'auth',
        'Authentication',
        'Authenticate with a bearer token. Tokens are issued by the dashboard and can be scoped to a workspace, a role, or a single operation.',
      ),
      page(
        'decks',
        'Decks endpoint',
        'The decks endpoint exposes CRUD over decks, plus endpoints for drafts, versions, and shares. Every response includes the server timestamp so clients can reconcile.',
      ),
      page(
        'scenes',
        'Scenes endpoint',
        'Scenes are nested resources under a deck. Use the scenes endpoint to list, create, reorder, or delete scenes within a deck.',
      ),
      page(
        'webhooks',
        'Webhooks',
        'Subscribe to workspace events with webhooks. Domio signs every payload so you can verify the origin before acting on it.',
      ),
      page(
        'rate-limits',
        'Rate limits',
        'Rate limits are per-token and reset on a rolling window. The response headers expose your remaining budget so clients can self-throttle.',
      ),
    ],
  },
];
