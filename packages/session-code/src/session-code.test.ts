import { describe, expect, it } from 'vitest';
import {
  formatSessionCode,
  generateSessionCode,
  parseSessionCode,
  SessionCodeError,
} from './session-code.js';

describe('session-code', () => {
  it('generates a 9-character code (8 body + 1 checksum)', () => {
    const code = generateSessionCode({ random: () => 0x12345678 });
    expect(code).toMatch(/^[0-9A-Z]{9}$/);
  });

  it('is deterministic given a fixed random source', () => {
    const a = generateSessionCode({ random: () => 0xdeadbeef });
    const b = generateSessionCode({ random: () => 0xdeadbeef });
    expect(a).toEqual(b);
  });

  it('avoids visually-ambiguous Crockford chars (I/L/O/U)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSessionCode({ random: () => Math.floor(Math.random() * 0xffffffff) });
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('round-trips generate → parse', () => {
    const code = generateSessionCode({ random: () => 0xabcdef01 });
    const parsed = parseSessionCode(code);
    expect(parsed.body).toHaveLength(8);
    expect(parsed.checksum).toHaveLength(1);
    expect(parsed.shardIndex).toBeGreaterThanOrEqual(0);
    expect(parsed.shardIndex).toBeLessThan(64);
  });

  it('rejects codes with a corrupted checksum', () => {
    const code = generateSessionCode({ random: () => 0x12345678 });
    const tampered = code.slice(0, 8) + (code.charAt(8) === 'A' ? 'B' : 'A');
    expect(() => parseSessionCode(tampered)).toThrow(SessionCodeError);
  });

  it('rejects codes containing invalid characters', () => {
    expect(() => parseSessionCode('!!!ABC123')).toThrow(SessionCodeError);
  });

  it('is case-insensitive on parse', () => {
    const code = generateSessionCode({ random: () => 0x99887766 });
    const lower = code.toLowerCase();
    const parsed = parseSessionCode(lower);
    expect(parsed.body).toHaveLength(8);
  });

  it('formats with a separator', () => {
    const code = generateSessionCode({ random: () => 0x99887766 });
    const formatted = formatSessionCode(code);
    expect(formatted).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{5}$/);
  });

  it('rejects bodyLength below the minimum', () => {
    expect(() => generateSessionCode({ bodyLength: 2 })).toThrow(SessionCodeError);
  });

  it('rejects out-of-range shardBits', () => {
    expect(() => generateSessionCode({ shardBits: 1000 })).toThrow(SessionCodeError);
  });

  it('respects a custom bodyLength', () => {
    const code = generateSessionCode({ bodyLength: 12, random: () => 0x12345678 });
    expect(code).toHaveLength(13);
    const parsed = parseSessionCode(code);
    expect(parsed.body).toHaveLength(12);
  });

  it('shard index varies across a population', () => {
    const shards = new Set<number>();
    let seed = 1;
    for (let i = 0; i < 200; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const code = generateSessionCode({ random: () => seed });
      shards.add(parseSessionCode(code).shardIndex);
    }
    expect(shards.size).toBeGreaterThan(8);
  });
});
