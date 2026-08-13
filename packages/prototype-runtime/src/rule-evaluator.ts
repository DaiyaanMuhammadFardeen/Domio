/**
 * RuleEvaluator — evaluates a list of conditional rules against a
 * VarStore snapshot and returns the first matching rule's action.
 *
 * Ordering per spec §M2.4: `priority desc, created_at asc`. The first
 * true condition short-circuits — later rules with lower priority do not
 * see their action fired. The evaluator also supports scope filtering
 * (a rule with `scopeSlideId` only fires on the current slide).
 */

import type { Expression } from './expression/ast.js';
import { evaluateExpressionWithMetrics } from './expression/evaluator.js';
import type { ConditionalRule, RuleEvaluationResult } from './types.js';
import type { VarStore } from './var-store.js';

export interface RuleEvaluationOptions {
  /** Current slide id; rules with `scopeSlideId !== null && !== slideId` are skipped. */
  readonly currentSlideId?: string;
  /** Optional clock injected for tests. */
  readonly now?: () => number;
}

export class RuleEvaluator {
  /** Cached compiled ASTs keyed by `${ruleId}:${hash}`. */
  private readonly compiled = new Map<string, Expression>();

  /** Evaluate all rules and return the first match. */
  evaluate(
    rules: readonly ConditionalRule[],
    store: VarStore,
    opts: RuleEvaluationOptions = {},
  ): RuleEvaluationResult {
    const sorted = [...rules]
      .filter((r) => r.enabled)
      .filter((r) => (r.scopeSlideId === null ? true : r.scopeSlideId === opts.currentSlideId))
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      });

    const clock = opts.now ?? (() => Date.now());
    const started = clock();
    const vars = collect(store);

    for (const rule of sorted) {
      const ast = this.ensureCompiled(rule);
      const { value, elapsedMs } = evaluateExpressionWithMetrics(ast, { vars, now: clock });
      if (value === true) {
        return {
          matched: true,
          ruleId: rule.id,
          action: rule.action,
          elapsedMs: clock() - started + elapsedMs,
        };
      }
    }

    return {
      matched: false,
      ruleId: null,
      action: null,
      elapsedMs: clock() - started,
    };
  }

  /**
   * Evaluate a single rule against the current snapshot. Returns the
   * boolean result of the condition. Used by the editor's "Test rule"
   * preview.
   */
  testRule(rule: ConditionalRule, store: VarStore): { matched: boolean; elapsedMs: number } {
    const ast = this.ensureCompiled(rule);
    const vars = collect(store);
    const { value, elapsedMs } = evaluateExpressionWithMetrics(ast, { vars });
    return { matched: value === true, elapsedMs };
  }

  /** Drop the compile cache (used after editor updates). */
  invalidate(ruleId?: string): void {
    if (ruleId) {
      for (const k of Array.from(this.compiled.keys())) {
        if (k.startsWith(`${ruleId}:`)) this.compiled.delete(k);
      }
    } else {
      this.compiled.clear();
    }
  }

  private ensureCompiled(rule: ConditionalRule): Expression {
    // The compiled condition is stored on the rule object after the
    // service hydrates it; if it's still a string we treat that as the
    // source and compile on demand. In production the service pre-compiles.
    if (typeof rule.condition === 'object' && rule.condition !== null && 'kind' in rule.condition) {
      return rule.condition as Expression;
    }
    throw new Error(
      `Rule ${rule.id} has uncompiled condition; ensure the service pre-compiles conditions`,
    );
  }
}

function collect(store: VarStore): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of store.allNames()) {
    out[name] = store.read(name);
  }
  return out;
}
