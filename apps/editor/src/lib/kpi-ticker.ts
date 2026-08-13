/**
 * KPI ticker — Wave 2 §S2.8.
 *
 * A KPI ticker is a number-rendering animation that counts up from a
 * baseline value to a target value over a configurable duration with a
 * designer-chosen easing. The format (locale, currency, decimals,
 * prefix/suffix) is decoupled from the animation so a single ticker can
 * present "$1.2M" or "1,234 units" without rewiring the value curve.
 *
 * Storage:
 *   The ticker lives under `x-domio:kpi-ticker` in the element's
 *   `component.props`, mirroring the timeline + motion-path conventions.
 *   The target value is held alongside so the runtime can resolve it
 *   from the data binding without inspecting other props.
 */

import { applyEasing } from './motion-path';

export interface KpiTickerConfig {
  /** Display name (used in the layers panel + minified panel). */
  name: string;
  /** Target value (the number the ticker animates to). */
  targetValue: number;
  /** Optional starting value (default 0). */
  startValue: number;
  /** Animation duration in ms. */
  durationMs: number;
  /** Delay before the animation starts (ms). */
  delayMs: number;
  /** Easing token. */
  easing: string;
  /** Locale for `Intl.NumberFormat`. */
  locale: string;
  /** Optional currency (when style === 'currency'). */
  currency: string | null;
  /** Decimal precision (overrides locale defaults). */
  decimals: number | null;
  /** String prepended before the formatted value (e.g. a unit). */
  prefix: string;
  /** String appended after the formatted value. */
  suffix: string;
  /** When true, the ticker loops (count → reset → count). */
  loop: boolean;
  /** Color of the value text (CSS color). */
  color: string;
  /** Font size in px. */
  fontSizePx: number;
  /** Font weight (100..900). */
  fontWeight: number;
}

export interface KpiTickerSample {
  /** The current numeric value (between start and target). */
  value: number;
  /** The fully-formatted string ready for display. */
  formatted: string;
  /** Local progress t (0..1) through the active cycle. */
  t: number;
}

/**
 * Compute the current sample at `timeMs` from the start of the animation.
 *
 * When `timeMs` is before `delayMs` the ticker shows the start value.
 * When `timeMs` is past the end the ticker holds at the target value
 * (or restarts when `loop === true`).
 */
export function sampleKpiTicker(config: KpiTickerConfig, timeMs: number): KpiTickerSample {
  const local = Math.max(0, timeMs - config.delayMs);
  let t: number;
  if (config.durationMs <= 0) {
    t = 1;
  } else if (config.loop) {
    const cycle = config.durationMs + 250; // pause between repeats
    t = (local % cycle) / config.durationMs;
    if (t > 1) t = 1; // hold at target during the pause
  } else if (local >= config.durationMs) {
    t = 1;
  } else {
    t = local / config.durationMs;
  }
  const eased = applyEasing(t, config.easing);
  const value = config.startValue + (config.targetValue - config.startValue) * eased;
  return { value, formatted: formatKpiValue(value, config), t };
}

export function formatKpiValue(value: number, config: KpiTickerConfig): string {
  const opts: Intl.NumberFormatOptions = {};
  if (config.decimals !== null) {
    opts.minimumFractionDigits = config.decimals;
    opts.maximumFractionDigits = config.decimals;
  }
  if (config.currency !== null) {
    opts.style = 'currency';
    opts.currency = config.currency;
  }
  let body: string;
  try {
    body = new Intl.NumberFormat(config.locale, opts).format(value);
  } catch {
    body = new Intl.NumberFormat('en-US', opts).format(value);
  }
  return `${config.prefix}${body}${config.suffix}`;
}

/** Sensible defaults for a fresh KPI ticker element. */
export function defaultKpiTickerConfig(name = 'KPI Ticker'): KpiTickerConfig {
  return {
    name,
    targetValue: 100,
    startValue: 0,
    durationMs: 1500,
    delayMs: 0,
    easing: 'ease-out',
    locale: 'en-US',
    currency: null,
    decimals: 0,
    prefix: '',
    suffix: '',
    loop: false,
    color: 'var(--fg, #eee)',
    fontSizePx: 64,
    fontWeight: 600,
  };
}

const KEY = 'x-domio:kpi-ticker';

export function readKpiTicker(props: Record<string, unknown> | undefined): KpiTickerConfig | null {
  if (!props) return null;
  const value = props[KEY];
  if (typeof value !== 'object' || value === null) return null;
  return value as KpiTickerConfig;
}

export function writeKpiTicker(
  props: Record<string, unknown> | undefined,
  config: KpiTickerConfig,
): Record<string, unknown> {
  return { ...(props ?? {}), [KEY]: config };
}

export function clearKpiTicker(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const next = { ...props };
  delete next[KEY];
  return next;
}
