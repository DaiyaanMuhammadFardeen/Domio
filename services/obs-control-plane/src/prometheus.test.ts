/**
 * @domio/obs-control-plane — Prometheus alert generation tests.
 */

import { describe, it, expect } from 'vitest';
import {
  generateAlertsForSlo,
  generateAllAlerts,
  renderPrometheusRules,
} from './prometheus.js';
import type { SloEntry } from './types.js';

function fixtureSlo(overrides: Partial<SloEntry> = {}): SloEntry {
  return {
    service: '@domio/audience-service',
    slo: 'avail-audience',
    target: '99.9%',
    targetProbability: 0.999,
    window: '30d',
    windowSeconds: 30 * 86_400,
    tier: 'tier-1',
    owner: 'E2',
    alertPrefix: 'SLOBurnHighAudience',
    kind: 'availability',
    ...overrides,
  };
}

describe('generateAlertsForSlo', () => {
  it('produces four alerts (1h / 6h / 24h / 72h)', () => {
    const alerts = generateAlertsForSlo(fixtureSlo());
    expect(alerts).toHaveLength(4);
    expect(alerts.map((a) => a.window)).toEqual(['1h', '6h', '24h', '72h']);
  });

  it('uses page severity for tier-1 + 1h/6h windows', () => {
    const alerts = generateAlertsForSlo(fixtureSlo({ tier: 'tier-1' }));
    expect(alerts.find((a) => a.window === '1h')!.severity).toBe('page');
    expect(alerts.find((a) => a.window === '6h')!.severity).toBe('page');
    expect(alerts.find((a) => a.window === '24h')!.severity).toBe('ticket');
    expect(alerts.find((a) => a.window === '72h')!.severity).toBe('ticket');
  });

  it('downgrades severity to ticket for tier-2 services', () => {
    const alerts = generateAlertsForSlo(fixtureSlo({ tier: 'tier-2' }));
    expect(alerts.every((a) => a.severity === 'ticket')).toBe(true);
  });

  it('produces stable alert names', () => {
    const a = generateAlertsForSlo(fixtureSlo());
    const b = generateAlertsForSlo(fixtureSlo());
    expect(a.map((x) => x.alertName)).toEqual(b.map((x) => x.alertName));
  });

  it('uses T1 / T2 / T3 prefix per tier', () => {
    expect(generateAlertsForSlo(fixtureSlo({ tier: 'tier-1' }))[0]!.alertName).toContain('T1');
    expect(generateAlertsForSlo(fixtureSlo({ tier: 'tier-2' }))[0]!.alertName).toContain('T2');
    expect(generateAlertsForSlo(fixtureSlo({ tier: 'tier-3' }))[0]!.alertName).toContain('T3');
  });
});

describe('generateAllAlerts', () => {
  it('flattens alerts across multiple SLOs', () => {
    const slos = [fixtureSlo(), fixtureSlo({ slo: 'lat-audience-render-p95', kind: 'latency', latencyThresholdMs: 250 })];
    const alerts = generateAllAlerts(slos);
    expect(alerts).toHaveLength(8);
  });
});

describe('renderPrometheusRules', () => {
  it('renders a stable YAML body for identical input', () => {
    const slos = [fixtureSlo()];
    const a = renderPrometheusRules(generateAllAlerts(slos));
    const b = renderPrometheusRules(generateAllAlerts(slos));
    expect(a).toBe(b);
  });

  it('contains the alert name in the body', () => {
    const body = renderPrometheusRules(generateAllAlerts([fixtureSlo()]));
    expect(body).toContain('SLOBurnHighT1AudienceAvailAudience1h');
  });

  it('uses the http_requests_total metric for availability SLOs', () => {
    const body = renderPrometheusRules(generateAllAlerts([fixtureSlo()]));
    expect(body).toContain('http_requests_total');
    expect(body).toContain('status=~"5.."');
  });

  it('uses the http_request_duration_seconds metric for latency SLOs', () => {
    const body = renderPrometheusRules(
      generateAllAlerts([fixtureSlo({ slo: 'lat-audience-render-p95', kind: 'latency', latencyThresholdMs: 250 })]),
    );
    expect(body).toContain('http_request_duration_seconds_bucket');
  });
});
