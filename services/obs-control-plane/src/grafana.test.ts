/**
 * @domio/obs-control-plane — Grafana dashboard generator tests.
 */

import { describe, it, expect } from 'vitest';
import { generateDashboard } from './grafana.js';
import type { SloEntry } from './types.js';

function sloFixture(overrides: Partial<SloEntry> = {}): SloEntry {
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

describe('generateDashboard', () => {
  it('produces a dashboard with title and uid derived from service name', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [],
    });
    expect(dash.title).toBe('Audience Service — Service Overview');
    expect(dash.uid).toBe('domio-audience');
  });

  it('tags the dashboard with tier + service + domio', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [],
    });
    expect(dash.tags).toContain('tier-1');
    expect(dash.tags).toContain('domio');
    expect(dash.tags).toContain('audience');
  });

  it('starts with the three RED panels (rate, error, latency)', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [],
    });
    const titles = dash.panels.map((p) => p.title);
    expect(titles).toContain('Request rate (req/s)');
    expect(titles).toContain('Error rate (%)');
    expect(titles).toContain('Latency p95 (ms)');
  });

  it('adds an SLO panel per SLO', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [
        sloFixture(),
        sloFixture({ slo: 'lat-audience-p95', kind: 'latency', latencyThresholdMs: 250 }),
      ],
    });
    const sloPanels = dash.panels.filter(
      (p) => p.title.includes('avail-audience') || p.title.includes('lat-audience-p95'),
    );
    expect(sloPanels).toHaveLength(2);
  });

  it('uses histogram_quantile for latency panels in PromQL targets', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [],
    });
    const latPanel = dash.panels.find((p) => p.title.startsWith('Latency'))!;
    expect(latPanel.targets[0]!.expr).toContain('histogram_quantile(0.95');
  });

  it('emits a valid schemaVersion (39 is current)', () => {
    const dash = generateDashboard({
      service: '@domio/audience-service',
      displayName: 'Audience Service',
      tier: 'tier-1',
      slos: [],
    });
    expect(dash.schemaVersion).toBe(39);
  });
});
