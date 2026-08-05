/**
 * Broadphase warning tests.
 *
 * Verifies:
 *  - Under 10k colliders: no warning
 *  - Exactly 10k colliders: no warning (threshold is >, not >=)
 *  - Over 10k colliders: warning emitted
 *  - Custom threshold works
 *  - Warning contains the correct message and collider count
 */

import { describe, expect, it } from 'vitest';
import { checkBroadphase, BROADPHASE_WARNING_THRESHOLD } from './broadphase.js';

describe('checkBroadphase', () => {
  it('no warning when collider count is below threshold', () => {
    const result = checkBroadphase(5000);
    expect(result).toBeNull();
  });

  it('no warning at exactly 10k colliders (threshold is strict >)', () => {
    const result = checkBroadphase(10_000);
    expect(result).toBeNull();
  });

  it('warning emitted when collider count exceeds threshold', () => {
    const result = checkBroadphase(10_001);
    expect(result).not.toBeNull();
    expect(result!.message).toBe('Broadphase overhead may slow 60fps target');
    expect(result!.colliderCount).toBe(10_001);
  });

  it('warning at 20k colliders', () => {
    const result = checkBroadphase(20_000);
    expect(result).not.toBeNull();
    expect(result!.colliderCount).toBe(20_000);
  });

  it('custom threshold is respected', () => {
    const result = checkBroadphase(500, 500);
    expect(result).toBeNull(); // 500 is not > 500

    const result2 = checkBroadphase(501, 500);
    expect(result2).not.toBeNull();
    expect(result2!.colliderCount).toBe(501);
  });

  it('zero colliders produces no warning', () => {
    expect(checkBroadphase(0)).toBeNull();
  });

  it('default threshold constant is 10,000', () => {
    expect(BROADPHASE_WARNING_THRESHOLD).toBe(10_000);
  });

  it('warning message is exactly the expected string', () => {
    const result = checkBroadphase(15_000);
    expect(result!.message).toBe('Broadphase overhead may slow 60fps target');
  });
});
