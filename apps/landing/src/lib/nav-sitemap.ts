/**
 * nav-sitemap — declares every landing page as a `NavNode`.
 *
 * Per Wave 13. This is the data layer for the landing surface: each
 * top-level marketing route gets a node, and the rest of the system
 * (SiteHeader, SiteFooter, BreadcrumbsShell, related cross-link rails,
 * the new `/services` directory) reads from it.
 *
 * Nodes are typed `NavNode` (from `@domio/ui`) so hrefs go through
 * the typed `landing()` builder and stay in lock-step with the routing
 * module. Edges (`parent`, `children`, `siblings`, `seeAlso`,
 * `crossApp`) reference ids declared elsewhere in this file.
 *
 * Adding a new landing page = add one node here plus its edges. The
 * `nav-sitemap.test.ts` companion asserts the graph stays well-formed
 * (no orphans, no duplicates, every parent exists).
 */

import type { NavNode } from '@domio/ui';
import { landing, localUrl } from '@domio/ui';
import { listAllFeatures } from './feature-catalog';

/* ---------------------------------------------------------------------------
 * Node declarations — top-level landing routes
 * ------------------------------------------------------------------------- */

const HOME: NavNode = {
  id: 'home',
  surface: 'landing',
  category: 'product',
  label: 'Home',
  tagline: 'Interactive decks, shared sessions, live presentations.',
  href: landing('home'),
  primary: true,
  order: 0,
  seeAlso: ['features-index', 'pricing', 'docs-index'],
};

const FEATURES_INDEX: NavNode = {
  id: 'features-index',
  surface: 'landing',
  category: 'feature',
  label: 'Features',
  tagline: 'A 24-card tour of what Domio does.',
  href: landing('features'),
  parent: 'home',
  primary: true,
  order: 1,
  seeAlso: ['pricing', 'docs-index', 'signup'],
};

const PRICING: NavNode = {
  id: 'pricing',
  surface: 'landing',
  category: 'product',
  label: 'Pricing',
  tagline: 'Free, Pro, and Enterprise tiers.',
  href: landing('pricing'),
  parent: 'home',
  primary: true,
  order: 2,
  seeAlso: ['features-index', 'signup'],
};

const DOCS_INDEX: NavNode = {
  id: 'docs-index',
  surface: 'landing',
  category: 'docs',
  label: 'Docs',
  tagline: 'Guides, tutorials, and API reference.',
  href: landing('docs'),
  parent: 'home',
  primary: true,
  order: 3,
  seeAlso: ['features-index', 'cli', 'plugins-sdk'],
};

const BLOG_INDEX: NavNode = {
  id: 'blog-index',
  surface: 'landing',
  category: 'resources',
  label: 'Blog',
  tagline: 'Engineering, product, and customer updates.',
  href: landing('blog'),
  parent: 'home',
  primary: true,
  order: 4,
  seeAlso: ['changelog', 'community', 'help-index'],
};

const HELP_INDEX: NavNode = {
  id: 'help-index',
  surface: 'landing',
  category: 'help',
  label: 'Help',
  tagline: 'FAQs, troubleshooting, and contact.',
  href: landing('help'),
  parent: 'home',
  primary: true,
  order: 5,
  seeAlso: ['docs-index', 'community', 'status'],
};

const DEMOS: NavNode = {
  id: 'demos',
  surface: 'landing',
  category: 'resources',
  label: 'Demos',
  tagline: 'Watch Domio in action.',
  href: landing('demos'),
  parent: 'home',
  seeAlso: ['features-index', 'pricing', 'signup'],
};

const STATUS: NavNode = {
  id: 'status',
  surface: 'landing',
  category: 'resources',
  label: 'Status',
  tagline: 'Live service health.',
  href: landing('status'),
  parent: 'home',
  primary: true,
  order: 6,
  seeAlso: ['trust', 'changelog'],
};

const CHANGELOG: NavNode = {
  id: 'changelog',
  surface: 'landing',
  category: 'resources',
  label: 'Changelog',
  tagline: 'Every shipped change, every week.',
  href: landing('changelog'),
  parent: 'home',
  seeAlso: ['status', 'blog-index'],
};

const TRUST: NavNode = {
  id: 'trust',
  surface: 'landing',
  category: 'company',
  label: 'Trust center',
  tagline: 'Compliance, security, and reliability.',
  href: landing('trust'),
  parent: 'home',
  primary: true,
  order: 7,
  seeAlso: ['status', 'pricing'],
};

const CAREERS: NavNode = {
  id: 'careers',
  surface: 'landing',
  category: 'company',
  label: 'Careers',
  tagline: 'Join the team building the presentation OS.',
  href: landing('careers'),
  parent: 'home',
  seeAlso: ['blog-index', 'community'],
};

const COMMUNITY: NavNode = {
  id: 'community',
  surface: 'landing',
  category: 'company',
  label: 'Community',
  tagline: 'Forums, events, and office hours.',
  href: landing('community'),
  parent: 'home',
  seeAlso: ['help-index', 'blog-index'],
};

const CLI: NavNode = {
  id: 'cli',
  surface: 'landing',
  category: 'resources',
  label: 'CLI',
  tagline: 'The `domio` command-line tool.',
  href: landing('cli'),
  parent: 'home',
  seeAlso: ['plugins-sdk', 'docs-index'],
};

const PLUGINS_SDK: NavNode = {
  id: 'plugins-sdk',
  surface: 'landing',
  category: 'resources',
  label: 'Plugins SDK',
  tagline: 'Build plugins that hook into the editor.',
  href: landing('plugins-sdk'),
  parent: 'home',
  seeAlso: ['cli', 'docs-index', 'services-index'],
};

const SIGNUP: NavNode = {
  id: 'signup',
  surface: 'landing',
  category: 'auth',
  label: 'Sign up',
  tagline: 'Create your free Domio account.',
  href: landing('signup'),
  parent: 'home',
  seeAlso: ['pricing', 'features-index'],
};

const LOGIN: NavNode = {
  id: 'login',
  surface: 'landing',
  category: 'auth',
  label: 'Sign in',
  tagline: 'Welcome back.',
  href: landing('login'),
  parent: 'home',
  seeAlso: ['forgot-password', 'signup'],
};

const FORGOT_PASSWORD: NavNode = {
  id: 'forgot-password',
  surface: 'landing',
  category: 'auth',
  label: 'Reset password',
  tagline: 'Recover access to your account.',
  href: landing('forgot-password'),
  parent: 'login',
};

const SERVICES_INDEX: NavNode = {
  id: 'services-index',
  surface: 'landing',
  category: 'service',
  label: 'Services',
  tagline: 'Directory of every Domio backend service.',
  href: '/services',
  parent: 'home',
  primary: true,
  order: 8,
};

/* ---------------------------------------------------------------------------
 * Cross-app sibling surfaces (used for navigation in headers/footers, not
 * navigable themselves)
 * ------------------------------------------------------------------------- */

const EDITOR_APP: NavNode = {
  id: 'app-editor',
  surface: 'editor',
  category: 'product',
  label: 'Editor',
  href: localUrl('editor', '/'),
  primary: false,
};

const DASHBOARD_APP: NavNode = {
  id: 'app-dashboard',
  surface: 'dashboard',
  category: 'analytics',
  label: 'Dashboard',
  href: localUrl('dashboard', '/overview'),
  primary: false,
};

const PRESENTER_APP: NavNode = {
  id: 'app-presenter',
  surface: 'presenter',
  category: 'product',
  label: 'Presenter',
  href: localUrl('presenter', '/'),
  primary: false,
};

const VIEWER_APP: NavNode = {
  id: 'app-viewer',
  surface: 'viewer',
  category: 'product',
  label: 'Viewer',
  href: localUrl('viewer', '/'),
  primary: false,
};

const MARKETPLACE_APP: NavNode = {
  id: 'app-marketplace',
  surface: 'marketplaceWeb',
  category: 'product',
  label: 'Marketplace',
  href: localUrl('marketplaceWeb', '/'),
  primary: false,
};

const ADMIN_APP: NavNode = {
  id: 'app-admin',
  surface: 'adminConsole',
  category: 'analytics',
  label: 'Admin',
  href: localUrl('adminConsole', '/'),
  primary: false,
};

const CREATOR_APP: NavNode = {
  id: 'app-creator',
  surface: 'creatorConsole',
  category: 'product',
  label: 'Creator',
  href: localUrl('creatorConsole', '/listings'),
  primary: false,
};

const JOIN_WEB_APP: NavNode = {
  id: 'app-join-web',
  surface: 'joinWeb',
  category: 'product',
  label: 'Join',
  href: localUrl('joinWeb', '/'),
  primary: false,
};

/* ---------------------------------------------------------------------------
 * Navigation graph (landing + cross-app shadow nodes)
 * ------------------------------------------------------------------------- */

export const NAV_SITEMAP: ReadonlyArray<NavNode> = Object.freeze([
  HOME,
  FEATURES_INDEX,
  PRICING,
  DOCS_INDEX,
  BLOG_INDEX,
  HELP_INDEX,
  DEMOS,
  STATUS,
  CHANGELOG,
  TRUST,
  CAREERS,
  COMMUNITY,
  CLI,
  PLUGINS_SDK,
  SIGNUP,
  LOGIN,
  FORGOT_PASSWORD,
  SERVICES_INDEX,
  // Cross-app shadows (for footer/header links only).
  EDITOR_APP,
  DASHBOARD_APP,
  PRESENTER_APP,
  VIEWER_APP,
  MARKETPLACE_APP,
  ADMIN_APP,
  CREATOR_APP,
  JOIN_WEB_APP,
]);

/* ---------------------------------------------------------------------------
 * Per-feature deep-dive nodes — populated from feature-catalog.
 * These are the `/features/<slug>` pages.
 * ------------------------------------------------------------------------- */

const FEATURE_DEEP_DIVE_NODES: ReadonlyArray<NavNode> = Object.freeze(
  listAllFeatures().map<NavNode>((feature, idx) => {
    const relatedSlugs: ReadonlyArray<string> = listAllFeatures()
      .filter((other) => other.category === feature.category && other.slug !== feature.slug)
      .slice(0, 4)
      .map((other) => other.slug);
    return {
      id: `feature-${feature.slug}`,
      surface: 'landing',
      category: 'feature',
      label: feature.title,
      tagline: feature.tagline,
      href: landing('feature', { slug: feature.slug }),
      parent: 'features-index',
      siblings: relatedSlugs.map((slug) => `feature-${slug}`),
      seeAlso: ['docs-index', 'services-index'],
      order: idx,
    };
  }),
);

/* ---------------------------------------------------------------------------
 * Public helpers
 * ------------------------------------------------------------------------- */

export const ALL_LANDING_NODES: ReadonlyArray<NavNode> = Object.freeze([
  ...NAV_SITEMAP,
  ...FEATURE_DEEP_DIVE_NODES,
]);

/**
 * Resolve by id within the landing surface.
 */
export function landingNodeById(id: string): NavNode | null {
  return ALL_LANDING_NODES.find((node) => node.id === id) ?? null;
}

/**
 * Return the parent chain for a landing node, root first.
 */
export function landingBreadcrumbs(id: string): ReadonlyArray<NavNode> {
  const out: NavNode[] = [];
  let current: NavNode | null = landingNodeById(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    out.unshift(current);
    if (!current.parent) break;
    current = landingNodeById(current.parent);
  }
  return Object.freeze(out);
}

/* ---------------------------------------------------------------------------
 * Footer column partitioning — used by SiteFooter.
 * ------------------------------------------------------------------------- */

export interface FooterColumn {
  readonly heading: string;
  readonly links: ReadonlyArray<NavNode>;
}

/**
 * The sitemap is partitioned into Product / Resources / Company /
 * Legal / Cross-app columns. Node ids declared once; rendered in
 * multiple places.
 */
export function footerColumns(): ReadonlyArray<FooterColumn> {
  const productNodes: NavNode[] = [
    landingNodeById('features-index')!,
    landingNodeById('cli')!,
    landingNodeById('plugins-sdk')!,
    landingNodeById('pricing')!,
    landingNodeById('docs-index')!,
  ];
  const resourcesNodes: NavNode[] = [
    landingNodeById('blog-index')!,
    landingNodeById('changelog')!,
    landingNodeById('demos')!,
    landingNodeById('status')!,
    landingNodeById('trust')!,
    landingNodeById('help-index')!,
    landingNodeById('community')!,
    landingNodeById('services-index')!,
  ];
  const companyNodes: NavNode[] = [
    landingNodeById('careers')!,
  ];
  const legalNodes: NavNode[] = [
    /* terms / privacy / dpa are pure-marketing pages — not graph nodes
       (they have no related links, breadcrumbs, etc.). The SiteFooter
       declares them inline. */
  ];
  const crossAppNodes: NavNode[] = [
    landingNodeById('app-editor')!,
    landingNodeById('app-viewer')!,
    landingNodeById('app-presenter')!,
    landingNodeById('app-dashboard')!,
    landingNodeById('app-marketplace')!,
    landingNodeById('app-creator')!,
    landingNodeById('app-admin')!,
  ];
  return Object.freeze([
    Object.freeze({ heading: 'Product', links: Object.freeze(productNodes) }),
    Object.freeze({ heading: 'Resources', links: Object.freeze(resourcesNodes) }),
    Object.freeze({ heading: 'Company', links: Object.freeze(companyNodes) }),
    Object.freeze({ heading: 'Legal', links: Object.freeze(legalNodes) }),
    Object.freeze({ heading: 'Apps', links: Object.freeze(crossAppNodes) }),
  ]);
}
