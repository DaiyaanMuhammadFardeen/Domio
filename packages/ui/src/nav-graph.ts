/**
 * nav-graph — global typed navigation graph for every Domio surface.
 *
 * Per Wave 13 of docs/frontend-roadmap. The graph exposes every
 * navigable page (apps + user-facing services) as a typed `NavNode`
 * with explicit edges for parent / children / siblings / seeAlso /
 * crossApp. Built on top of `routing.ts` so every href is typed and
 * port-aware (via `localUrl()`).
 *
 * The graph is the single source of truth for:
 *   - the `<Breadcrumbs>` chain (parent traversal)
 *   - the `<RelatedLinks>` rail (siblings + seeAlso)
 *   - the `<Pager>` prev/next
 *   - the `<AppNav>` primary navigation
 *
 * Pure backend services (postgres, redis, nats, clickhouse, …) and
 * pure HTTP services with no UI surface are intentionally NOT nodes —
 * the user navigates them through the apps that wrap them. The
 * service taxonomy lives in `apps/landing/src/lib/services-registry.ts`
 * (which excludes infrastructure and renders the public
 * `/services` directory).
 */

import type { JSX, ReactNode } from 'react';

/* -------------------------------------------------------------------------
 * Types
 * ----------------------------------------------------------------------- */

/**
 * Which Domio app surface the node belongs to. Each surface has a
 * typed builder in `routing.ts`. Adding a new surface means adding a
 * builder AND an entry here.
 */
export type NavSurface =
  | 'landing'
  | 'editor'
  | 'viewer'
  | 'presenter'
  | 'dashboard'
  | 'joinWeb'
  | 'adminConsole'
  | 'creatorConsole'
  | 'marketplaceWeb'
  | 'magicLinkLanding'
  | 'services';

/**
 * Category used to bucket sibling nodes. Drives grouping in the
 * landing `<AppNav>` and the public service directory.
 */
export type NavCategory =
  | 'product'
  | 'feature'
  | 'docs'
  | 'help'
  | 'company'
  | 'resources'
  | 'service'
  | 'analytics'
  | 'auth';

/**
 * A single navigable page or service.
 *
 * `href` is the canonical, port-aware URL produced by one of the
 * `routing.ts` builders. `parent`, `children`, `siblings`, `seeAlso`
 * and `crossApp` are node ids — they resolve through `NAV_GRAPH`.
 */
export interface NavNode {
  readonly id: string;
  readonly surface: NavSurface;
  readonly category: NavCategory;
  readonly label: string;
  /** Short tagline shown under cards. Optional. */
  readonly tagline?: string;
  readonly href: string;
  readonly parent?: string;
  readonly children?: ReadonlyArray<string>;
  readonly siblings?: ReadonlyArray<string>;
  readonly seeAlso?: ReadonlyArray<string>;
  /** App surfaces this node points to. Used by cross-app navigation. */
  readonly crossApp?: ReadonlyArray<NavSurface>;
  /** Whether the node should appear in the primary nav. */
  readonly primary?: boolean;
  /** Display ordering within the primary nav (lower = earlier). */
  readonly order?: number;
  /** Optional icon name (lucide-style kebab-case). */
  readonly icon?: string;
}

/* -------------------------------------------------------------------------
 * The frozen graph
 * ----------------------------------------------------------------------- */

/**
 * The graph is a flat array of nodes; edges live ON the nodes as id
 * references. This keeps the graph trivially serializable and
 * deduplicatable. Adding a node never requires touching any other
 * node besides its parent / children / siblings / seeAlso lists.
 *
 * Tests in `nav-graph.test.ts` assert that every edge resolves, every
 * parent exists, and every sibling pair is symmetric.
 */
export const NAV_GRAPH: ReadonlyArray<NavNode> = Object.freeze([]);

/* -------------------------------------------------------------------------
 * Surface registry (per-app primary nav roots)
 * ----------------------------------------------------------------------- */

export interface SurfaceRoot {
  readonly surface: NavSurface;
  readonly label: string;
  /** Route into the surface for the `<AppNav>` cross-app switcher. */
  readonly href: string;
  /** Order in the cross-app switcher. */
  readonly order: number;
}

/**
 * The cross-app switcher in `<AppNav>` uses this list. Every surface
 * is a first-class citizen. Pure-backend services are deliberately
 * absent — users don't switch into them.
 */
export const SURFACE_ROOTS: ReadonlyArray<SurfaceRoot> = Object.freeze([
  { surface: 'landing', label: 'Marketing', href: '/', order: 0 },
  { surface: 'editor', label: 'Editor', href: '/editor/demo', order: 1 },
  { surface: 'viewer', label: 'Viewer', href: '/demo', order: 2 },
  { surface: 'presenter', label: 'Presenter', href: '/presenter/demo', order: 3 },
  { surface: 'dashboard', label: 'Dashboard', href: '/overview', order: 4 },
  { surface: 'marketplaceWeb', label: 'Marketplace', href: '/', order: 5 },
  { surface: 'creatorConsole', label: 'Creator', href: '/listings', order: 6 },
  { surface: 'adminConsole', label: 'Admin', href: '/', order: 7 },
  { surface: 'services', label: 'Services', href: '/services', order: 8 },
]);

/* -------------------------------------------------------------------------
 * Render-prop helpers
 * ----------------------------------------------------------------------- */

/**
 * Anchor variant — the default. Renders a plain `<a href>`.
 */
export interface NavAnchorProps {
  readonly href: string;
  readonly label: ReactNode;
  readonly current?: boolean;
  readonly testId?: string;
  readonly className?: string;
}

export type NavAnchor = (props: NavAnchorProps) => JSX.Element;
