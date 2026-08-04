/**
 * RuleEvaluator tests — priority ordering, short-circuit, scope filter.
 */

import { describe, expect, it } from 'vitest';
import { compileExpression } from './expression/compiler.js';
import type { Expression } from './expression/ast.js';
import { RuleEvaluator } from './rule-evaluator.js';
import { VarStore } from './var-store.js';
import type { ConditionalRule } from './types.js';

function makeRule(over: Partial<ConditionalRule> & { id: string; priority: number; createdAt: number }): ConditionalRule {
  const conditionSource = over.conditionSource ?? '$x > 0';
  const ast: Expression = compileExpression(conditionSource).ast;
  return {
    tenantId: 't1',
    deckId: 'd1',
    name: over.name ?? 'rule',
    scopeSlideId: over.scopeSlideId ?? null,
    action: over.action ?? { kind: 'show', params: { targetId: 'el' } },
    enabled: over.enabled ?? true,
    version: 0,
    createdAt: over.createdAt,
    updatedAt: 0,
    condition: ast,
    conditionSource,
    priority: over.priority,
    id: over.id,
  };
}

describe('RuleEvaluator', () => {
  it('matches the first rule in priority-desc, created-at-asc order', () => {
    const rules = [
      makeRule({ id: 'low', priority: 0, createdAt: 1, conditionSource: '$x > 0' }),
      makeRule({ id: 'high', priority: 10, createdAt: 5, conditionSource: '$x > 0' }),
    ];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store);
    expect(r.matched).toBe(true);
    expect(r.ruleId).toBe('high');
  });

  it('breaks priority ties by created_at asc', () => {
    const rules = [
      makeRule({ id: 'second', priority: 5, createdAt: 2, conditionSource: '$x > 0' }),
      makeRule({ id: 'first', priority: 5, createdAt: 1, conditionSource: '$x > 0' }),
    ];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store);
    expect(r.ruleId).toBe('first');
  });

  it('returns no match when no rule fires', () => {
    const rules = [makeRule({ id: 'a', priority: 0, createdAt: 0, conditionSource: '$x > 100' })];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store);
    expect(r.matched).toBe(false);
  });

  it('skips disabled rules', () => {
    const rules = [makeRule({ id: 'a', priority: 0, createdAt: 0, conditionSource: '$x > 0', enabled: false })];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store);
    expect(r.matched).toBe(false);
  });

  it('skips rules outside the current slide scope', () => {
    const rules = [
      makeRule({
        id: 'a',
        priority: 0,
        createdAt: 0,
        conditionSource: '$x > 0',
        scopeSlideId: 's9',
      }),
    ];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store, { currentSlideId: 's3' });
    expect(r.matched).toBe(false);
  });

  it('fires scope-bound rule on the matching slide', () => {
    const rules = [
      makeRule({
        id: 'a',
        priority: 0,
        createdAt: 0,
        conditionSource: '$x > 0',
        scopeSlideId: 's3',
      }),
    ];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store, { currentSlideId: 's3' });
    expect(r.matched).toBe(true);
  });

  it('first-match short-circuits', () => {
    const rules = [
      makeRule({
        id: 'a',
        priority: 10,
        createdAt: 0,
        conditionSource: '$x > 0',
        action: { kind: 'show', params: { targetId: 'a' } },
      }),
      makeRule({
        id: 'b',
        priority: 5,
        createdAt: 0,
        conditionSource: '$x > 0',
        action: { kind: 'hide', params: { targetId: 'b' } },
      }),
    ];
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    const r = new RuleEvaluator().evaluate(rules, store);
    expect(r.ruleId).toBe('a');
    expect(r.action?.kind).toBe('show');
  });

  it('testRule returns boolean for the condition alone', () => {
    const rule = makeRule({ id: 'a', priority: 0, createdAt: 0, conditionSource: '$x > 0' });
    const store = new VarStore();
    store.write('x', 5, { scope: 'deck' });
    expect(new RuleEvaluator().testRule(rule, store).matched).toBe(true);
    store.write('x', -1, { scope: 'deck' });
    expect(new RuleEvaluator().testRule(rule, store).matched).toBe(false);
  });
});