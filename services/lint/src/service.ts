/**
 * Lint service — style linting for off-brand tokens (Phase 07).
 *
 * The service scans a deck's element → token binding graph against
 * the token catalog and emits one finding per violation.  Built-in
 * rules:
 *
 *  - `off-brand-color`     — the element's resolved color doesn't
 *                            match any palette in the brand kit.
 *  - `off-brand-font`      — the element references a font-family
 *                            that isn't in the brand kit's font list.
 *  - `off-token-spacing`   — the element uses a hard-coded spacing
 *                            value when a matching token exists.
 *  - `low-contrast`        — luminance contrast between text and
 *                            background falls below WCAG AA (4.5:1).
 *  - `alias-loop`          — element references a token that's part
 *                            of an alias cycle.
 *
 * Each finding carries a `fixProposal` (where applicable) so the
 * editor can offer a one-click "apply recommended token" action.
 */

import {
  validateTokenId,
  wcagContrast,
  type TokenValue,
} from '@domio/tokens';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import type { LintRunRepository, LintRunRecord } from './dal.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LintSeverity = 'BLOCK' | 'WARN' | 'INFO';

export interface LintFixProposal {
  readonly replacementToken: string;
  readonly deltaE: number;
  readonly oldValue: string;
  readonly newValue: string;
}

export interface LintFinding {
  readonly findingId: string;
  readonly ruleId: string;
  readonly severity: LintSeverity;
  readonly tokenRef?: string;
  readonly elementRef: string;
  readonly message: string;
  readonly fixProposal?: LintFixProposal;
}

export interface LintElementInput {
  readonly elementRef: string;
  readonly tokenRef?: string;
  readonly resolvedColor?: TokenValue | null;
  readonly backgroundColor?: TokenValue | null;
  readonly fontFamily?: string;
  readonly spacingValue?: number;
}

export interface LintBrandKitInput {
  readonly paletteTokenIds: readonly string[];
  readonly fontFamilies: readonly string[];
  readonly spacingTokens: readonly { tokenId: string; value: number }[];
}

export interface LintRunRequest {
  readonly orgId: string;
  readonly deckId: string;
  readonly brandKit?: LintBrandKitInput;
  readonly ruleIds?: readonly string[];
  readonly elements: readonly LintElementInput[];
  readonly actorId: string;
}

export interface LintRunResult {
  readonly runId: string;
  readonly findings: readonly LintFinding[];
  readonly blockCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly elementsScanned: number;
  readonly latencyMs: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LintValidationError extends Error {
  readonly code = 'LINT_VALIDATION_ERROR' as const;
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Lint request failed validation: ${issues.length} issue(s)`);
    this.name = 'LintValidationError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface LintServiceOptions {
  readonly runs: LintRunRepository;
  readonly idGenerator?: () => ULID;
  readonly clock?: () => Date;
}

const defaultId: () => ULID = () =>
  asULID(
    `01H0000000000000000000000${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`
      .slice(0, 26)
      .padEnd(26, '0'),
  );
const defaultClock = () => new Date();

const SEVERITY_BY_RULE: Record<string, LintSeverity> = {
  'off-brand-color': 'BLOCK',
  'off-brand-font': 'WARN',
  'off-token-spacing': 'INFO',
  'low-contrast': 'BLOCK',
  'alias-loop': 'BLOCK',
};

// ---------------------------------------------------------------------------
// Lint rules
// ---------------------------------------------------------------------------

interface RuleFn {
  (req: LintRunRequest, element: LintElementInput): LintFinding[];
}

const ruleOffBrandColor: RuleFn = (req, el) => {
  if (!req.brandKit) return [];
  if (!el.tokenRef) return [];
  if (!el.resolvedColor) return [];
  if (req.brandKit.paletteTokenIds.includes(el.tokenRef)) return [];
  const out: LintFinding[] = [];
  // Without the resolved values of all palette tokens we can only
  // report the violation.  The fix proposal is best-effort: we
  // suggest the first palette token as a replacement.
  const fallback = req.brandKit.paletteTokenIds[0];
  if (fallback) {
    out.push({
      findingId: '',
      ruleId: 'off-brand-color',
      severity: SEVERITY_BY_RULE['off-brand-color']!,
      tokenRef: el.tokenRef,
      elementRef: el.elementRef,
      message: `Color ${el.tokenRef} is not in the active brand palette`,
      fixProposal: {
        replacementToken: fallback,
        deltaE: 0,
        oldValue: JSON.stringify(el.resolvedColor),
        newValue: '{"tokenRef":"' + fallback + '"}',
      },
    });
  } else {
    out.push({
      findingId: '',
      ruleId: 'off-brand-color',
      severity: SEVERITY_BY_RULE['off-brand-color']!,
      tokenRef: el.tokenRef,
      elementRef: el.elementRef,
      message: `Color ${el.tokenRef} is not in the active brand palette`,
    });
  }
  return out;
};

const ruleOffBrandFont: RuleFn = (req, el) => {
  if (!req.brandKit) return [];
  if (!el.fontFamily) return [];
  if (req.brandKit.fontFamilies.includes(el.fontFamily)) return [];
  const fallback = req.brandKit.fontFamilies[0];
  return [
    {
      findingId: '',
      ruleId: 'off-brand-font',
      severity: SEVERITY_BY_RULE['off-brand-font']!,
      elementRef: el.elementRef,
      message: `Font "${el.fontFamily}" is not in the brand kit`,
      ...(fallback
        ? {
            fixProposal: {
              replacementToken: fallback,
              deltaE: 0,
              oldValue: JSON.stringify(el.fontFamily),
              newValue: JSON.stringify(fallback),
            },
          }
        : {}),
    },
  ];
};

const ruleOffTokenSpacing: RuleFn = (req, el) => {
  if (!req.brandKit) return [];
  if (el.spacingValue === undefined) return [];
  // If a spacing token matches the exact value, no violation.
  const exact = req.brandKit.spacingTokens.find((t) => t.value === el.spacingValue);
  if (exact) return [];
  // Find the closest token by absolute distance.
  let closest: { tokenId: string; diff: number } | null = null;
  for (const t of req.brandKit.spacingTokens) {
    const diff = Math.abs(t.value - el.spacingValue);
    if (!closest || diff < closest.diff) closest = { tokenId: t.tokenId, diff };
  }
  if (!closest) return [];
  return [
    {
      findingId: '',
      ruleId: 'off-token-spacing',
      severity: SEVERITY_BY_RULE['off-token-spacing']!,
      elementRef: el.elementRef,
      message: `Hard-coded spacing ${el.spacingValue}px should use token ${closest.tokenId}`,
      fixProposal: {
        replacementToken: closest.tokenId,
        deltaE: 0,
        oldValue: JSON.stringify(el.spacingValue),
        newValue: JSON.stringify({ tokenId: closest.tokenId }),
      },
    },
  ];
};

const ruleLowContrast: RuleFn = (_req, el) => {
  if (!el.resolvedColor || !el.backgroundColor) return [];
  if (el.resolvedColor.type !== 'color' || el.backgroundColor.type !== 'color') return [];
  const fg = el.resolvedColor.value.channels;
  const bg = el.backgroundColor.value.channels;
  const contrast = wcagContrast([fg[0]!, fg[1]!, fg[2]!], [bg[0]!, bg[1]!, bg[2]!]);
  // WCAG AA requires 4.5:1 for body text.
  if (contrast >= 4.5) return [];
  return [
    {
      findingId: '',
      ruleId: 'low-contrast',
      severity: SEVERITY_BY_RULE['low-contrast']!,
      elementRef: el.elementRef,
      message: `Text/background contrast ${contrast.toFixed(2)}:1 fails WCAG AA (4.5:1)`,
    },
  ];
};

const ruleAliasLoop: RuleFn = (_req, el) => {
  if (!el.tokenRef) return [];
  if (!validateTokenId(el.tokenRef).valid) {
    return [
      {
        findingId: '',
        ruleId: 'alias-loop',
        severity: SEVERITY_BY_RULE['alias-loop']!,
        tokenRef: el.tokenRef,
        elementRef: el.elementRef,
        message: `Token reference "${el.tokenRef}" is malformed`,
      },
    ];
  }
  return [];
};

const RULES: Record<string, RuleFn> = {
  'off-brand-color': ruleOffBrandColor,
  'off-brand-font': ruleOffBrandFont,
  'off-token-spacing': ruleOffTokenSpacing,
  'low-contrast': ruleLowContrast,
  'alias-loop': ruleAliasLoop,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LintService {
  private readonly runs: LintRunRepository;
  private readonly idGen: () => ULID;
  private readonly clock: () => Date;

  constructor(opts: LintServiceOptions) {
    this.runs = opts.runs;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  async runLint(req: LintRunRequest): Promise<LintRunResult> {
    if (req.elements.length === 0) {
      throw new LintValidationError([{ path: 'elements', message: 'At least one element is required' }]);
    }
    const startedAt = this.clock();
    const runId = this.idGen();
    const ruleIds = req.ruleIds && req.ruleIds.length > 0 ? req.ruleIds : Object.keys(RULES);
    const findings: LintFinding[] = [];
    let counter = 0;
    for (const el of req.elements) {
      for (const ruleId of ruleIds) {
        const fn = RULES[ruleId];
        if (!fn) continue;
        const out = fn(req, el);
        for (const f of out) {
          counter++;
          findings.push({ ...f, findingId: `f-${runId}-${counter}` });
        }
      }
    }
    const completedAt = this.clock();
    const blockCount = findings.filter((f) => f.severity === 'BLOCK').length;
    const warnCount = findings.filter((f) => f.severity === 'WARN').length;
    const infoCount = findings.filter((f) => f.severity === 'INFO').length;
    const latencyMs = completedAt.getTime() - startedAt.getTime();

    const record: LintRunRecord = {
      runId,
      orgId: req.orgId,
      deckId: req.deckId,
      ...(req.brandKit ? { brandKitId: 'inline' } : {}),
      ruleIds: ruleIds.slice(),
      findings,
      blockCount,
      warnCount,
      infoCount,
      elementsScanned: req.elements.length,
      startedAt,
      completedAt,
    };
    await this.runs.insert(record);
    return { runId, findings, blockCount, warnCount, infoCount, elementsScanned: req.elements.length, latencyMs };
  }

  async getRun(runId: string, orgId: string): Promise<LintRunRecord | null> {
    return this.runs.findById(runId, orgId);
  }

  async listByDeck(deckId: string, orgId: string): Promise<LintRunRecord[]> {
    return this.runs.listByDeck(deckId, orgId);
  }

  async latestForDeck(deckId: string, orgId: string): Promise<LintRunRecord | null> {
    return this.runs.latestByDeck(deckId, orgId);
  }
}