/**
 * Brand-aware MCP tool tests.
 */

import { describe, it, expect } from 'vitest';
import {
  brandTools,
  findBrandTool,
  type BrandToolContext,
  type BrandToolDeps,
} from './brand-tools.js';

const ctx: BrandToolContext = {
  agentId: 'agent-1',
  workspaceId: 'workspace-1',
  agentBrandContextId: 'brand-a',
};

function makeDeps(): BrandToolDeps {
  return {
    async applyTheme(input) {
      return {
        applied: true,
        tokensChangedCount: 42,
        latencyMs: 12,
        fromThemeId: 'theme-old',
        toThemeId: input.themeId,
        brandContextId: input.brandContextId,
      };
    },
    async auditA11y(input) {
      return {
        themeId: input.themeId,
        brandContextId: input.brandContextId,
        findings: [
          {
            severity: 'BLOCK',
            tokenId: 'color.content.primary',
            issue: 'WCAG contrast 3.1:1 is below 4.5:1',
            suggestion: 'color.content.strong',
          },
        ],
        prefersReducedMotionSafe: true,
      };
    },
    async suggestPalette(input) {
      return {
        brandContextId: input.brandContextId,
        proposedHexes: ['#d73027', '#4575b4'],
        hueSpacingDeg: 120,
      };
    },
  };
}

describe('brand-aware MCP tools', () => {
  it('registers all three Phase 07 tools', () => {
    expect(brandTools.map((t) => t.name)).toEqual([
      'apply_theme',
      'token.audit_a11y',
      'theme.suggest_palette',
    ]);
  });

  it('finds a tool by name', () => {
    expect(findBrandTool('apply_theme')?.name).toBe('apply_theme');
    expect(findBrandTool('missing')).toBeUndefined();
  });

  it('applies a theme within the agent brand scope', async () => {
    const tool = findBrandTool('apply_theme')!;
    const result = await tool.run(
      makeDeps(),
      { themeId: 'theme-new', brandContextId: 'brand-a', deckId: 'deck-1' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { applied: boolean }).applied).toBe(true);
      expect((result.data as { toThemeId: string }).toThemeId).toBe('theme-new');
    }
  });

  it('rejects cross-brand theme apply with BRAND_SCOPE_VIOLATION', async () => {
    const tool = findBrandTool('apply_theme')!;
    const result = await tool.run(
      makeDeps(),
      { themeId: 'theme-b', brandContextId: 'brand-b', deckId: 'deck-1' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BRAND_SCOPE_VIOLATION');
    }
  });

  it('returns structured accessibility audit findings', async () => {
    const tool = findBrandTool('token.audit_a11y')!;
    const result = await tool.run(
      makeDeps(),
      { themeId: 'theme-a', brandContextId: 'brand-a' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { findings: readonly { severity: string; tokenId: string }[] };
      expect(data.findings[0]!.severity).toBe('BLOCK');
      expect(data.findings[0]!.tokenId).toBe('color.content.primary');
    }
  });

  it('rejects cross-brand a11y audit', async () => {
    const tool = findBrandTool('token.audit_a11y')!;
    const result = await tool.run(
      makeDeps(),
      { themeId: 'theme-b', brandContextId: 'brand-b' },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BRAND_SCOPE_VIOLATION');
  });

  it('returns a CVD-safe palette proposal', async () => {
    const tool = findBrandTool('theme.suggest_palette')!;
    const result = await tool.run(
      makeDeps(),
      { brandContextId: 'brand-a', currentPaletteHexes: ['#aa3a14', '#33180c'] },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { hueSpacingDeg: number; proposedHexes: readonly string[] };
      expect(data.hueSpacingDeg).toBeGreaterThanOrEqual(30);
      expect(data.proposedHexes).toHaveLength(2);
    }
  });

  it('returns ERR_VALIDATION for missing required tool input', async () => {
    const tool = findBrandTool('apply_theme')!;
    const result = await tool.run(makeDeps(), { brandContextId: 'brand-a' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ERR_VALIDATION');
  });

  it('allows unscoped agents to operate on any brand context', async () => {
    const tool = findBrandTool('apply_theme')!;
    const unscoped: BrandToolContext = { ...ctx, agentBrandContextId: null };
    const result = await tool.run(
      makeDeps(),
      { themeId: 'theme-b', brandContextId: 'brand-b', deckId: 'deck-1' },
      unscoped,
    );
    expect(result.ok).toBe(true);
  });
});
