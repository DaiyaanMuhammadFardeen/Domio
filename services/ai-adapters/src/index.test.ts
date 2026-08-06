import { describe, it, expect } from 'vitest';
import { handleGetCapabilities, handleGetPrompt } from './index.js';

// ---------------------------------------------------------------------------
// GetCapabilities
// ---------------------------------------------------------------------------

describe('handleGetCapabilities', () => {
  it('returns capabilities for OpenAI model', () => {
    const result = handleGetCapabilities('openai/gpt-5.2-high');
    expect(result.model_class).toBe('openai/gpt-5.2-high');
    expect(result.capabilities).toContain('text');
    expect(result.capabilities).toContain('json-mode');
  });

  it('returns capabilities for Anthropic model', () => {
    const result = handleGetCapabilities('anthropic/claude-sonnet-4.5');
    expect(result.model_class).toBe('anthropic/claude-sonnet-4.5');
    expect(result.capabilities).toContain('text');
    expect(result.capabilities).toContain('tools');
  });

  it('returns capabilities for Google model', () => {
    const result = handleGetCapabilities('google/gemini-2.5-pro');
    expect(result.model_class).toBe('google/gemini-2.5-pro');
    expect(result.capabilities).toContain('text');
  });

  it('returns capabilities for VLLM model', () => {
    const result = handleGetCapabilities('vllm/qwen2.5-72b');
    expect(result.model_class).toBe('vllm/qwen2.5-72b');
    expect(result.capabilities).toContain('text');
  });

  it('throws for unknown provider', () => {
    expect(() => handleGetCapabilities('unknown/model')).toThrow('No adapter');
  });
});

// ---------------------------------------------------------------------------
// GetPrompt
// ---------------------------------------------------------------------------

describe('handleGetPrompt', () => {
  it('returns prompt template by id', () => {
    const result = handleGetPrompt('outline.from_prompt');
    expect(result.id).toBe('outline.from_prompt');
    expect(result.version).toBe(1);
    expect(result.model_class_hint).toBeTruthy();
    expect(result.system_prompt.length).toBeGreaterThan(0);
    expect(result.user_prompt_template.length).toBeGreaterThan(0);
  });

  it('returns prompt template with JSON schemas', () => {
    const result = handleGetPrompt('slide.design');
    const inputSchema = JSON.parse(result.input_schema_json) as Record<string, unknown>;
    expect(inputSchema['type']).toBe('object');
    expect(inputSchema['properties']).toBeDefined();

    const outputSchema = JSON.parse(result.output_schema_json) as Record<string, unknown>;
    expect(outputSchema['type']).toBe('object');
  });

  it('returns prompt template with evalSetId', () => {
    const result = handleGetPrompt('qa.generate');
    expect(result.eval_set_id).toBe('eval-qa-generate-v1');
  });

  it('throws for non-existent template', () => {
    expect(() => handleGetPrompt('nonexistent.template')).toThrow(
      'not found',
    );
  });

  it('returns prompt template by specific version', () => {
    const result = handleGetPrompt('outline.from_prompt', 1);
    expect(result).toBeDefined();
    expect(result!.version).toBe(1);
  });

  it('throws for non-existent version', () => {
    expect(() => handleGetPrompt('outline.from_prompt', 999)).toThrow(
      'not found',
    );
  });

  it('all 14 templates are retrievable', () => {
    const ids = [
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

    for (const id of ids) {
      const result = handleGetPrompt(id);
      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
      expect(result!.version).toBeGreaterThanOrEqual(1);
      expect(result!.system_prompt.length).toBeGreaterThan(0);
      expect(result!.user_prompt_template.length).toBeGreaterThan(0);
    }
  });
});
