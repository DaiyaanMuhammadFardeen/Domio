/**
 * Tests for the pointer-ping canvas component.
 *
 * Because the editor's vitest environment is `node` (no jsdom) and
 * @testing-library/react is not installed, these tests exercise the
 * exported pure helpers and verify type contracts.  The component
 * itself is a thin render wrapper over CSS animations, so testing
 * the helpers gives thorough coverage of the core logic.
 */

import { describe, it, expect } from 'vitest';
import {
  pingColor,
  isPingActive,
  getPingProgress,
  type PointerPingEvent,
  type PointerPingProps,
} from './pointer-ping.js';

// ──────────────────────────────────────────────
//  pingColor
// ──────────────────────────────────────────────

describe('pingColor', () => {
  it('returns a non-empty string for any actor ID', () => {
    const color = pingColor('user-alice');
    expect(typeof color).toBe('string');
    expect(color.length).toBeGreaterThan(0);
  });

  it('returns the same colour for the same actor (deterministic)', () => {
    const a = pingColor('actor-42');
    const b = pingColor('actor-42');
    expect(a).toBe(b);
  });

  it('returns different colours for different actors', () => {
    const alice = pingColor('alice');
    const bob = pingColor('bob');
    expect(alice).not.toBe(bob);
  });
});

// ──────────────────────────────────────────────
//  isPingActive
// ──────────────────────────────────────────────

describe('isPingActive', () => {
  const base: PointerPingEvent = {
    id: 'ping-1',
    actorId: 'peer-a',
    position: { x: 100, y: 200 },
    timestamp: 1000,
  };

  it('returns true when elapsed time is less than duration', () => {
    expect(isPingActive(base, 1500, 1200)).toBe(true);
  });

  it('returns true at the exact start', () => {
    expect(isPingActive(base, 1000, 1200)).toBe(true);
  });

  it('returns false when elapsed time equals duration', () => {
    expect(isPingActive(base, 2200, 1200)).toBe(false);
  });

  it('returns false when elapsed time exceeds duration', () => {
    expect(isPingActive(base, 5000, 1200)).toBe(false);
  });

  it('returns true with a very short duration at time 0', () => {
    const ping: PointerPingEvent = {
      id: 'ping-short',
      actorId: 'x',
      position: { x: 0, y: 0 },
      timestamp: 0,
    };
    expect(isPingActive(ping, 0, 1)).toBe(true);
  });
});

// ──────────────────────────────────────────────
//  getPingProgress
// ──────────────────────────────────────────────

describe('getPingProgress', () => {
  const base: PointerPingEvent = {
    id: 'ping-prog',
    actorId: 'peer-b',
    position: { x: 50, y: 50 },
    timestamp: 1000,
  };

  it('returns 0 at the start of the animation', () => {
    expect(getPingProgress(base, 1000, 1200)).toBe(0);
  });

  it('returns 0.5 at the halfway mark', () => {
    expect(getPingProgress(base, 1600, 1200)).toBeCloseTo(0.5);
  });

  it('returns 1 at the end of the animation', () => {
    expect(getPingProgress(base, 2200, 1200)).toBe(1);
  });

  it('clamps to 1 when elapsed exceeds duration', () => {
    expect(getPingProgress(base, 10_000, 1200)).toBe(1);
  });

  it('clamps to 0 for negative elapsed (future timestamp)', () => {
    const future: PointerPingEvent = {
      ...base,
      timestamp: 5000,
    };
    expect(getPingProgress(future, 1000, 1200)).toBe(0);
  });
});

// ──────────────────────────────────────────────
//  Type contracts
// ──────────────────────────────────────────────

describe('type contracts', () => {
  it('PointerPingEvent has the expected shape', () => {
    const event: PointerPingEvent = {
      id: 'test',
      actorId: 'user',
      position: { x: 0, y: 0 },
      timestamp: Date.now(),
    };
    expect(event.id).toBe('test');
    expect(event.position.x).toBe(0);
  });

  it('PointerPingProps allows optional fields', () => {
    const props: PointerPingProps = {
      events: [],
      // durationMs and ringSizePx are optional — should compile
    };
    expect(props.events).toHaveLength(0);
    expect(props.durationMs).toBeUndefined();
    expect(props.ringSizePx).toBeUndefined();
  });

  it('PointerPingProps with all fields', () => {
    const props: PointerPingProps = {
      events: [
        {
          id: '1',
          actorId: 'a',
          position: { x: 10, y: 20 },
          timestamp: 1000,
        },
      ],
      durationMs: 800,
      ringSizePx: 200,
    };
    expect(props.events).toHaveLength(1);
    expect(props.durationMs).toBe(800);
    expect(props.ringSizePx).toBe(200);
  });
});
