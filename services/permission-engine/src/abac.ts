/**
 * @domio/permission-engine — scoped ABAC predicates (P20.5 B1).
 *
 * Two ABAC cases required for beta per `phase-20.5-beta-security-hardening.md`
 * §4.1 (T-B1.4):
 *
 *   1. **Brand-locked regions.** Editor blocked from editing elements in a
 *      `brandLockRegions` region unless the user has role `admin` or
 *      `owner`. (See feature #36 in the planning package.)
 *
 *   2. **Restricted-data public share.** Editor can create a public share
 *      link only if the deck has no element flagged `containsRestrictedData`.
 *
 * Full P20 WS-X5 replaces these with a CEL-based engine compiled to WASM.
 * P20.5 ships just these two cases — enough to validate the policy engine
 * gate without dragging in a CEL evaluator for beta.
 *
 * Both predicates are pure functions of (subject, action, resource, context).
 * They follow the resolution order from §1.G1:
 *   ABAC deny > ABAC allow > RBAC grants > tenant default.
 */

import type { WorkspaceRole } from './types.js';

// ---------------------------------------------------------------------------
// Subject (caller)
// ---------------------------------------------------------------------------

export interface PolicySubject {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  /** Set of capability tokens (e.g. from the resolver's role baseline). */
  readonly capabilities: readonly string[];
}

// ---------------------------------------------------------------------------
// Resource — minimal shape for the two cases
// ---------------------------------------------------------------------------

export interface PolicyResource {
  /** Resource kind for the ABAC predicate (e.g. 'slide-element', 'deck'). */
  readonly kind: 'slide-element' | 'deck';
  readonly id: string;
  /** For slide-element: which regions on the canvas (e.g. 'header', 'footer-left'). */
  readonly regions?: readonly string[];
  /** For deck: whether any element is flagged as restricted. */
  readonly containsRestrictedData?: boolean;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export type PolicyAction =
  | 'slide-element.edit'
  | 'slide-element.create'
  | 'deck.share.create';

// ---------------------------------------------------------------------------
// Context — request-level facts
// ---------------------------------------------------------------------------

export interface PolicyContext {
  /** For deck.share.create: what scope the share link will have. */
  readonly shareScope?: 'private' | 'team' | 'public';
  /** Optional trace id for auditability. */
  readonly traceId?: string;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export type PolicyEffect = 'allow' | 'deny';

export interface PolicyDecision {
  readonly effect: PolicyEffect;
  readonly reason: string;
  readonly rule: string;
}

// ---------------------------------------------------------------------------
// ABAC predicates
// ---------------------------------------------------------------------------

/**
 * Brand-locked regions: editor blocked from editing elements in a locked
 * region; admin/owner always allowed.
 *
 * The `lockedRegions` set is passed via the resource's regions — callers
 * pre-filter their element list to elements in locked regions.
 *
 * @returns `deny` for `editor` (and below) on locked-region edits;
 *          `allow` for `admin` / `owner`.
 */
export function brandLockRegionsPolicy(
  subject: PolicySubject,
  action: PolicyAction,
  resource: PolicyResource,
): PolicyDecision {
  if (action !== 'slide-element.edit' && action !== 'slide-element.create') {
    return { effect: 'allow', reason: 'action not covered by brand-lock rule', rule: 'brand_lock_regions' };
  }

  if (resource.kind !== 'slide-element') {
    return { effect: 'allow', reason: 'resource not subject to brand lock', rule: 'brand_lock_regions' };
  }

  const isLocked = (resource.regions ?? []).some((r) => BRAND_LOCKED_REGIONS.has(r));
  if (!isLocked) {
    return { effect: 'allow', reason: 'element not in a locked region', rule: 'brand_lock_regions' };
  }

  if (subject.role === 'admin' || subject.role === 'owner') {
    return { effect: 'allow', reason: 'admin role bypasses brand lock', rule: 'brand_lock_regions' };
  }

  return {
    effect: 'deny',
    reason: `role ${subject.role} cannot edit elements in brand-locked regions`,
    rule: 'brand_lock_regions',
  };
}

/**
 * Restricted-data public share: editor can create a public share link only
 * if the deck has no element flagged `containsRestrictedData`. Admin/owner
 * can override (to support legal/compliance workflows post-beta).
 */
export function restrictedDataSharePolicy(
  subject: PolicySubject,
  action: PolicyAction,
  resource: PolicyResource,
  context: PolicyContext,
): PolicyDecision {
  if (action !== 'deck.share.create') {
    return { effect: 'allow', reason: 'action not covered by restricted-share rule', rule: 'restricted_data_share' };
  }

  if (resource.kind !== 'deck') {
    return { effect: 'allow', reason: 'resource not a deck', rule: 'restricted_data_share' };
  }

  if (context.shareScope !== 'public') {
    // Team / private share is allowed regardless of restricted data.
    return { effect: 'allow', reason: 'share scope is not public', rule: 'restricted_data_share' };
  }

  if (!resource.containsRestrictedData) {
    return { effect: 'allow', reason: 'no restricted data flagged', rule: 'restricted_data_share' };
  }

  if (subject.role === 'admin' || subject.role === 'owner') {
    return { effect: 'allow', reason: 'admin override for restricted data share', rule: 'restricted_data_share' };
  }

  return {
    effect: 'deny',
    reason: 'public share blocked: deck contains restricted data',
    rule: 'restricted_data_share',
  };
}

// ---------------------------------------------------------------------------
// Combined evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a policy decision across all registered ABAC predicates.
 * Resolution order:
 *   1. First ABAC `deny` wins (any deny short-circuits).
 *   2. Otherwise, first ABAC `allow` wins.
 *   3. If no ABAC rule fired, the caller falls back to RBAC.
 *
 * A predicate is considered to have "fired" only when it made a substantive
 * decision — i.e. when the action/resource was relevant to its rule.
 * Pass-through responses (action not covered / resource not applicable) are
 * treated as "no opinion" so they don't shadow a real decision from another
 * predicate.
 */
export function evaluateAbac(
  subject: PolicySubject,
  action: PolicyAction,
  resource: PolicyResource,
  context: PolicyContext,
): PolicyDecision {
  const decisions: PolicyDecision[] = [
    brandLockRegionsPolicy(subject, action, resource),
    restrictedDataSharePolicy(subject, action, resource, context),
  ];

  const relevant = decisions.filter(
    (d) =>
      !d.reason.startsWith('action not covered') &&
      !d.reason.startsWith('resource not'),
  );

  // First deny wins
  const deny = relevant.find((d) => d.effect === 'deny');
  if (deny) return deny;

  // First allow among the relevant rules wins
  const allow = relevant.find((d) => d.effect === 'allow');
  return (
    allow ?? {
      effect: 'allow',
      reason: 'no ABAC rule fired; fallback to RBAC',
      rule: 'fallback',
    }
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default brand-locked regions. Matches feature #36 in the planning package.
 * Callers can override via their own predicate if they need a different
 * region set.
 */
export const BRAND_LOCKED_REGIONS: ReadonlySet<string> = new Set([
  'header',
  'footer-left',
  'footer-right',
  'logo-zone',
]);