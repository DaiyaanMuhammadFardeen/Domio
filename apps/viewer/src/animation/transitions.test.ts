/**
 * @domio/viewer — transitions tests.
 */

import { describe, it, expect } from 'vitest';
import {
  transitionDuration,
  transitionProps,
  appliesReducedMotion,
  TransitionError,
  type TransitionKind,
} from './transitions.js';

const ALL_KINDS: TransitionKind[] = [
  'fade', 'slide', 'wipe', 'zoom', 'flip', 'bubble', 'cube', 'shutter',
];

// ─── transitionDuration ─────────────────────────────────────────

describe('transitionDuration', () => {
  it('returns a positive number for all 8 kinds', () => {
    for (const kind of ALL_KINDS) {
      const dur = transitionDuration(kind, 300);
      expect(dur).toBeGreaterThan(0);
    }
  });

  it('returns kind-specific durations', () => {
    expect(transitionDuration('fade', 300)).toBe(300);
    expect(transitionDuration('slide', 300)).toBe(400);
    expect(transitionDuration('wipe', 300)).toBe(350);
    expect(transitionDuration('zoom', 300)).toBe(350);
    expect(transitionDuration('flip', 300)).toBe(500);
    expect(transitionDuration('bubble', 300)).toBe(450);
    expect(transitionDuration('cube', 300)).toBe(600);
    expect(transitionDuration('shutter', 300)).toBe(400);
  });

  it('throws for unknown kind', () => {
    // @ts-expect-error — testing invalid input
    expect(() => transitionDuration('unknown', 300)).toThrow(TransitionError);
  });

  it('throws UNKNOWN_KIND code for unknown kind', () => {
    try {
      // @ts-expect-error — testing invalid input
      transitionDuration('slide-in', 300);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError);
      expect((e as TransitionError).code).toBe('UNKNOWN_KIND');
    }
  });
});

// ─── transitionProps ────────────────────────────────────────────

describe('transitionProps', () => {
  it('returns an object for all 8 kinds', () => {
    for (const kind of ALL_KINDS) {
      const props = transitionProps(kind);
      expect(props).toBeDefined();
      expect(typeof props).toBe('object');
    }
  });

  it('fade has opacity', () => {
    const props = transitionProps('fade');
    expect(props.opacity).toEqual([0, 1]);
  });

  it('slide has opacity and transform', () => {
    const props = transitionProps('slide');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.transform).toBe('translateX(100%)');
  });

  it('zoom has opacity and transform', () => {
    const props = transitionProps('zoom');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.transform).toBe('scale(0)');
  });

  it('flip has opacity and transform', () => {
    const props = transitionProps('flip');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.transform).toBe('rotateY(90deg)');
  });

  it('cube has opacity and transform', () => {
    const props = transitionProps('cube');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.transform).toBe('rotateY(-90deg)');
  });

  it('bubble has opacity and transform', () => {
    const props = transitionProps('bubble');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.transform).toBe('scale(0.1)');
  });

  it('wipe has opacity and css clipPath', () => {
    const props = transitionProps('wipe');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.css?.clipPath).toBeDefined();
  });

  it('shutter has opacity and css clipPath', () => {
    const props = transitionProps('shutter');
    expect(props.opacity).toEqual([0, 1]);
    expect(props.css?.clipPath).toBeDefined();
  });

  it('throws for unknown kind', () => {
    // @ts-expect-error — testing invalid input
    expect(() => transitionProps('bounce')).toThrow(TransitionError);
  });
});

// ─── appliesReducedMotion ──────────────────────────────────────

describe('appliesReducedMotion', () => {
  it('returns true for flip', () => {
    expect(appliesReducedMotion('flip')).toBe(true);
  });

  it('returns true for cube', () => {
    expect(appliesReducedMotion('cube')).toBe(true);
  });

  it('returns true for bubble', () => {
    expect(appliesReducedMotion('bubble')).toBe(true);
  });

  it('returns true for shutter', () => {
    expect(appliesReducedMotion('shutter')).toBe(true);
  });

  it('returns false for fade', () => {
    expect(appliesReducedMotion('fade')).toBe(false);
  });

  it('returns false for slide', () => {
    expect(appliesReducedMotion('slide')).toBe(false);
  });

  it('returns false for wipe', () => {
    expect(appliesReducedMotion('wipe')).toBe(false);
  });

  it('returns false for zoom', () => {
    expect(appliesReducedMotion('zoom')).toBe(false);
  });

  it('throws for unknown kind', () => {
    // @ts-expect-error — testing invalid input
    expect(() => appliesReducedMotion('parallax')).toThrow(TransitionError);
  });

  it('all motion-heavy kinds are correctly identified', () => {
    const motionHeavy = ALL_KINDS.filter((k) => appliesReducedMotion(k));
    expect(motionHeavy).toEqual(['flip', 'bubble', 'cube', 'shutter']);
  });

  it('all non-motion-heavy kinds are correctly identified', () => {
    const nonMotionHeavy = ALL_KINDS.filter((k) => !appliesReducedMotion(k));
    expect(nonMotionHeavy).toEqual(['fade', 'slide', 'wipe', 'zoom']);
  });
});
