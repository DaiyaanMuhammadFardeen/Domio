import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';
import { list_hotspots } from './hotspots.js';
import { list_rules } from './rules.js';
import { list_variables } from './variables.js';
import { list_calculators } from './calculators.js';
import { list_overlays } from './overlays.js';

export interface DiffEntry {
  readonly kind: string;
  readonly id: string;
  readonly a?: unknown;
  readonly b?: unknown;
}

export interface DeckDiff {
  readonly added: readonly DiffEntry[];
  readonly removed: readonly DiffEntry[];
  readonly changed: readonly DiffEntry[];
}

interface Identifiable {
  readonly id?: string;
  readonly name?: string;
}

function keyOf(x: Identifiable): string {
  return (x.id ?? x.name ?? JSON.stringify(x)) as string;
}

function diffArrays<T extends Identifiable>(
  a: readonly T[],
  b: readonly T[],
): {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
} {
  const aMap = new Map(a.map((x) => [keyOf(x), x] as const));
  const bMap = new Map(b.map((x) => [keyOf(x), x] as const));
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  for (const [k, v] of bMap) {
    if (!aMap.has(k)) added.push({ kind: 'item', id: k, b: v });
    else if (JSON.stringify(aMap.get(k)) !== JSON.stringify(v)) {
      changed.push({ kind: 'item', id: k, a: aMap.get(k), b: v });
    }
  }
  for (const [k, v] of aMap) {
    if (!bMap.has(k)) removed.push({ kind: 'item', id: k, a: v });
  }
  return { added, removed, changed };
}

export async function diffDecks(
  ctx: McpContext,
  deckIdA: string,
  deckIdB: string,
): Promise<DeckDiff> {
  const claim = claimCapability(ctx.agentId, 'deck-diff');
  if (!claim.granted) throw new MCPError('PERMISSION_DENIED', claim.reason ?? 'permission denied');
  const ctxA = { ...ctx } as McpContext;
  const ctxB = { ...ctx } as McpContext;
  const [hotA, hotB, ruleA, ruleB, varA, varB, calcA, calcB, ovA, ovB] = await Promise.all([
    list_hotspots.handler(ctxA, { deckId: deckIdA }),
    list_hotspots.handler(ctxB, { deckId: deckIdB }),
    list_rules.handler(ctxA, { deckId: deckIdA }),
    list_rules.handler(ctxB, { deckId: deckIdB }),
    list_variables.handler(ctxA, { deckId: deckIdA }),
    list_variables.handler(ctxB, { deckId: deckIdB }),
    list_calculators.handler(ctxA, { deckId: deckIdA }),
    list_calculators.handler(ctxB, { deckId: deckIdB }),
    list_overlays.handler(ctxA, { deckId: deckIdA }),
    list_overlays.handler(ctxB, { deckId: deckIdB }),
  ] as const);
  const all: DiffEntry[] = [];
  const push = (
    label: string,
    r: { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[] },
  ) => {
    const tag = (e: DiffEntry, suffix: string): DiffEntry => ({ ...e, kind: `${label}.${suffix}` });
    r.added.forEach((e) => all.push({ ...tag(e, 'added'), b: e.b }));
    r.removed.forEach((e) => all.push({ ...tag(e, 'removed'), a: e.a }));
    r.changed.forEach((e) => all.push({ ...tag(e, 'changed'), a: e.a, b: e.b }));
  };
  push('hotspot', diffArrays(hotA as unknown as Identifiable[], hotB as unknown as Identifiable[]));
  push('rule', diffArrays(ruleA as unknown as Identifiable[], ruleB as unknown as Identifiable[]));
  push(
    'variable',
    diffArrays(varA as unknown as Identifiable[], varB as unknown as Identifiable[]),
  );
  push(
    'calculator',
    diffArrays(calcA as unknown as Identifiable[], calcB as unknown as Identifiable[]),
  );
  push('overlay', diffArrays(ovA as unknown as Identifiable[], ovB as unknown as Identifiable[]));
  return {
    added: all.filter((e) => e.kind.endsWith('.added')),
    removed: all.filter((e) => e.kind.endsWith('.removed')),
    changed: all.filter((e) => e.kind.endsWith('.changed')),
  };
}

function validateDiff(input: unknown): ValidationResult<{ deckIdA: string; deckIdB: string }> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckIdA = validateString(o['deckIdA'], 'deckIdA', issues);
  const deckIdB = validateString(o['deckIdB'], 'deckIdB', issues);
  if (!deckIdA || !deckIdB) return { ok: false, code: 'INVALID_INPUT', issues };
  return { ok: true, value: { deckIdA, deckIdB } };
}

export const deck_diff: McpTool<{ deckIdA: string; deckIdB: string }, DeckDiff> = {
  name: 'deck_diff',
  description: 'Compare two decks and return added/removed/changed prototyping entities.',
  capability: 'deck-diff',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    const v = validateDiff(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(ctx, 'deck_diff', v.value, async () =>
      diffDecks(ctx, v.value.deckIdA, v.value.deckIdB),
    );
  },
};

export const deckDiffTools = [deck_diff] as const;
