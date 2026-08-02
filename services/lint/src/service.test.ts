/**
 * Lint service tests — covers each rule + persistence + handlers.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';
import type { TokenValue } from '@domio/tokens';

import { LintService, LintValidationError } from './service.js';
import { InMemoryLintRunRepository } from './dal.js';
import type { LintBrandKitInput, LintElementInput } from './service.js';

const ORG = 'org-1';

function color(r: number, g: number, b: number, alpha = 1): TokenValue {
  return { type: 'color', value: { space: 'srgb', channels: [r, g, b], alpha } };
}

function makeService() {
  return makeServiceWithClock(() => new Date('2026-08-02T00:00:00Z'));
}

function makeServiceWithClock(clock: () => Date) {
  let counter = 0;
  const idGen = (): ULID => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return asULID(`${ts}${rand}`);
  };
  const svc = new LintService({
    runs: new InMemoryLintRunRepository(),
    idGenerator: idGen,
    clock,
  });
  return { svc };
}

const KIT: LintBrandKitInput = {
  paletteTokenIds: ['color.brand.primary', 'color.brand.secondary', 'color.text.body'],
  fontFamilies: ['Inter', 'IBM Plex Sans'],
  spacingTokens: [
    { tokenId: 'spacing.layout.gutter', value: 16 },
    { tokenId: 'spacing.layout.gutter.lg', value: 24 },
  ],
};

describe('LintService — off-brand-color', () => {
  it('flags a color outside the palette', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [
        { elementRef: 'e1', tokenRef: 'color.accent.magenta', resolvedColor: color(1, 0, 1) } as LintElementInput,
      ],
      actorId: 'alice',
    });
    const findings = res.findings.filter((f) => f.ruleId === 'off-brand-color');
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('BLOCK');
    expect(findings[0]?.fixProposal?.replacementToken).toBe('color.brand.primary');
  });

  it('passes when the color is in the palette', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [
        { elementRef: 'e1', tokenRef: 'color.brand.primary', resolvedColor: color(0.5, 0.5, 0.5) },
      ],
      actorId: 'alice',
    });
    expect(res.findings.filter((f) => f.ruleId === 'off-brand-color').length).toBe(0);
  });
});

describe('LintService — off-brand-font', () => {
  it('flags a font outside the brand kit', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [{ elementRef: 'e1', fontFamily: 'Comic Sans' }],
      actorId: 'alice',
    });
    const findings = res.findings.filter((f) => f.ruleId === 'off-brand-font');
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('WARN');
  });

  it('passes for an on-brand font', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [{ elementRef: 'e1', fontFamily: 'Inter' }],
      actorId: 'alice',
    });
    expect(res.findings.filter((f) => f.ruleId === 'off-brand-font').length).toBe(0);
  });
});

describe('LintService — off-token-spacing', () => {
  it('flags hard-coded spacing when a matching token exists', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [{ elementRef: 'e1', spacingValue: 17 }],
      actorId: 'alice',
    });
    const findings = res.findings.filter((f) => f.ruleId === 'off-token-spacing');
    expect(findings.length).toBe(1);
    expect(findings[0]?.fixProposal?.replacementToken).toBe('spacing.layout.gutter');
  });

  it('passes when spacing exactly matches a token', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [{ elementRef: 'e1', spacingValue: 16 }],
      actorId: 'alice',
    });
    expect(res.findings.filter((f) => f.ruleId === 'off-token-spacing').length).toBe(0);
  });
});

describe('LintService — low-contrast', () => {
  it('flags near-identical fg/bg colors', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [
        {
          elementRef: 'e1',
          tokenRef: 'color.text.body',
          resolvedColor: color(0.5, 0.5, 0.5),
          backgroundColor: color(0.51, 0.5, 0.5),
        },
      ],
      actorId: 'alice',
    });
    expect(res.findings.some((f) => f.ruleId === 'low-contrast')).toBe(true);
  });

  it('passes when fg and bg are visually distinct', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [
        {
          elementRef: 'e1',
          tokenRef: 'color.text.body',
          resolvedColor: color(0.0, 0.0, 0.0),
          backgroundColor: color(1.0, 1.0, 1.0),
        },
      ],
      actorId: 'alice',
    });
    expect(res.findings.filter((f) => f.ruleId === 'low-contrast').length).toBe(0);
  });
});

describe('LintService — alias-loop', () => {
  it('flags malformed token references', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [{ elementRef: 'e1', tokenRef: 'BadFormat' }],
      actorId: 'alice',
    });
    expect(res.findings.some((f) => f.ruleId === 'alias-loop')).toBe(true);
  });
});

describe('LintService — summary + persistence', () => {
  it('aggregates block/warn/info counts', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      elements: [
        { elementRef: 'e1', tokenRef: 'color.brand.off', resolvedColor: color(1, 0, 0) },
        { elementRef: 'e2', fontFamily: 'Comic Sans' },
        { elementRef: 'e3', spacingValue: 17 },
      ],
      actorId: 'alice',
    });
    expect(res.blockCount + res.warnCount + res.infoCount).toBe(res.findings.length);
    expect(res.elementsScanned).toBe(3);
  });

  it('persists and lists runs', async () => {
    let now = new Date('2026-08-02T00:00:00Z');
    const clock = () => now;
    const { svc } = makeServiceWithClock(clock);
    const a = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      elements: [{ elementRef: 'e1' }],
      actorId: 'alice',
    });
    now = new Date(now.getTime() + 1000);
    const b = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      elements: [{ elementRef: 'e1' }],
      actorId: 'alice',
    });
    const list = await svc.listByDeck('d-1', ORG);
    expect(list).toHaveLength(2);
    const latest = await svc.latestForDeck('d-1', ORG);
    expect(latest?.runId).toBe(b.runId);
    expect(a.runId).not.toBe(b.runId);
  });

  it('rejects empty element arrays', async () => {
    const { svc } = makeService();
    await expect(
      svc.runLint({
        orgId: ORG,
        deckId: 'd-1',
        elements: [],
        actorId: 'alice',
      }),
    ).rejects.toBeInstanceOf(LintValidationError);
  });

  it('filters by ruleIds', async () => {
    const { svc } = makeService();
    const res = await svc.runLint({
      orgId: ORG,
      deckId: 'd-1',
      brandKit: KIT,
      ruleIds: ['off-brand-font'],
      elements: [
        { elementRef: 'e1', fontFamily: 'Comic Sans' },
        { elementRef: 'e2', tokenRef: 'color.brand.off', resolvedColor: color(1, 0, 0) },
      ],
      actorId: 'alice',
    });
    expect(res.findings.every((f) => f.ruleId === 'off-brand-font')).toBe(true);
  });
});