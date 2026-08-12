/**
 * kpi-ticker — Wave 2 §S2.8 unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  clearKpiTicker,
  defaultKpiTickerConfig,
  formatKpiValue,
  readKpiTicker,
  sampleKpiTicker,
  writeKpiTicker,
  type KpiTickerConfig,
} from './kpi-ticker';

function config(overrides?: Partial<KpiTickerConfig>): KpiTickerConfig {
  return { ...defaultKpiTickerConfig(), ...overrides };
}

describe('kpi-ticker', () => {
  it('defaultKpiTickerConfig returns sensible defaults', () => {
    const cfg = defaultKpiTickerConfig();
    expect(cfg.durationMs).toBe(1500);
    expect(cfg.startValue).toBe(0);
    expect(cfg.easing).toBe('ease-out');
    expect(cfg.locale).toBe('en-US');
    expect(cfg.currency).toBeNull();
    expect(cfg.decimals).toBe(0);
  });

  it('sampleKpiTicker shows the start value before the delay elapses', () => {
    const cfg = config({ startValue: 10, targetValue: 100, durationMs: 1000, delayMs: 200 });
    const sample = sampleKpiTicker(cfg, 100);
    expect(sample.value).toBe(10);
    expect(sample.t).toBe(0);
  });

  it('sampleKpiTicker holds the target value once the duration is reached', () => {
    const cfg = config({ startValue: 0, targetValue: 100, durationMs: 1000, delayMs: 0 });
    const sample = sampleKpiTicker(cfg, 5000);
    expect(sample.value).toBe(100);
    expect(sample.t).toBe(1);
  });

  it('sampleKpiTicker applies ease-out (value >= linear at the midpoint)', () => {
    const cfg = config({ startValue: 0, targetValue: 100, durationMs: 1000, delayMs: 0, easing: 'ease-out' });
    const sample = sampleKpiTicker(cfg, 500);
    expect(sample.value).toBeGreaterThan(50);
  });

  it('sampleKpiTicker applies ease-in (value <= linear at the midpoint)', () => {
    const cfg = config({ startValue: 0, targetValue: 100, durationMs: 1000, delayMs: 0, easing: 'ease-in' });
    const sample = sampleKpiTicker(cfg, 500);
    expect(sample.value).toBeLessThan(50);
  });

  it('sampleKpiTicker restarts when loop is enabled', () => {
    const cfg = config({ startValue: 0, targetValue: 100, durationMs: 1000, delayMs: 0, loop: true });
    // Cycle = 1000ms duration + 250ms pause = 1250ms. At t=1300ms we should be in the second cycle, near t=0.
    const sample = sampleKpiTicker(cfg, 1300);
    expect(sample.value).toBeLessThan(50);
  });

  it('sampleKpiTicker honours negative start values', () => {
    const cfg = config({
      startValue: -50,
      targetValue: 50,
      durationMs: 1000,
      delayMs: 0,
      easing: 'linear',
    });
    const sample = sampleKpiTicker(cfg, 500);
    // Linear midpoint: -50 + 100 * 0.5 = 0
    expect(sample.value).toBeCloseTo(0, 5);
  });

  it('formatKpiValue applies locale, currency, and decimals', () => {
    const cfg = config({
      locale: 'de-DE',
      currency: 'EUR',
      decimals: 2,
    });
    expect(formatKpiValue(1234.56, cfg)).toContain('1.234');
    expect(formatKpiValue(1234.56, cfg)).toContain('€');
  });

  it('formatKpiValue applies prefix and suffix', () => {
    const cfg = config({ prefix: '~', suffix: ' units', decimals: 0 });
    expect(formatKpiValue(42, cfg)).toBe('~42 units');
  });

  it('formatKpiValue falls back to en-US for an unknown locale', () => {
    const cfg = config({ locale: 'not-a-locale', decimals: 0 });
    expect(formatKpiValue(1234, cfg)).toBe('1,234');
  });

  it('writeKpiTicker + readKpiTicker round-trip through props', () => {
    const cfg = config({ targetValue: 999 });
    const props = writeKpiTicker({}, cfg);
    expect(readKpiTicker(props)).toEqual(cfg);
  });

  it('readKpiTicker returns null when the key is missing', () => {
    expect(readKpiTicker(undefined)).toBeNull();
    expect(readKpiTicker({})).toBeNull();
  });

  it('clearKpiTicker removes only the ticker key', () => {
    const props = writeKpiTicker({ foo: 'bar' }, defaultKpiTickerConfig());
    const cleared = clearKpiTicker(props);
    expect(cleared.foo).toBe('bar');
    expect(readKpiTicker(cleared)).toBeNull();
  });

  it('clearKpiTicker on undefined returns an empty object', () => {
    expect(clearKpiTicker(undefined)).toEqual({});
  });
});