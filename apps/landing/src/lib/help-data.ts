/**
 * Knowledge base catalogue for the Help center (Wave 12 §S12.9).
 *
 * The Help center is the support surface on the marketing site. It
 * surfaces a searchable catalogue of KB articles grouped by category
 * (getting started, editor basics, viewer sharing, etc.) plus an
 * `/community` page that links to the Discord + forum.
 *
 * The catalogue lives here, not in the components, so the article body
 * can be shared by both the index and the per-article route without
 * duplicating the data. `searchArticles` powers the index search bar.
 */

export interface KbCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly article_slugs: ReadonlyArray<string>;
}

export interface KbArticle {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category_id: string;
  readonly body_md: string;
  readonly related_slugs: ReadonlyArray<string>;
  readonly updated_at_iso: string;
}

// ---------------------------------------------------------------------------
// KB_CATEGORIES
// ---------------------------------------------------------------------------

/**
 * Five top-level KB categories covering the full support surface.
 *
 * Each entry lists the article slugs it owns. The `article_slugs`
 * arrays are the single source of truth — the index page, the
 * `related_slugs` on each article, and the `all categories have at
 * least 2 articles` test all derive from these arrays.
 */
export const KB_CATEGORIES: ReadonlyArray<KbCategory> = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description:
      'Set up your Domio workspace, sign in, create your first deck, and publish a share link.',
    article_slugs: ['create-first-deck', 'workspace-setup', 'invite-teammates'],
  },
  {
    id: 'editor-basics',
    title: 'Editor basics',
    description:
      'Master the canvas, inspector, layers panel, bindings, and the keyboard shortcuts that power day-to-day authoring.',
    article_slugs: ['canvas-overview', 'inspector-panel', 'keyboard-shortcuts'],
  },
  {
    id: 'viewer-sharing',
    title: 'Viewer & sharing',
    description:
      'Share decks via link, embed them on third-party sites, control who can view or comment, and handle offline playback.',
    article_slugs: ['share-link-permissions', 'embed-deck-website', 'offline-playback'],
  },
  {
    id: 'presenter-setup',
    title: 'Presenter & audience',
    description:
      'Drive a live session with the presenter console, manage audience participation, and export session recordings.',
    article_slugs: ['presenter-console-tour', 'audience-qa-setup'],
  },
  {
    id: 'analytics',
    title: 'Analytics & insights',
    description:
      'Understand the dashboard, interpret engagement heatmaps, set up A/B tests, and export reports.',
    article_slugs: ['engagement-heatmap', 'ab-test-results'],
  },
  {
    id: 'marketplace-selling',
    title: 'Marketplace & selling',
    description:
      'Publish themes, templates, and plugins to the Domio marketplace and manage payouts.',
    article_slugs: ['publish-theme', 'marketplace-payouts'],
  },
  {
    id: 'enterprise',
    title: 'Enterprise & SSO',
    description:
      'SCIM provisioning, SAML SSO, custom domains, audit logs, and enterprise admin tooling.',
    article_slugs: ['sso-saml-setup', 'scim-provisioning'],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description:
      'Fix common issues with rendering, sync, exports, and live sessions. Includes the diagnostic checklist.',
    article_slugs: ['rendering-issues', 'sync-conflict-resolution'],
  },
  {
    id: 'billing',
    title: 'Billing & seats',
    description:
      'Manage your plan, add or remove seats, update payment details, and download invoices.',
    article_slugs: ['manage-seats-and-billing', 'download-invoices'],
  },
  {
    id: 'security',
    title: 'Security & compliance',
    description:
      'Workspace security settings, data residency, retention policies, and compliance certifications.',
    article_slugs: ['workspace-security-settings', 'data-residency-options'],
  },
];

// ---------------------------------------------------------------------------
// KB_ARTICLES
// ---------------------------------------------------------------------------

/**
 * Sixteen KB articles spanning every support surface documented in
 * Wave 12 §S12.9. The bodies are plain markdown — the article page
 * splits on blank lines and renders paragraphs. Update timestamps are
 * ISO-8601 strings and surface on the article page footer.
 */
export const KB_ARTICLES: ReadonlyArray<KbArticle> = [
  // ---- Getting started -------------------------------------------------
  {
    slug: 'create-first-deck',
    title: 'Create your first deck',
    summary:
      'A 5-minute walkthrough that takes you from a fresh workspace to a published shareable deck.',
    category_id: 'getting-started',
    related_slugs: ['workspace-setup', 'share-link-permissions'],
    updated_at_iso: '2026-07-12T10:00:00Z',
    body_md: `Welcome to Domio. In a few minutes you will have a live, shareable deck you can send to anyone — no install required.

Start from the + button on your workspace home. Pick the Pitch template to follow along, or start from a blank canvas. The editor opens immediately; your work is auto-saved and collaborative from the first keystroke.

Use the bottom bar to switch between Scenes, the right rail for the Inspector, and the left rail for Layers. When you are ready to share, click Share in the top right, set permissions, and copy the link.

That is the whole loop: open → create → share. The articles in this category dig into each step.`,
  },
  {
    slug: 'workspace-setup',
    title: 'Set up your workspace',
    summary:
      'Pick a workspace name, invite your team, configure defaults, and connect integrations.',
    category_id: 'getting-started',
    related_slugs: ['create-first-deck', 'invite-teammates'],
    updated_at_iso: '2026-06-22T09:30:00Z',
    body_md: `Your workspace is the top-level container that owns your decks, members, billing, and integrations.

Pick a workspace name that doubles as your internal shorthand — every share link embeds your workspace slug, so shorter names read better in URLs. Configure the default region (where new decks are stored) before you invite anyone; changing it later requires moving decks explicitly.

Connect your calendar, SSO provider, and CI integrations from Settings → Integrations. Each integration adds a panel to the relevant surface — for example, the Google Drive integration adds a binding source to the editor.`,
  },
  {
    slug: 'invite-teammates',
    title: 'Invite teammates',
    summary:
      'Add members, assign roles, and decide who owns billing, admin, and content governance.',
    category_id: 'getting-started',
    related_slugs: ['workspace-setup', 'manage-seats-and-billing'],
    updated_at_iso: '2026-06-22T09:35:00Z',
    body_md: `Inviting teammates is one setting away: open Members in the workspace sidebar and paste an email list.

There are three roles — Admin, Editor, and Viewer. Admin users manage billing and integrations, Editor users can create and modify decks, and Viewer users can only read. You can promote individuals to Admin from the same panel; enterprise customers can also map roles to SSO claims.

Teammates you invite get a magic link to sign in; nothing to install. You can revoke access instantly from the same panel, which is also where SCIM-managed seats will appear if you have configured provisioning.`,
  },

  // ---- Editor basics ----------------------------------------------------
  {
    slug: 'canvas-overview',
    title: 'Canvas overview',
    summary:
      'Pan, zoom, multi-select, and the difference between Scenes, Layers, and Frames.',
    category_id: 'editor-basics',
    related_slugs: ['inspector-panel', 'keyboard-shortcuts'],
    updated_at_iso: '2026-07-30T14:15:00Z',
    body_md: `The canvas is the central authoring surface. Treat it like an infinite whiteboard with three nested concepts on top:

Scenes are top-level containers, each holding a stack of slides. Most decks have one Scene, but branching decks and templates ship with multiple. Layers are the z-order within a single slide. Frames are the positioned rectangles that hold actual content — text, charts, components.

Pan with Space + drag. Zoom with Cmd/Ctrl + scroll. Multi-select with Shift + click or marquee. The canvas mirrors the viewer one-for-one, so what you see here is exactly what your audience sees.`,
  },
  {
    slug: 'inspector-panel',
    title: 'Inspector panel',
    summary:
      'Edit typography, colour tokens, bindings, and animation triggers from the right rail.',
    category_id: 'editor-basics',
    related_slugs: ['canvas-overview', 'keyboard-shortcuts'],
    updated_at_iso: '2026-07-30T14:20:00Z',
    body_md: `The Inspector is the right rail that opens whenever a Frame is selected. It exposes every editable property grouped by domain — Geometry, Typography, Colour, Bindings, and Animation.

Type a colour token name (for example, brand.primary) and press Enter to bind the colour to your theme. Bindings work the same way for text and geometry, which is how a single frame can re-style across light and dark themes without manual editing.

The Animation section turns the Inspector into a timeline. Add triggers tied to scroll position, click, or scene enter; the keyframes are stored alongside the frame so they travel with the deck.`,
  },
  {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    summary:
      'The 30 most-used shortcuts across the editor, presenter console, and viewer.',
    category_id: 'editor-basics',
    related_slugs: ['canvas-overview', 'inspector-panel'],
    updated_at_iso: '2026-08-01T08:00:00Z',
    body_md: `There are roughly 100 shortcuts across the editor; the table below covers the 30 we use every day.

Cmd/Ctrl + K opens the command palette. Cmd/Ctrl + Z / Shift+Z undo and redo. Arrow keys nudge the selection by 1 px; hold Shift to nudge by 10. Pressing 1 through 9 zooms the canvas to that scene; pressing 0 fits the current frame.

In the presenter console, F11 toggles full-screen audience view; B blacks out the audience display; W toggles the speaker notes overlay. In the viewer, ? brings up the keyboard help sheet for whatever surface you are on.`,
  },

  // ---- Viewer & sharing -------------------------------------------------
  {
    slug: 'share-link-permissions',
    title: 'Share link permissions',
    summary:
      'Understand the four share scopes — anyone, workspace, password, and per-user — and how tokens expire.',
    category_id: 'viewer-sharing',
    related_slugs: ['embed-deck-website', 'offline-playback'],
    updated_at_iso: '2026-06-09T12:00:00Z',
    body_md: `Every published deck gets a share link. There are four scopes you can attach:

Anyone with link — open to the public. Workspace — open to your members. Password — open to anyone who knows the password. Per-user — open only to specific email addresses; everyone else sees a 403.

Token expiry is independent of scope. Set a token to expire after a date for time-boxed sharing (sales decks, beta previews). Combine with domain restrictions to require a specific email domain before anyone can even authenticate.`,
  },
  {
    slug: 'embed-deck-website',
    title: 'Embed a deck on your website',
    summary:
      'Inline embed, iframe, or a JS widget — the right pick depends on who owns the host page.',
    category_id: 'viewer-sharing',
    related_slugs: ['share-link-permissions', 'offline-playback'],
    updated_at_iso: '2026-06-09T12:10:00Z',
    body_md: `For marketing pages, copy the inline embed snippet from Share → Embed and drop it into your HTML. The embed is lazy-loaded and respects the share scope, so password-protected decks will ask for credentials in the embed too.

Use the iframe variant when the host page disallows inline scripts (notably any page that ships a strict Content-Security-Policy). The JS widget is the most flexible — it exposes the same hooks the analytics dashboard uses, so you can listen for slide changes and pipe them into your own telemetry.

All three variants respect the deck's responsive layout settings. The deck will reflow at the breakpoints you set in the editor; the embed never upscales past 1× to protect image quality.`,
  },
  {
    slug: 'offline-playback',
    title: 'Offline playback',
    summary:
      'Cache decks for travel, kiosk mode, and unreliable networks — sync resumes when you reconnect.',
    category_id: 'viewer-sharing',
    related_slugs: ['embed-deck-website', 'sync-conflict-resolution'],
    updated_at_iso: '2026-06-09T12:15:00Z',
    body_md: `Every deck can be cached for offline playback from the Share menu. Once cached, the viewer renders the deck from local storage even with the radio off — useful for planes, conferences, and trade-show kiosks.

Cached decks stay read-only until you reconnect. When the network returns, the viewer pulls in any new revisions, animations, or comments and re-renders silently. There is no merge conflict to manage because offline viewers cannot edit; presenters are the only role that pushes back.

For long-term kiosk setups, run the viewer in PWA mode and tick the Auto-update on boot box in Admin → Devices.`,
  },

  // ---- Presenter & audience ---------------------------------------------
  {
    slug: 'presenter-console-tour',
    title: 'Presenter console tour',
    summary:
      'Slide preview, speaker notes, timer, audience view, and the four private channels presenters rely on.',
    category_id: 'presenter-setup',
    related_slugs: ['audience-qa-setup', 'engagement-heatmap'],
    updated_at_iso: '2026-05-18T16:00:00Z',
    body_md: `The presenter console is the surface you open when you go live. It has two screens: the one you see and the one the audience sees.

Your screen shows the current slide, the next slide, speaker notes, a session timer, and a private moderator chat. The audience screen renders only the current slide — no notes, no next-up peek, no UI chrome.

The four private channels are: Moderator chat (presenters + co-presenters), Q&A (audience questions, presenter-only by default), Reactions (visible to everyone unless muted), and Live links (curated URLs you pin per slide).`,
  },
  {
    slug: 'audience-qa-setup',
    title: 'Set up audience Q&A',
    summary:
      'Turn on Q&A, pin questions, moderate, and surface answers back to the audience.',
    category_id: 'presenter-setup',
    related_slugs: ['presenter-console-tour', 'engagement-heatmap'],
    updated_at_iso: '2026-05-18T16:10:00Z',
    body_md: `Q&A lives in the presenter console under the Audience tab. Turn it on from the same panel where you set the session to Public, Workspace, or Invite-only.

Pinned questions float to the top of the audience view, marked with a presenter indicator so the asker knows you saw them. Moderation hides spam automatically; presenters can also drop questions manually or send a polite auto-reply.

When you answer, the question is highlighted in the chat history. To surface answers to the audience, click Mark as answered — the question is then attached to the slide recording and indexed for the analytics heatmap.`,
  },

  // ---- Analytics --------------------------------------------------------
  {
    slug: 'engagement-heatmap',
    title: 'Read the engagement heatmap',
    summary:
      'Interpret dwell time, scroll depth, and drop-off to figure out which slides lose the audience.',
    category_id: 'analytics',
    related_slugs: ['ab-test-results', 'audience-qa-setup'],
    updated_at_iso: '2026-04-02T11:00:00Z',
    body_md: `The engagement heatmap overlays dwell time and drop-off on top of the deck. Each slide is a row; warmer colours indicate higher average dwell, cooler colours indicate drop-off.

Hover any row to see the actual numbers: median dwell, p90 dwell, drop-off percentage, and replay rate. The first heatmap a new author sees is always a blank deck — engage the deck with the simulated audience tool to fill it with sample data before you commit changes that move the needle.

Heatmaps are most useful compared to themselves. Take a snapshot before a redesign, then take another one 30 days later to see whether the changes improved dwell or made it worse.`,
  },
  {
    slug: 'ab-test-results',
    title: 'Read A/B test results',
    summary:
      'Statistical-significance thresholds, primary vs secondary metrics, and how to call a winner.',
    category_id: 'analytics',
    related_slugs: ['engagement-heatmap'],
    updated_at_iso: '2026-04-02T11:10:00Z',
    body_md: `Every A/B test you run lives under Experiments in the dashboard. Each card shows the variant, the primary metric, the observed lift, and the confidence interval.

Domio uses a 95% confidence threshold by default. Below that, the card reads Inconclusive and you should keep the test running. Treat the lift percentage as your expected improvement; the confidence interval tells you how wrong that number could be.

Only one variant can win — calling a winner auto-archives the loser and re-routes traffic. You can still resurrect the loser later from the archive; nothing is deleted.`,
  },

  // ---- Marketplace ------------------------------------------------------
  {
    slug: 'publish-theme',
    title: 'Publish a theme to the marketplace',
    summary:
      'Bundle a colour palette, type scale, and component override sheet into a publishable marketplace theme.',
    category_id: 'marketplace-selling',
    related_slugs: ['marketplace-payouts', 'sso-saml-setup'],
    updated_at_iso: '2026-07-04T13:00:00Z',
    body_md: `Publishing a theme packages three artefacts: a colour palette, a type scale, and a component override sheet. The palette and type scale ship as JSON; the overrides ship as a small bundle that the editor hot-loads.

Before you submit, run the preview locally with the CLI:

  domio theme preview ./my-theme

The preview builds a sandbox deck with every example slide, lets you verify both light and dark modes, and runs accessibility checks against WCAG AA. Fix anything it flags before you submit — reviews skip submissions that fail pre-flight.

Once approved, the theme goes live in the marketplace within 24 hours and shows up under your creator profile.`,
  },
  {
    slug: 'marketplace-payouts',
    title: 'Marketplace payouts',
    summary:
      'How revenue is split, when payouts run, and which countries are eligible for direct deposit.',
    category_id: 'marketplace-selling',
    related_slugs: ['publish-theme'],
    updated_at_iso: '2026-07-04T13:10:00Z',
    body_md: `Revenue from the marketplace is split 70/30 — 70% to you, 30% to Domio. There is no minimum payout threshold for direct deposit in eligible countries; bank transfers and PayPal payouts run monthly on the first business day.

Statements are available from the Creator Console under Statements. Each statement breaks down sales, refunds, taxes withheld, and the net payout. You can download CSV or PDF for your accountant.

Direct deposit is available in 38 countries. Everywhere else, payouts run through PayPal or as a wire transfer with a $15 fee.`,
  },

  // ---- Enterprise -------------------------------------------------------
  {
    slug: 'sso-saml-setup',
    title: 'Set up SAML SSO',
    summary:
      'Identity-provider metadata, claim mapping, and testing SSO before you enforce it workspace-wide.',
    category_id: 'enterprise',
    related_slugs: ['scim-provisioning', 'workspace-security-settings'],
    updated_at_iso: '2026-06-15T10:00:00Z',
    body_md: `SAML SSO lives under Settings → Security → SSO. Upload the IdP metadata XML, map the email + role claims, and click Test before you enforce.

Test mode lets every member sign in with either SSO or the legacy magic link. Once enforced, magic links are off and only SSO works. Plan the cutover for a low-traffic hour; the enforcement toggle is one-way until you file a support request to back it out.

Domio supports the major identity providers out of the box — Okta, Entra ID, Google Workspace, JumpCloud, OneLogin, Auth0. Custom IdPs work as long as they emit a standards-compliant SAML 2.0 response.`,
  },
  {
    slug: 'scim-provisioning',
    title: 'SCIM provisioning',
    summary:
      'Sync members and groups from your IdP into Domio, and map groups to roles automatically.',
    category_id: 'enterprise',
    related_slugs: ['sso-saml-setup', 'workspace-security-settings'],
    updated_at_iso: '2026-06-15T10:10:00Z',
    body_md: `SCIM provisioning keeps member lists in sync between your IdP and Domio. Turn it on after SAML SSO is configured — the two are independent features but they pair naturally.

Provision groups, not just users. Map an IdP group to a Domio role (Admin, Editor, Viewer) and the sync automatically promotes or demotes members as they join or leave the group. This is the safest way to manage access at scale — there is no human in the loop.

Deprovisioning is immediate: when a user is removed from the IdP, their next API call returns 401 and their active sessions are revoked within 60 seconds.`,
  },

  // ---- Troubleshooting --------------------------------------------------
  {
    slug: 'rendering-issues',
    title: 'Fix rendering issues',
    summary:
      'Diagnose blank slides, missing fonts, and broken animations with the built-in renderer report.',
    category_id: 'troubleshooting',
    related_slugs: ['sync-conflict-resolution', 'offline-playback'],
    updated_at_iso: '2026-08-02T09:00:00Z',
    body_md: `When a slide renders wrong for a viewer but looks fine to the author, the cause is almost always one of three things: a missing font that fell back to a system font, a binding that returned an unexpected shape, or a component override that targeted the wrong theme.

Run the Renderer report from the Help menu. The report lists every font request, every binding call, and every component override that fired during the render — the same view our support engineers see when you file a ticket. Save the report and attach it to the ticket if you escalate.

The fastest fix is usually to reproduce the issue on a fresh incognito window; the report then narrows the cause to a binding, a font, or a browser quirk in seconds.`,
  },
  {
    slug: 'sync-conflict-resolution',
    title: 'Resolve sync conflicts',
    summary:
      'How the editor merges concurrent edits and how to recover when the merge goes wrong.',
    category_id: 'troubleshooting',
    related_slugs: ['rendering-issues', 'offline-playback'],
    updated_at_iso: '2026-08-02T09:10:00Z',
    body_md: `Domio uses operational transforms to merge concurrent edits — most of the time the merge is invisible. When it isn't, you will see a conflict badge in the top bar that lists every slide with an unresolved conflict.

Open the conflict resolution panel from the badge. Each conflict is shown side by side with both versions, the timestamps, and the author. Pick the version you want to keep or merge the two manually — the merge editor is a structural diff tool, not a free-text one.

If a merge goes wrong, undo (Cmd/Ctrl + Z) restores the prior committed state. The full edit history is browsable from Version History — every commit keeps a snapshot you can roll back to.`,
  },

  // ---- Billing ---------------------------------------------------------
  {
    slug: 'manage-seats-and-billing',
    title: 'Manage seats and billing',
    summary:
      'Add and remove seats, update your payment method, and switch plans mid-cycle.',
    category_id: 'billing',
    related_slugs: ['download-invoices', 'invite-teammates'],
    updated_at_iso: '2026-07-22T11:00:00Z',
    body_md: `Seats and billing live under Settings → Billing. The seat meter at the top shows how many seats you have used vs how many you have paid for; proration is automatic.

To add seats, type a number above the meter. The change takes effect immediately and prorates the new seats to your current billing cycle. To remove seats, drag the meter down; the removal takes effect at the end of the cycle and a credit carries forward.

You can switch plans mid-cycle. Upgrades are prorated; downgrades are scheduled to take effect at the end of the cycle. Switching between monthly and annual is also a one-click operation.`,
  },
  {
    slug: 'download-invoices',
    title: 'Download invoices',
    summary:
      'Find, download, and email every invoice on file — including receipts and credit memos.',
    category_id: 'billing',
    related_slugs: ['manage-seats-and-billing'],
    updated_at_iso: '2026-07-22T11:10:00Z',
    body_md: `Every invoice, receipt, and credit memo is downloadable from Settings → Billing → Invoices. The default view is the most recent 12 months; click Load more to load earlier years.

Click any row to download a PDF. The PDF is what your accountant needs — it includes line-item billing, taxes withheld, and the billing address on file. To email the same PDF, click Email and enter an address; the email is sent from billing@domio.app.

Need a custom billing entity or VAT ID on every invoice? Update them in Settings → Billing → Details — the next invoice cycle picks up the change.`,
  },

  // ---- Security --------------------------------------------------------
  {
    slug: 'workspace-security-settings',
    title: 'Workspace security settings',
    summary:
      'Enforce 2FA, restrict sharing, and configure session length for every member of the workspace.',
    category_id: 'security',
    related_slugs: ['sso-saml-setup', 'data-residency-options'],
    updated_at_iso: '2026-06-30T08:00:00Z',
    body_md: `Security settings live under Settings → Security. The four you should turn on first: Require 2FA for all admins, Disable external sharing by default, Limit session length to 12 hours, and Audit log retention to 1 year.

Each setting has a workspace-wide effect and an optional role-by-role override. Use the role override to require 2FA only for admins during the rollout phase, then ramp to everyone once the policy is mature.

Every change is recorded in the audit log with the timestamp, the actor, and the before/after values. The log is exportable as CSV or streamable to your SIEM via the audit webhooks integration.`,
  },
  {
    slug: 'data-residency-options',
    title: 'Data residency options',
    summary:
      'Pick a region for new decks, move existing decks, and understand the residency trade-offs.',
    category_id: 'security',
    related_slugs: ['workspace-security-settings'],
    updated_at_iso: '2026-06-30T08:10:00Z',
    body_md: `Every deck lives in a region — pick the one that matches your data-residency policy. The choices are United States, European Union, and Asia Pacific (Tokyo); each is a fully isolated storage and compute plane.

To move a deck between regions, open the deck menu and select Move region. The move is two-phase: a copy phase that streams the assets to the new region, then a cutover that atomically redirects all share links. There is no read-only window — viewers continue to load from the old region until the cutover completes.

You cannot move a deck that has live sessions running. End those sessions first, then move; this prevents half-applied moves from corrupting live Q&A history.`,
  },
];

// ---------------------------------------------------------------------------
// searchArticles
// ---------------------------------------------------------------------------

/**
 * Lower-cases and trims a query so the match logic is consistent.
 */
function normalise(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Counts case-insensitive substring occurrences of `needle` in
 * `haystack`. Both inputs are pre-lowercased before scoring.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  const lowerHay = haystack.toLowerCase();
  let count = 0;
  let index = lowerHay.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = lowerHay.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Scores an article against a normalised query.
 *
 * Hits in the title count triple, hits in the summary count double,
 * and hits in the body count once. Category id hits tiebreak on
 * relevance for users who type a category name instead of a topic.
 */
function scoreArticle(article: KbArticle, query: string): number {
  const titleHits = countOccurrences(article.title, query);
  const summaryHits = countOccurrences(article.summary, query);
  const bodyHits = countOccurrences(article.body_md, query);
  const categoryHits = countOccurrences(article.category_id, query);
  return titleHits * 3 + summaryHits * 2 + bodyHits + categoryHits;
}

/**
 * Searches the KB for `query`.
 *
 * Returns articles in score-descending order. Empty or whitespace-only
 * queries return an empty array. Results are stable — articles with
 * equal scores tiebreak on their index in `KB_ARTICLES`.
 */
export function searchArticles(query: string): ReadonlyArray<KbArticle> {
  const needle = normalise(query);
  if (needle.length === 0) return [];

  const scored: Array<{ article: KbArticle; score: number; index: number }> = [];
  KB_ARTICLES.forEach((article, index) => {
    const score = scoreArticle(article, needle);
    if (score > 0) {
      scored.push({ article, score, index });
    }
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map((entry) => entry.article);
}

/**
 * Returns the category that owns a given article slug, or undefined
 * if no category claims it. Used by the single-article route to
 * resolve breadcrumbs.
 */
export function categoryForSlug(slug: string): KbCategory | undefined {
  return KB_CATEGORIES.find((c) => c.article_slugs.includes(slug));
}

/**
 * Resolves an article from its slug. Returns undefined if no article
 * matches — the route uses this to 404 gracefully.
 */
export function articleBySlug(slug: string): KbArticle | undefined {
  return KB_ARTICLES.find((a) => a.slug === slug);
}
