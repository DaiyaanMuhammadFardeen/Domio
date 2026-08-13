/**
 * @domio/presenter-session — dynamic plan reducer.
 *
 * Pure functions that take a `DynamicPlan` and an operation, returning the
 * next plan. Two co-presenters' edits CRDT-merge: the LWW rules are based
 * on `(updated_by, updated_at)`. No duplicate slides, no slide lost.
 *
 * Invariants:
 *  1. `order` is a permutation of the canonical deck slide ids.
 *  2. `hidden` is a subset of canonical slide ids.
 *  3. Hide + show is a no-op.
 */

export interface DynamicPlan {
  order: string[]; // slide ids in presenter-visible order
  hidden: string[]; // slide ids hidden from audience
  updated_by: string;
  updated_at_ms: number;
}

export interface DynamicPlanOp {
  type: 'reorder' | 'hide' | 'show' | 'reset';
  by: string;
  ts_ms: number;
  /** Reorder: the new full order (must be a permutation of canonical). */
  order?: string[];
  /** Hide/show: target slide ids. */
  slide_ids?: string[];
  /** Reset: the canonical order to reset to. */
  canonical?: string[];
}

export class DynamicPlanValidationError extends Error {
  readonly code = 'DYNAMIC_PLAN_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DynamicPlanValidationError';
  }
}

export function validateOrderAgainstCanonical(order: string[], canonical: string[]): void {
  if (order.length !== canonical.length) {
    throw new DynamicPlanValidationError(
      `order has ${order.length} slides but canonical has ${canonical.length}`,
    );
  }
  const canonicalSet = new Set(canonical);
  const seen = new Set<string>();
  for (const id of order) {
    if (!canonicalSet.has(id)) {
      throw new DynamicPlanValidationError(`order contains unknown slide id: ${id}`);
    }
    if (seen.has(id)) {
      throw new DynamicPlanValidationError(`order contains duplicate slide id: ${id}`);
    }
    seen.add(id);
  }
}

/** Apply a single op to the plan. Pure. */
export function applyDynamicPlanOp(
  current: DynamicPlan,
  op: DynamicPlanOp,
  canonical: string[],
): DynamicPlan {
  switch (op.type) {
    case 'reorder': {
      if (!op.order) {
        throw new DynamicPlanValidationError('reorder op requires order');
      }
      validateOrderAgainstCanonical(op.order, canonical);
      return {
        order: [...op.order],
        hidden: current.hidden.filter((id) => op.order!.includes(id)),
        updated_by: op.by,
        updated_at_ms: op.ts_ms,
      };
    }
    case 'hide': {
      if (!op.slide_ids || op.slide_ids.length === 0) {
        throw new DynamicPlanValidationError('hide op requires slide_ids');
      }
      const newHidden = new Set(current.hidden);
      for (const id of op.slide_ids) {
        if (!canonical.includes(id)) {
          throw new DynamicPlanValidationError(`hide unknown slide: ${id}`);
        }
        newHidden.add(id);
      }
      return {
        order: current.order,
        hidden: [...newHidden].sort(),
        updated_by: op.by,
        updated_at_ms: op.ts_ms,
      };
    }
    case 'show': {
      if (!op.slide_ids || op.slide_ids.length === 0) {
        throw new DynamicPlanValidationError('show op requires slide_ids');
      }
      const newHidden = new Set(current.hidden);
      for (const id of op.slide_ids) {
        newHidden.delete(id);
      }
      return {
        order: current.order,
        hidden: [...newHidden].sort(),
        updated_by: op.by,
        updated_at_ms: op.ts_ms,
      };
    }
    case 'reset': {
      if (!op.canonical) {
        throw new DynamicPlanValidationError('reset op requires canonical');
      }
      return {
        order: [...op.canonical],
        hidden: [],
        updated_by: op.by,
        updated_at_ms: op.ts_ms,
      };
    }
  }
}

/** Merge two dynamic plans from co-presenters using LWW per slide position.
 *  The plan with the latest `updated_at_ms` wins as a whole — simpler than
 *  per-element CRDT and adequate for two-presenter scenarios. */
export function mergeDynamicPlans(
  a: DynamicPlan,
  b: DynamicPlan,
  canonical: string[],
): DynamicPlan {
  if (a.updated_at_ms >= b.updated_at_ms) {
    // Verify a is still a valid permutation before returning.
    try {
      validateOrderAgainstCanonical(a.order, canonical);
      return a;
    } catch {
      return b;
    }
  }
  try {
    validateOrderAgainstCanonical(b.order, canonical);
    return b;
  } catch {
    return a;
  }
}

/** Resolve a stage `slide_index` against the dynamic plan. Hidden slides are
 *  skipped in the audience-visible sequence; `effective_index` is the
 *  position the audience sees (gap-removed). */
export function effectiveAudienceIndex(plan: DynamicPlan, stageIndex: number): number {
  let audienceIdx = 0;
  for (let i = 0; i < plan.order.length; i++) {
    if (i >= stageIndex) break;
    const slideId = plan.order[i];
    if (slideId === undefined) continue;
    if (!plan.hidden.includes(slideId)) audienceIdx++;
  }
  return audienceIdx;
}
