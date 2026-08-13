import type { McpContext } from '@domio/agent-schema';
import {
  MCPError,
  validateNumber,
  validateString,
  withAuditTrail,
  type McpTool,
  type ValidationResult,
} from './types.js';
import { claimCapability } from '../../router.js';
import { compute_calculator } from './calculators.js';

export interface SweepInput {
  readonly deckId: string;
  readonly calculatorId: string;
  readonly inputName: string;
  readonly from: number;
  readonly to: number;
  readonly steps: number;
}
export interface Sample {
  readonly x: number;
  readonly y: number | string | boolean;
  readonly latencyMs: number;
}

/**
 * Sweep a calculator across a numeric range.
 *
 * Performs linear interpolation from `from` to `to` in `steps` points and
 * invokes `compute_calculator` once per point.  Performance target: ≤ 5 ms
 * per sample for ≤ 100-node DAGs (this budget refers to the per-call
 * invocation cost; see `simulate.test.ts` for an in-process timing check).
 */
export async function sweep(
  ctx: McpContext,
  calculatorId: string,
  inputName: string,
  from: number,
  to: number,
  steps: number,
): Promise<readonly Sample[]> {
  const claim = claimCapability(ctx.agentId, 'simulate');
  if (!claim.granted) throw new MCPError('PERMISSION_DENIED', claim.reason ?? 'permission denied');
  if (steps < 1) return [];
  const stepCount = Math.min(Math.max(1, Math.floor(steps)), 1024);
  const span = to - from;
  const out: Sample[] = [];
  for (let i = 0; i < stepCount; i++) {
    const t = stepCount === 1 ? 0 : i / (stepCount - 1);
    const x = from + span * t;
    const start = Date.now();
    const res = (await compute_calculator.handler(ctx, {
      deckId: ctx.tenantId,
      calculatorId,
      values: { [inputName]: x },
    })) as { result: number | string | boolean };
    out.push({ x, y: res.result, latencyMs: Date.now() - start });
  }
  return out;
}

function validateSweep(input: unknown): ValidationResult<SweepInput> {
  const issues: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, code: 'INVALID_INPUT', issues: ['input must be an object'] };
  }
  const o = input as Record<string, unknown>;
  const deckId = validateString(o['deckId'], 'deckId', issues);
  const calculatorId = validateString(o['calculatorId'], 'calculatorId', issues);
  const inputName = validateString(o['inputName'], 'inputName', issues);
  const from = validateNumber(o['from'], 'from', issues);
  const to = validateNumber(o['to'], 'to', issues);
  const steps = validateNumber(o['steps'], 'steps', issues);
  if (!deckId || !calculatorId || !inputName || from === null || to === null || steps === null) {
    return { ok: false, code: 'INVALID_INPUT', issues };
  }
  if (steps < 1) {
    return { ok: false, code: 'INVALID_INPUT', issues: ['steps must be >= 1'] };
  }
  return { ok: true, value: { deckId, calculatorId, inputName, from, to, steps } };
}

export const simulate_sweep: McpTool<
  SweepInput,
  { samples: readonly Sample[]; avgLatencyMs: number }
> = {
  name: 'simulate_sweep',
  description: 'Sweep a calculator input across a numeric range.',
  capability: 'simulate',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  handler: async (ctx, input) => {
    const v = validateSweep(input);
    if (!v.ok) throw new MCPError('INVALID_INPUT', 'invalid input', v.issues);
    return withAuditTrail(
      ctx,
      'simulate_sweep',
      { ...v.value, from: v.value.from, to: v.value.to, steps: v.value.steps },
      async () => {
        const samples = await sweep(
          ctx,
          v.value.calculatorId,
          v.value.inputName,
          v.value.from,
          v.value.to,
          v.value.steps,
        );
        const avg = samples.length
          ? samples.reduce((acc, s) => acc + s.latencyMs, 0) / samples.length
          : 0;
        return { samples, avgLatencyMs: avg };
      },
    );
  },
};

export const simulationTools = [simulate_sweep] as const;
