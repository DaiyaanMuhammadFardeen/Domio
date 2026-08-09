/**
 * Tests for the N+1 detector.
 *
 * Builds synthetic OTel trace exports with known N+1 patterns and
 * asserts the detector flags them.
 */

import { describe, it, expect } from 'vitest';
import {
  detectNPlusOne,
  hashStatement,
  summariseNPlusOne,
  tier1ReadEndpoints,
  type OtelSpan,
  type OtelTrace,
} from './n_plus_one.js';
import type { SloEntry } from './types.js';

function buildTrace(spans: readonly OtelSpan[]): OtelTrace {
  return {
    resourceSpans: [
      {
        scopeSpans: [{ spans }],
      },
    ],
  };
}

function span(
  id: string,
  parent: string | undefined,
  name: string,
  attrs: Record<string, string> = {},
): OtelSpan {
  return {
    traceId: 'trace-1',
    spanId: id,
    parentSpanId: parent,
    name,
    startTimeUnixNano: '0',
    endTimeUnixNano: '1000',
    attributes: attrs,
  };
}

describe('hashStatement', () => {
  it('produces stable hex output', () => {
    const h1 = hashStatement('SELECT * FROM decks WHERE id = $1');
    const h2 = hashStatement('SELECT * FROM decks WHERE id = $1');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different statements', () => {
    expect(hashStatement('SELECT * FROM a')).not.toBe(hashStatement('SELECT * FROM b'));
  });
});

describe('detectNPlusOne', () => {
  it('flags a classic N+1 pattern', () => {
    const parent = span('p1', undefined, 'GET /decks/:id');
    const children: OtelSpan[] = [];
    for (let i = 0; i < 10; i++) {
      children.push(
        span(`c${i}`, 'p1', 'db.query', {
          'db.system': 'postgresql',
          'db.collection': 'slides',
          'db.statement': `SELECT * FROM slides WHERE deck_id = $1`,
          'db.statement.args': String(i),
        }),
      );
    }
    const trace = buildTrace([parent, ...children]);
    const report = detectNPlusOne(trace, { minRepeat: 5 });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.parentSpanId).toBe('p1');
    expect(report.findings[0]?.repeatCount).toBe(10);
    expect(report.findings[0]?.distinctArgs).toBe(10);
  });

  it('does not flag a small repeat count', () => {
    const parent = span('p1', undefined, 'GET /decks/:id');
    const children: OtelSpan[] = [];
    for (let i = 0; i < 3; i++) {
      children.push(
        span(`c${i}`, 'p1', 'db.query', {
          'db.system': 'postgresql',
          'db.collection': 'slides',
          'db.statement': 'SELECT * FROM slides WHERE deck_id = $1',
          'db.statement.args': String(i),
        }),
      );
    }
    const trace = buildTrace([parent, ...children]);
    const report = detectNPlusOne(trace, { minRepeat: 5 });
    expect(report.findings).toHaveLength(0);
  });

  it('flags high fanout backstop', () => {
    const parent = span('p1', undefined, 'GET /decks/:id/all');
    const children: OtelSpan[] = [];
    for (let i = 0; i < 60; i++) {
      children.push(
        span(`c${i}`, 'p1', 'cache.lookup', { cache: 'memory' }),
      );
    }
    const trace = buildTrace([parent, ...children]);
    const report = detectNPlusOne(trace, { childFanoutThreshold: 50 });
    expect(report.highFanoutParents).toHaveLength(1);
    expect(report.highFanoutParents[0]?.childCount).toBe(60);
  });

  it('passes on a clean trace', () => {
    const parent = span('p1', undefined, 'GET /health');
    const c1 = span('c1', 'p1', 'cache.lookup', { cache: 'memory' });
    const c2 = span('c2', 'p1', 'db.query', {
      'db.system': 'postgresql',
      'db.collection': 'health',
      'db.statement': 'SELECT 1',
      'db.statement.args': '0',
    });
    const trace = buildTrace([parent, c1, c2]);
    const report = detectNPlusOne(trace);
    expect(report.pass).toBe(true);
  });

  it('groups by db collection', () => {
    const parent = span('p1', undefined, 'GET /decks/:id/related');
    const children: OtelSpan[] = [];
    for (let i = 0; i < 6; i++) {
      children.push(
        span(`c${i}`, 'p1', 'db.query', {
          'db.system': 'postgresql',
          'db.collection': 'elements',
          'db.statement': 'SELECT * FROM elements WHERE slide_id = $1',
          'db.statement.args': String(i),
        }),
      );
    }
    for (let i = 0; i < 6; i++) {
      children.push(
        span(`d${i}`, 'p1', 'db.query', {
          'db.system': 'postgresql',
          'db.collection': 'comments',
          'db.statement': 'SELECT * FROM comments WHERE slide_id = $1',
          'db.statement.args': String(i),
        }),
      );
    }
    const trace = buildTrace([parent, ...children]);
    const report = detectNPlusOne(trace, { minRepeat: 5 });
    expect(report.findings).toHaveLength(2);
    const collections = report.findings.map((f) => f.dbCollection).sort();
    expect(collections).toEqual(['comments', 'elements']);
  });
});

describe('summariseNPlusOne', () => {
  it('aggregates findings across reports', () => {
    const parent = span('p1', undefined, 'GET /x');
    const children: OtelSpan[] = [];
    for (let i = 0; i < 6; i++) {
      children.push(
        span(`c${i}`, 'p1', 'db.query', {
          'db.system': 'postgresql',
          'db.collection': 'a',
          'db.statement': 'SELECT 1',
          'db.statement.args': String(i),
        }),
      );
    }
    const report = detectNPlusOne(buildTrace([parent, ...children]), { minRepeat: 5 });
    const summary = summariseNPlusOne([report]);
    expect(summary.totalFindings).toBe(1);
    expect(summary.servicesWithFindings).toContain('GET /x');
    expect(summary.pass).toBe(false);
  });
});

describe('tier1ReadEndpoints', () => {
  const slos: SloEntry[] = [
    { service: '@domio/collab', slo: 'comments.list', tier: 'tier-1', sli: '', target: '99%', targetProbability: 0.99, window: '30d', windowSeconds: 30 * 86400, owner: '', alertPrefix: 'x', kind: 'availability' },
    { service: '@domio/collab', slo: 'comments.list', tier: 'tier-1', sli: '', target: '99%', targetProbability: 0.99, window: '30d', windowSeconds: 30 * 86400, owner: '', alertPrefix: 'x', kind: 'availability' },
    { service: '@domio/realtime-gateway', slo: 'presence.upsert', tier: 'tier-1', sli: '', target: '99%', targetProbability: 0.99, window: '30d', windowSeconds: 30 * 86400, owner: '', alertPrefix: 'x', kind: 'availability' },
    { service: '@domio/library', slo: 'library.list', tier: 'tier-2', sli: '', target: '99%', targetProbability: 0.99, window: '30d', windowSeconds: 30 * 86400, owner: '', alertPrefix: 'x', kind: 'availability' },
  ];

  it('deduplicates tier-1 endpoints', () => {
    const endpoints = tier1ReadEndpoints(slos);
    expect(endpoints).toHaveLength(2);
    expect(endpoints.map((e) => e.operation).sort()).toEqual(['comments.list', 'presence.upsert']);
  });
});