/**
 * Hardcoded data backing the public Domio blog.
 *
 * Wave 12 §S12.10 — Blog. These constants are the single source of truth
 * used by /blog (index), /blog/[slug] (post body), and /blog/rss.xml.
 *
 * Implementation notes:
 *  - Posts are stored newest-first; tests and the RSS feed rely on this
 *    order so it MUST be preserved when editing.
 *  - We treat `body_md` as a tiny subset of markdown (paragraphs, `##`
 *    headings, `code` spans, bullet lists) and render it without a full
 *    MDX runtime to keep the landing app dependency-free. A later Wave
 *    can swap the renderer for `next-mdx-remote` without touching this
 *    data file.
 *  - Authors are reused across posts; the initials/role tuples are the
 *    canonical display form for the byline and avatar bubble.
 */

export type BlogCategory =
  | 'engineering'
  | 'product'
  | 'customer-stories'
  | 'company';

export interface BlogAuthor {
  readonly name: string;
  readonly role: string;
  readonly avatar_initials: string;
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly author: BlogAuthor;
  readonly category: BlogCategory;
  readonly tags: ReadonlyArray<string>;
  readonly published_at_iso: string;
  readonly reading_minutes: number;
  readonly body_md: string;
}

/**
 * Canonical author roster. Re-used across posts; the
 * `avatar_initials` is rendered in the byline bubble.
 */
export const BLOG_AUTHORS: Readonly<Record<string, BlogAuthor>> = {
  'maya-park': { name: 'Maya Park', role: 'Product Manager', avatar_initials: 'MP' },
  'sam-owusu': { name: 'Sam Owusu', role: 'Engineering', avatar_initials: 'SO' },
  'lin-chen': { name: 'Lin Chen', role: 'Design', avatar_initials: 'LC' },
  'rachel-park': { name: 'Rachel Park', role: 'Customer Success', avatar_initials: 'RP' },
  'diego-marquez': { name: 'Diego Marquez', role: 'Field CTO', avatar_initials: 'DM' },
};

/**
 * All four categories, in the order they appear in the filter chips.
 */
export const BLOG_CATEGORIES: ReadonlyArray<BlogCategory> = [
  'engineering',
  'product',
  'customer-stories',
  'company',
];

/**
 * Pretty label per category — used by the filter chips and post cards.
 */
export const BLOG_CATEGORY_LABELS: Readonly<Record<BlogCategory, string>> = {
  engineering: 'Engineering',
  product: 'Product',
  'customer-stories': 'Customer stories',
  company: 'Company',
};

/**
 * 12 posts, dated across 2026, newest first. Every post has an author,
 * at least one tag, and a non-empty body so the RSS feed and post
 * pages never render empty content.
 */
export const BLOG_POSTS: ReadonlyArray<BlogPost> = [
  {
    slug: 'deckcrdt-2026-recap',
    title: 'deckCRDT in 2026: a year of offline-first decks',
    excerpt:
      'A look back at the offline sync work we shipped this year — operation coalescing, presence, and the new snapshot pipeline.',
    author: BLOG_AUTHORS['sam-owusu']!,
    category: 'engineering',
    tags: ['crdt', 'offline', 'performance'],
    published_at_iso: '2026-08-05T09:00:00.000Z',
    reading_minutes: 8,
    body_md:
      'When we set out to rebuild our sync layer at the start of the year, we knew we wanted one thing: decks that feel instant, even when the network disappears.\n\n' +
      '## What changed\n\n' +
      '- Operation coalescing reduced the median op-log size by 38%.\n' +
      '- Presence now piggybacks on the sync channel — no extra socket.\n' +
      '- Snapshots land every 500 ops instead of every 60 seconds.\n\n' +
      '## What is next\n\n' +
      'We are piloting a partial-snapshot scheme so large decks do not pay a full re-sync cost when a single slide changes. Early numbers are promising — 4× faster catch-up on the worst-case fixture.',
  },
  {
    slug: 'audience-prompts-redesign',
    title: 'How we redesigned audience prompts for the presenter app',
    excerpt:
      'Behind the scenes on the new presenter-side prompt UX — what we tested, what we threw out, and what shipped.',
    author: BLOG_AUTHORS['lin-chen']!,
    category: 'product',
    tags: ['design', 'presenter', 'ux-research'],
    published_at_iso: '2026-07-22T13:30:00.000Z',
    reading_minutes: 6,
    body_md:
      'Audience prompts are the half-second between an idea and a yes/no. We spent a quarter making that half-second feel less like a popup.\n\n' +
      '## The problem\n\n' +
      'Presenter view had three places to launch a prompt, and our telemetry showed most hosts opened none of them.\n\n' +
      '## The fix\n\n' +
      'We collapsed the three entry points into one — a docked strip that floats above the timeline. Hosts can now fire a prompt without leaving the current slide.\n\n' +
      'Adoption is up 2.4× since the redesign shipped.',
  },
  {
    slug: 'helio-renewals-case-study',
    title: 'How Helio cut renewal-prep time by 71% with Domio',
    excerpt:
      'Helio’s customer success team rebuilt their renewal playbook on top of our live decks — here is what they learned.',
    author: BLOG_AUTHORS['rachel-park']!,
    category: 'customer-stories',
    tags: ['case-study', 'customer-success', 'renewals'],
    published_at_iso: '2026-07-09T15:00:00.000Z',
    reading_minutes: 5,
    body_md:
      'Helio runs a high-touch CS motion across 180 enterprise accounts. Their renewal-prep deck used to take a week.\n\n' +
      '## The workflow\n\n' +
      'Each CSM pulls usage data from the dashboard, drops it into a branded deck template, and shares a live link with the account team two days before the call.\n\n' +
      '## The result\n\n' +
      'Prep time is down from 5 days to 36 hours, and the renewal win-rate is up 11 points quarter over quarter.',
  },
  {
    slug: 'series-b-announcement',
    title: 'Domio raises Series B to build the presentation OS',
    excerpt:
      'We raised a $42M Series B led by Crescent Partners, with participation from every existing investor.',
    author: BLOG_AUTHORS['maya-park']!,
    category: 'company',
    tags: ['funding', 'announcement'],
    published_at_iso: '2026-06-18T16:00:00.000Z',
    reading_minutes: 4,
    body_md:
      'Today we are announcing our Series B: $42M led by Crescent Partners, with participation from Northwind, Pier 9, and every existing investor.\n\n' +
      '## What this means\n\n' +
      'We will be doubling the engineering team, opening a Berlin office in Q4, and accelerating our work on the marketplace and plugin SDK.\n\n' +
      'Thank you to our customers, partners, and the team for getting us here.',
  },
  {
    slug: 'plugin-sdk-ga',
    title: 'Plugin SDK 1.0 is here',
    excerpt:
      'The plugin SDK is now generally available. Here is what is in the box and what is next on the roadmap.',
    author: BLOG_AUTHORS['sam-owusu']!,
    category: 'engineering',
    tags: ['plugins', 'sdk', 'ga'],
    published_at_iso: '2026-06-02T10:15:00.000Z',
    reading_minutes: 7,
    body_md:
      'After six months of beta, the Plugin SDK is ready for production traffic.\n\n' +
      '## In the box\n\n' +
      '- Typed host APIs for panels, slide nodes, and editor commands.\n' +
      '- A sandboxed runtime with strict CSP defaults.\n' +
      '- A review pipeline that surfaces a structured diff alongside the listing.\n\n' +
      '## What is next\n\n' +
      'Server-side plugin execution is the next milestone — we want plugins to be able to call out to your own backend with the same auth model as the rest of Domio.',
  },
  {
    slug: 'formula-engine-deep-dive',
    title: 'Inside the Domio formula engine',
    excerpt:
      'How we built a small but safe spreadsheet engine for live decks, including the lint pass that catches footguns.',
    author: BLOG_AUTHORS['sam-owusu']!,
    category: 'engineering',
    tags: ['formula-engine', 'internals'],
    published_at_iso: '2026-05-14T11:00:00.000Z',
    reading_minutes: 12,
    body_md:
      'The formula engine looks like Excel and behaves like Excel — until it does not. This post walks through the design choices that keep it predictable.\n\n' +
      '## Dependency tracking\n\n' +
      'Every cell keeps an explicit set of reverse dependencies. A write only re-evaluates the downstream frontier, so a one-cell edit never triggers a full recompute.\n\n' +
      '## The lint pass\n\n' +
      'Before any formula is saved, a linter walks the AST looking for circular references, non-deterministic calls, and unbounded fan-out. Lint failures are surfaced inline, not as a console error.\n\n' +
      '## Limits we chose\n\n' +
      'Recursion depth is capped at 32, function arity is fixed, and there is no `INDIRECT`. We chose safety over power and have not regretted it.',
  },
  {
    slug: 'roadmap-h2-2026',
    title: 'What we are shipping in the second half of 2026',
    excerpt:
      'A look at the roadmap: realtime analytics, an offline presenter, and the long-awaited dark theme for the editor.',
    author: BLOG_AUTHORS['maya-park']!,
    category: 'product',
    tags: ['roadmap', 'planning'],
    published_at_iso: '2026-05-01T09:30:00.000Z',
    reading_minutes: 5,
    body_md:
      'Here is the shape of H2 2026.\n\n' +
      '## Three big bets\n\n' +
      '- Realtime analytics inside the editor so authors see engagement as the deck is presented.\n' +
      '- An offline-first presenter that survives airplane mode without dropping slides.\n' +
      '- A proper dark theme for the editor. We are sorry it took this long.\n\n' +
      '## Smaller items\n\n' +
      'PowerPoint export fidelity, a slide-outliner keyboard mode, and a brand-template gallery refresh.',
  },
  {
    slug: 'northwind-renewal',
    title: 'Northwind renewed for three years — and rebuilt their onboarding deck with us',
    excerpt:
      'Northwind’s enablement team moved 14 onboarding decks into Domio and cut average onboarding time by 38%.',
    author: BLOG_AUTHORS['diego-marquez']!,
    category: 'customer-stories',
    tags: ['case-study', 'onboarding', 'enterprise'],
    published_at_iso: '2026-04-17T14:45:00.000Z',
    reading_minutes: 6,
    body_md:
      'Northwind’s enablement team owns 14 onboarding decks across four product lines. Until this spring, all 14 lived in three different tools.\n\n' +
      '## The migration\n\n' +
      'We worked side-by-side with Northwind for six weeks, importing legacy decks, mapping brand tokens, and rebuilding the interactive prompts that used to live in a separate tool.\n\n' +
      '## The outcome\n\n' +
      'Average onboarding time dropped from 11 days to 7, and the team finally has one source of truth.',
  },
  {
    slug: 'hiring-q3-2026',
    title: 'We are hiring across product, design, and engineering',
    excerpt:
      'Twelve open roles across three offices. Here is how we think about hiring and what the interview loop looks like.',
    author: BLOG_AUTHORS['maya-park']!,
    category: 'company',
    tags: ['hiring', 'culture'],
    published_at_iso: '2026-04-02T17:00:00.000Z',
    reading_minutes: 4,
    body_md:
      'We have twelve open roles across product, design, and engineering — five in NYC, four in Berlin, and three remote.\n\n' +
      '## How we hire\n\n' +
      'Every loop starts with a 30-minute intro call. From there, the bar is set by the role: a take-home for engineering, a portfolio walk for design, a written case for PM.\n\n' +
      'We aim to close every loop within ten business days.',
  },
  {
    slug: 'viewer-perf-2026',
    title: 'Viewer perf: how we got the public viewer under 80KB',
    excerpt:
      'The public viewer used to ship 420KB of JS. Here is the audit and the cuts that took it under 80KB.',
    author: BLOG_AUTHORS['sam-owusu']!,
    category: 'engineering',
    tags: ['performance', 'viewer', 'bundle-size'],
    published_at_iso: '2026-03-11T08:30:00.000Z',
    reading_minutes: 9,
    body_md:
      'The viewer is the part of Domio most people see the most. So when we audited its JS payload and found 420KB, we were embarrassed.\n\n' +
      '## What was in there\n\n' +
      '- A full charting library for a feature that renders three chart types.\n' +
      '- A polyfill for a browser feature that is now universal.\n' +
      '- A second copy of the Yjs runtime that we never noticed.\n\n' +
      '## The cuts\n\n' +
      'Replacing the charting lib with a tiny hand-rolled renderer saved 180KB. Dropping the polyfill saved another 90KB. Deduplicating Yjs closed the rest of the gap.',
  },
  {
    slug: 'priceless-decks-essay',
    title: 'On building decks that are worth paying for',
    excerpt:
      'A short essay on why most "free" presentation tools end up costing more than the paid ones.',
    author: BLOG_AUTHORS['diego-marquez']!,
    category: 'product',
    tags: ['essay', 'pricing'],
    published_at_iso: '2026-02-19T12:00:00.000Z',
    reading_minutes: 7,
    body_md:
      'Most free presentation tools are not free. They are paid for in attention, in training, in the slow leak of brand consistency.\n\n' +
      '## The hidden bill\n\n' +
      'Every time an employee opens a blank slide, they spend the first twenty minutes recreating the company template. Multiply that by the headcount and you have a six-figure annual line item.\n\n' +
      '## What we did instead\n\n' +
      'We built Domio so that the brand template is the default. There is no blank slide. There is no way to accidentally ship off-brand work.',
  },
  {
    slug: 'security-posture-2026',
    title: 'Our 2026 security posture, in plain English',
    excerpt:
      'SOC 2 Type II, ISO 27001, and what those badges actually mean for the way we run the platform.',
    author: BLOG_AUTHORS['diego-marquez']!,
    category: 'company',
    tags: ['security', 'compliance'],
    published_at_iso: '2026-01-28T10:00:00.000Z',
    reading_minutes: 5,
    body_md:
      'We renewed SOC 2 Type II and ISO 27001 in Q4. Here is what those certifications actually cover and what they do not.\n\n' +
      '## What the badges mean\n\n' +
      'They mean an independent auditor verified that our controls — access reviews, change management, incident response — operated effectively over the audit period.\n\n' +
      '## What they do not mean\n\n' +
      'They do not mean the platform is unhackable. They mean we have a tested process for when something goes wrong.',
  },
];