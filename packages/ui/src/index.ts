/**
 * @domio/ui — Domio's shared React component library and platform primitives.
 *
 * Per Wave 1 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Public surface:
 *
 *   Design tokens (S1.4):
 *     - `./tokens.css` (CSS custom properties; import once at app root)
 *     - `tokens`, `tokensFor`, `lightTokens`, `darkTokens`
 *
 *   Loading / error / empty (S1.5, S1.6):
 *     - `SuspenseBoundary`, `useEmpty`
 *     - `Skeleton`
 *     - `EmptyState`
 *     - `ErrorBoundary`, `ErrorCard`
 *     - `ToastProvider`, `useToast`
 *
 *   Internationalization (S1.8):
 *     - `useLocale`, `getActiveLocale`, `readLocaleFromCookie`,
 *       `readLocaleFromNavigator`, `LOCALE_COOKIE`
 *     - `FormattedMessage`
 *
 *   Cross-app routing (S1.10):
 *     - `editor`, `viewer`, `presenter`, `dashboard`, `joinWeb`,
 *       `adminConsole`, `creatorConsole`, `marketplaceWeb`, `landing`,
 *       `localUrl`, `deckShare`, `presenterWithToken`
 *
 *   Registry pattern (S1.1):
 *     - `createPanelRegistry`, `PanelRegistry`, `PanelDefinition`
 */

// Tokens — runtime
export {
  tokens,
  tokensFor,
  lightTokens,
  darkTokens,
  type ThemeName,
  type ColorTokens,
  type SpacingTokens,
  type TypeTokens,
  type RadiusTokens,
  type MotionTokens,
} from './tokens.js';

// Loading / error / empty
export { SuspenseBoundary, useEmpty, type SuspenseBoundaryProps } from './SuspenseBoundary.js';

export { Skeleton } from './Skeleton.js';

export { EmptyState, type EmptyStateProps } from './EmptyState.js';

export {
  ErrorBoundary,
  ErrorCard,
  type ErrorCardProps,
  type ErrorBoundaryProps,
} from './ErrorBoundary.js';

export {
  ToastProvider,
  useToast,
  type ToastInput,
  type ToastProviderProps,
  type ToastVariant,
} from './Toast.js';

// i18n
export {
  useLocale,
  getActiveLocale,
  readLocaleFromCookie,
  readLocaleFromNavigator,
  LOCALE_COOKIE,
  type UseLocaleResult,
} from './useLocale.js';

export { setLocale, type SetLocaleOptions } from './setLocale.js';

export {
  resolveLocaleFromHeaders,
  type ResolveLocaleHeaders,
  type ResolvedLocale,
} from './serverLocale.js';

export { FormattedMessage, type FormattedMessageProps } from './FormattedMessage.js';

// Routing
export {
  editor,
  viewer,
  presenter,
  dashboard,
  joinWeb,
  joinFeedback,
  joinHandout,
  adminConsole,
  creatorConsole,
  marketplaceWeb,
  landing,
  localUrl,
  deckShare,
  presenterWithToken,
  type EditorRouteOptions,
  type ViewerRouteOptions,
  type DashboardRoute,
  type AdminRoute,
  type CreatorRoute,
  type MarketplaceRoute,
  type LandingRoute,
} from './routing.js';

// Registry pattern
export { createPanelRegistry, type PanelRegistry, type PanelDefinition } from './PanelRegistry.js';

// Class-merge helper (clsx-like, dependency-free)
export { cn } from './cn.js';

// Navigation graph (Wave 13 IA Network)
export {
  NAV_GRAPH,
  SURFACE_ROOTS,
  type NavNode,
  type NavSurface,
  type NavCategory,
  type SurfaceRoot,
  type NavAnchor,
  type NavAnchorProps,
} from './nav-graph.js';

export {
  nodeById,
  nodeByHref,
  nodesBySurface,
  primaryNav,
  surfaceRoots,
  breadcrumbsFor,
  breadcrumbsForHref,
  relatedFor,
  relatedForHref,
  childrenOf,
  nodesPointingAt,
} from './nav-resolver.js';

export { Breadcrumbs, type BreadcrumbsProps } from './Breadcrumbs.js';
export { RelatedLinks, type RelatedLinksProps } from './RelatedLinks.js';
export { Pager, type PagerProps } from './Pager.js';
export { AppNav, type AppNavProps, type AppNavClassNames } from './AppNav.js';
