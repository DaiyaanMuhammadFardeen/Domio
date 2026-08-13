import { describe, it, expect } from 'vitest';
import { TEMPLATES, getTemplate, listTemplates, TemplateNotFoundError } from './index.js';

// ---------------------------------------------------------------------------
// All 14 templates present with unique IDs
// ---------------------------------------------------------------------------

describe('TEMPLATES', () => {
  it('contains all 14 required templates', () => {
    const expectedIds = [
      'outline.from_prompt',
      'outline.from_doc',
      'outline.from_data',
      'slide.design',
      'slide.redesign',
      'notes.generate',
      'qa.generate',
      'summary.executive',
      'summary.tldr',
      'translate.preserve_layout',
      'accessibility.alt_text',
      'accessibility.captions',
      'freshness.check',
      'lint.layout',
    ];

    const actualIds = TEMPLATES.map((t) => t.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
    expect(actualIds.length).toBe(14);
  });

  it('has unique IDs', () => {
    const ids = TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every template has version >= 1', () => {
    for (const t of TEMPLATES) {
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('every template has modelClassHint', () => {
    for (const t of TEMPLATES) {
      expect(t.modelClassHint).toBeTruthy();
      expect(typeof t.modelClassHint).toBe('string');
    }
  });

  it('every template has systemPrompt and userPromptTemplate', () => {
    for (const t of TEMPLATES) {
      expect(t.systemPrompt.length).toBeGreaterThan(0);
      expect(t.userPromptTemplate.length).toBeGreaterThan(0);
    }
  });

  it('every template has inputSchema and outputSchema', () => {
    for (const t of TEMPLATES) {
      expect(t.inputSchema).toBeDefined();
      expect(t.outputSchema).toBeDefined();
      expect(typeof t.inputSchema).toBe('object');
      expect(typeof t.outputSchema).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// getTemplate — exact lookup
// ---------------------------------------------------------------------------

describe('getTemplate', () => {
  it('returns exact template by id (latest version)', () => {
    const t = getTemplate('outline.from_prompt');
    expect(t).toBeDefined();
    expect(t!['id']).toBe('outline.from_prompt');
    expect(t!['version']).toBe(1);
  });

  it('returns undefined for non-existent version', () => {
    const t = getTemplate('outline.from_prompt', 999);
    expect(t).toBeUndefined();
  });

  it('throws TemplateNotFoundError for unknown id', () => {
    expect(() => getTemplate('nonexistent.template')).toThrow(TemplateNotFoundError);
  });

  it('TemplateNotFoundError lists available ids', () => {
    try {
      getTemplate('nonexistent.template');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateNotFoundError);
      const typedErr = err as TemplateNotFoundError;
      expect(typedErr.availableIds.length).toBe(14);
      expect(typedErr.message).toContain('outline.from_prompt');
    }
  });

  it('returns template by specific version', () => {
    // Version 1 exists for all templates
    const t = getTemplate('slide.design', 1);
    expect(t).toBeDefined();
    expect(t!['version']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// listTemplates
// ---------------------------------------------------------------------------

describe('listTemplates', () => {
  it('returns latest version of each template', () => {
    const templates = listTemplates();
    expect(templates.length).toBe(14);

    // Each ID should appear exactly once
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(14);
  });

  it('all returned templates have version >= 1', () => {
    const templates = listTemplates();
    for (const t of templates) {
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Placeholder validation — every userPromptTemplate placeholder matches inputSchema
// ---------------------------------------------------------------------------

describe('Placeholder validation', () => {
  it('every userPromptTemplate placeholder matches inputSchema properties', () => {
    for (const t of TEMPLATES) {
      // Extract {placeholders} from userPromptTemplate
      const placeholderRegex = /\{(\w+)\}/g;
      const placeholders: string[] = [];
      let match;
      while ((match = placeholderRegex.exec(t.userPromptTemplate)) !== null) {
        placeholders.push(match[1]!);
      }

      // Get inputSchema properties
      const inputProps = t.inputSchema['properties'] as Record<string, unknown> | undefined;
      const propKeys = inputProps ? Object.keys(inputProps) : [];

      // Every placeholder should be a property in inputSchema
      for (const ph of placeholders) {
        expect(propKeys).toContain(ph);
      }
    }
  });

  it('no dangling placeholders in any template', () => {
    for (const t of TEMPLATES) {
      const placeholderRegex = /\{(\w+)\}/g;
      let match;
      const inputProps = t.inputSchema['properties'] as Record<string, unknown> | undefined;
      const propKeys = inputProps ? new Set(Object.keys(inputProps)) : new Set<string>();

      while ((match = placeholderRegex.exec(t.userPromptTemplate)) !== null) {
        expect(propKeys.has(match[1]!)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// evalSetId naming convention
// ---------------------------------------------------------------------------

describe('evalSetId convention', () => {
  it('evalSetIds follow eval-<normalized-id>-v<version> pattern', () => {
    for (const t of TEMPLATES) {
      if (t.evalSetId) {
        // Convention: dots and underscores in template IDs are replaced with hyphens
        const normalizedId = t.id.replace(/[._]/g, '-');
        const expected = `eval-${normalizedId}-v${t.version}`;
        expect(t.evalSetId).toBe(expected);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Schema quality — inputSchema and outputSchema are valid JSON Schema-ish
// ---------------------------------------------------------------------------

describe('Schema quality', () => {
  it('inputSchema has type: object at root', () => {
    for (const t of TEMPLATES) {
      expect(t.inputSchema['type']).toBe('object');
      expect(t.inputSchema['properties']).toBeDefined();
    }
  });

  it('outputSchema has type: object at root', () => {
    for (const t of TEMPLATES) {
      expect(t.outputSchema['type']).toBe('object');
      expect(t.outputSchema['properties']).toBeDefined();
    }
  });
});
