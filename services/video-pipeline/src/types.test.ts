/**
 * Video pipeline — types tests (Phase 11).
 *
 * Covers:
 * - isValidTransition: all valid transitions
 * - isValidTransition: all invalid transitions (terminal states, backward)
 * - PRIORITY_ORDER mapping
 */

import { describe, it, expect } from 'vitest';
import { isValidTransition, PRIORITY_ORDER } from './types.js';

describe('isValidTransition — valid transitions', () => {
  it('queued → processing is valid', () => {
    expect(isValidTransition('queued', 'processing')).toBe(true);
  });

  it('queued → failed is valid (cancel from queued)', () => {
    expect(isValidTransition('queued', 'failed')).toBe(true);
  });

  it('processing → ready is valid', () => {
    expect(isValidTransition('processing', 'ready')).toBe(true);
  });

  it('processing → failed is valid', () => {
    expect(isValidTransition('processing', 'failed')).toBe(true);
  });
});

describe('isValidTransition — invalid transitions', () => {
  it('queued → ready is invalid (skip processing)', () => {
    expect(isValidTransition('queued', 'ready')).toBe(false);
  });

  it('queued → queued is invalid (self-loop)', () => {
    expect(isValidTransition('queued', 'queued')).toBe(false);
  });

  it('processing → queued is invalid (backward)', () => {
    expect(isValidTransition('processing', 'queued')).toBe(false);
  });

  it('processing → processing is invalid (self-loop)', () => {
    expect(isValidTransition('processing', 'processing')).toBe(false);
  });

  it('ready → any is invalid (terminal)', () => {
    expect(isValidTransition('ready', 'queued')).toBe(false);
    expect(isValidTransition('ready', 'processing')).toBe(false);
    expect(isValidTransition('ready', 'failed')).toBe(false);
    expect(isValidTransition('ready', 'ready')).toBe(false);
  });

  it('failed → any is invalid (terminal)', () => {
    expect(isValidTransition('failed', 'queued')).toBe(false);
    expect(isValidTransition('failed', 'processing')).toBe(false);
    expect(isValidTransition('failed', 'ready')).toBe(false);
    expect(isValidTransition('failed', 'failed')).toBe(false);
  });
});

describe('PRIORITY_ORDER', () => {
  it('high has highest priority (lowest number)', () => {
    expect(PRIORITY_ORDER.high).toBe(0);
  });

  it('normal has middle priority', () => {
    expect(PRIORITY_ORDER.normal).toBe(1);
  });

  it('low has lowest priority (highest number)', () => {
    expect(PRIORITY_ORDER.low).toBe(2);
  });

  it('high < normal < low', () => {
    expect(PRIORITY_ORDER.high).toBeLessThan(PRIORITY_ORDER.normal);
    expect(PRIORITY_ORDER.normal).toBeLessThan(PRIORITY_ORDER.low);
  });
});
