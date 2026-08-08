/**
 * Ops validation — tests (Phase 18 #182).
 */

import { describe, it, expect } from 'vitest';
import { validateOp } from './ops.js';
import type { SuggestionOperation } from '../types.js';
import { SuggestionValidationError } from '../types.js';

function makeOp(overrides: Partial<SuggestionOperation> = {}): SuggestionOperation {
  return {
    type: 'move',
    params: { target_id: 'el-1' },
    before_state: { x: 0, y: 0 },
    after_state: { x: 100, y: 50 },
    ...overrides,
  };
}

describe('validateOp', () => {
  it('accepts valid move op', () => {
    expect(() => validateOp(makeOp({ type: 'move' }))).not.toThrow();
  });

  it('accepts valid resize op', () => {
    expect(() => validateOp(makeOp({ type: 'resize' }))).not.toThrow();
  });

  it('accepts valid restyle op', () => {
    expect(() => validateOp(makeOp({ type: 'restyle' }))).not.toThrow();
  });

  it('accepts valid theme op', () => {
    expect(() => validateOp(makeOp({ type: 'theme' }))).not.toThrow();
  });

  it('accepts valid data_binding op', () => {
    expect(() => validateOp(makeOp({ type: 'data_binding' }))).not.toThrow();
  });

  it('accepts valid content op with structured params', () => {
    expect(() =>
      validateOp(makeOp({
        type: 'content',
        params: { paragraphs: [{ text: 'Hello' }] },
      })),
    ).not.toThrow();
  });

  it('accepts content op with blocks params', () => {
    expect(() =>
      validateOp(makeOp({
        type: 'content',
        params: { blocks: [{ type: 'paragraph', content: 'Hi' }] },
      })),
    ).not.toThrow();
  });

  it('rejects unknown op type', () => {
    expect(() => validateOp(makeOp({ type: 'unknown_type' as never }))).toThrow(SuggestionValidationError);
  });

  it('rejects raw text via params.text', () => {
    expect(() =>
      validateOp(makeOp({
        type: 'content',
        params: { text: 'Hello world' },
      })),
    ).toThrow(SuggestionValidationError);
  });

  it('rejects raw text via params.value without structured content', () => {
    expect(() =>
      validateOp(makeOp({
        type: 'content',
        params: { value: 'Hello world' },
      })),
    ).toThrow(SuggestionValidationError);
  });

  it('accepts params.value if paragraphs present', () => {
    expect(() =>
      validateOp(makeOp({
        type: 'content',
        params: { value: 'Hello', paragraphs: [{ text: 'Hello' }] },
      })),
    ).not.toThrow();
  });

  it('rejects null operation', () => {
    expect(() => validateOp(null as never)).toThrow(SuggestionValidationError);
  });

  it('rejects operation with missing params', () => {
    const op = { type: 'move', before_state: {}, after_state: {} };
    expect(() => validateOp(op as never)).toThrow(SuggestionValidationError);
  });

  it('rejects operation with missing before_state', () => {
    const op = { type: 'move', params: {}, after_state: {} };
    expect(() => validateOp(op as never)).toThrow(SuggestionValidationError);
  });

  it('rejects operation with missing after_state', () => {
    const op = { type: 'move', params: {}, before_state: {} };
    expect(() => validateOp(op as never)).toThrow(SuggestionValidationError);
  });
});
