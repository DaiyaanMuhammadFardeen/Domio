/**
 * Brand-aware MCP tools (Phase 07 WS-THEME-10 / P13 hooks).
 *
 * Implements three tool surfaces referenced from the Phase 07 spec:
 *
 *   - `apply_theme` — wraps `theme_service.apply()`. Carries
 *     `brandContextId` scope; an agent with Brand A scope cannot apply
 *     Brand B's theme (returns `403 BRAND_SCOPE_VIOLATION`).
 *   - `token.audit_a11y` — returns structured WCAG / CVD / motion-reduced
 *     violations with severity, location, and a suggested fix.
 *   - `theme.suggest_palette` — returns a CVD-safe palette proposal that
 *     preserves hue-spacing ≥ 30° in OKLCH.
 *
 * The dependencies are injected as a small `BrandToolDeps` interface so
 * the MCP server can wire this against the real theme-service,
 * brand-service, and the accessibility-audit-worker without coupling
 * them here.  Errors are mapped to a structured result; the tool never
 * throws.
 */

// ---------------------------------------------------------------------------
// Tool result + context (matches the registry's `MCPTool` shape)
// ---------------------------------------------------------------------------

export interface BrandToolContext {
  readonly agentId: string;
  readonly workspaceId: string;
  /** The brand context the agent is scoped to (null = no scope). */
  readonly agentBrandContextId: string | null;
}

export type BrandToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export interface BrandTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly run: (
    deps: BrandToolDeps,
    input: Record<string, unknown>,
    ctx: BrandToolContext,
  ) => Promise<BrandToolResult>;
}

// ---------------------------------------------------------------------------
// Dependencies injected from the real services
// ---------------------------------------------------------------------------

export interface ApplyThemeInput {
  readonly themeId: string;
  readonly brandContextId: string;
  readonly deckId: string;
  readonly actorId: string;
}

export interface ApplyThemeResult {
  readonly applied: boolean;
  readonly tokensChangedCount: number;
  readonly latencyMs: number;
  readonly fromThemeId: string;
  readonly toThemeId: string;
  readonly brandContextId: string;
}

export interface A11yAuditInput {
  readonly themeId: string;
  readonly brandContextId: string;
}

export interface A11yAuditFinding {
  readonly severity: 'BLOCK' | 'WARN' | 'INFO';
  readonly tokenId: string;
  readonly issue: string;
  readonly suggestion?: string;
}

export interface A11yAuditResult {
  readonly themeId: string;
  readonly brandContextId: string;
  readonly findings: readonly A11yAuditFinding[];
  readonly prefersReducedMotionSafe: boolean;
}

export interface PaletteProposalInput {
  readonly brandContextId: string;
  readonly currentPaletteHexes: readonly string[];
}

export interface PaletteProposalResult {
  readonly brandContextId: string;
  readonly proposedHexes: readonly string[];
  readonly hueSpacingDeg: number;
}

export interface BrandToolDeps {
  applyTheme(input: ApplyThemeInput): Promise<ApplyThemeResult>;
  auditA11y(input: A11yAuditInput): Promise<A11yAuditResult>;
  suggestPalette(input: PaletteProposalInput): Promise<PaletteProposalResult>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BrandToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'BrandToolError';
  }
}

function toResult(err: unknown): BrandToolResult {
  if (err instanceof BrandToolError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  return {
    ok: false,
    error: {
      code: 'ERR_VALIDATION',
      message: err instanceof Error ? err.message : 'Unknown error',
    },
  };
}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new BrandToolError('ERR_VALIDATION', `Missing or invalid "${key}" string`);
  }
  return v;
}

function requireStringArray(input: Record<string, unknown>, key: string): readonly string[] {
  const v = input[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new BrandToolError('ERR_VALIDATION', `Missing or invalid "${key}" string[]`);
  }
  return v as string[];
}

// ---------------------------------------------------------------------------
// apply_theme
// ---------------------------------------------------------------------------

const applyThemeTool: BrandTool = {
  name: 'apply_theme',
  description:
    'Apply a theme to a deck. Carries brandContextId scope; an agent scoped to Brand A cannot apply Brand B themes.',
  inputSchema: {
    type: 'object',
    required: ['themeId', 'brandContextId', 'deckId'],
    properties: {
      themeId: { type: 'string', minLength: 1 },
      brandContextId: { type: 'string', minLength: 1 },
      deckId: { type: 'string', minLength: 1 },
    },
  },
  async run(deps, input, ctx) {
    try {
      const themeId = requireString(input, 'themeId');
      const brandContextId = requireString(input, 'brandContextId');
      const deckId = requireString(input, 'deckId');
      if (ctx.agentBrandContextId && ctx.agentBrandContextId !== brandContextId) {
        return {
          ok: false,
          error: {
            code: 'BRAND_SCOPE_VIOLATION',
            message: `Agent is scoped to brand context ${ctx.agentBrandContextId}; cannot apply theme from ${brandContextId}`,
          },
        };
      }
      const result = await deps.applyTheme({
        themeId,
        brandContextId,
        deckId,
        actorId: ctx.agentId,
      });
      return { ok: true, data: result };
    } catch (e) {
      return toResult(e);
    }
  },
};

// ---------------------------------------------------------------------------
// token.audit_a11y
// ---------------------------------------------------------------------------

const auditA11yTool: BrandTool = {
  name: 'token.audit_a11y',
  description:
    'Run WCAG + APCA + CVD audit on a theme. Returns structured findings with severity, location, and suggested fix.',
  inputSchema: {
    type: 'object',
    required: ['themeId', 'brandContextId'],
    properties: {
      themeId: { type: 'string', minLength: 1 },
      brandContextId: { type: 'string', minLength: 1 },
    },
  },
  async run(deps, input, ctx) {
    try {
      const themeId = requireString(input, 'themeId');
      const brandContextId = requireString(input, 'brandContextId');
      if (ctx.agentBrandContextId && ctx.agentBrandContextId !== brandContextId) {
        return {
          ok: false,
          error: {
            code: 'BRAND_SCOPE_VIOLATION',
            message: `Agent cannot audit themes outside its brand scope (${ctx.agentBrandContextId})`,
          },
        };
      }
      const audit = await deps.auditA11y({ themeId, brandContextId });
      return { ok: true, data: audit };
    } catch (e) {
      return toResult(e);
    }
  },
};

// ---------------------------------------------------------------------------
// theme.suggest_palette
// ---------------------------------------------------------------------------

const suggestPaletteTool: BrandTool = {
  name: 'theme.suggest_palette',
  description:
    'Propose a CVD-safe palette preserving hue-spacing ≥ 30° in OKLCH. The proposal can be reverted in one user action.',
  inputSchema: {
    type: 'object',
    required: ['brandContextId', 'currentPaletteHexes'],
    properties: {
      brandContextId: { type: 'string', minLength: 1 },
      currentPaletteHexes: {
        type: 'array',
        items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        minItems: 1,
      },
    },
  },
  async run(deps, input, ctx) {
    try {
      const brandContextId = requireString(input, 'brandContextId');
      const currentPaletteHexes = requireStringArray(input, 'currentPaletteHexes');
      if (ctx.agentBrandContextId && ctx.agentBrandContextId !== brandContextId) {
        return {
          ok: false,
          error: {
            code: 'BRAND_SCOPE_VIOLATION',
            message: `Agent cannot suggest palettes outside its brand scope (${ctx.agentBrandContextId})`,
          },
        };
      }
      const proposal = await deps.suggestPalette({ brandContextId, currentPaletteHexes });
      return { ok: true, data: proposal };
    } catch (e) {
      return toResult(e);
    }
  },
};

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

export const brandTools: readonly BrandTool[] = [
  applyThemeTool,
  auditA11yTool,
  suggestPaletteTool,
];

export function findBrandTool(name: string): BrandTool | undefined {
  return brandTools.find((t) => t.name === name);
}
