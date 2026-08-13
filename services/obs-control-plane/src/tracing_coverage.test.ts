/**
 * @domio/obs-control-plane — tracing coverage tests.
 */

import { describe, it, expect } from 'vitest';
import { checkTracingCoverage } from './tracing_coverage.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SloEntry } from './types.js';

function tmpTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'trace-cov-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    const parentParts = path.split('/').slice(0, -1);
    if (parentParts.length > 0) {
      mkdirSync(join(dir, ...parentParts), { recursive: true });
    }
    writeFileSync(full, content);
  }
  return dir;
}

const SAMPLE_SLO: SloEntry = {
  service: '@domio/example-svc',
  slo: 'avail-example',
  target: '99.9%',
  targetProbability: 0.999,
  window: '30d',
  windowSeconds: 30 * 86400,
  tier: 'tier-1',
  owner: 'Platform',
  alertPrefix: 'SLOBurnHighExample',
  kind: 'availability',
};

describe('checkTracingCoverage', () => {
  it('passes when tier-1 service has tracer + root span + dependency', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({
        name: '@domio/example-svc',
        dependencies: { '@domio/observability': 'workspace:*' },
      }),
      'services/example-svc/src/tracer.ts': `
        import { Tracer } from '@domio/observability/trace';
        export const tracer = new Tracer({ resource: {}, exporter: null });
      `,
      'services/example-svc/src/handler.ts': `
        import { tracer } from './tracer.js';
        export async function handle(req: unknown) {
          return tracer.startSpan('handle', { kind: 'server' });
        }
      `,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      expect(report.pass).toBe(true);
      expect(report.issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags missing dependency', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({ name: '@domio/example-svc' }),
      'services/example-svc/src/tracer.ts': `const x = new Tracer({});`,
      'services/example-svc/src/handler.ts': `tracer.startSpan('h');`,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      expect(report.pass).toBe(false);
      expect(report.issues.some((i) => i.kind === 'missing-dependency')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags no tracer instantiation', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({
        name: '@domio/example-svc',
        dependencies: { '@domio/observability': 'workspace:*' },
      }),
      'services/example-svc/src/handler.ts': `function noop() {}`,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      expect(report.pass).toBe(false);
      expect(report.issues.some((i) => i.kind === 'no-tracer-instantiation')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags no root-span call', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({
        name: '@domio/example-svc',
        dependencies: { '@domio/observability': 'workspace:*' },
      }),
      'services/example-svc/src/tracer.ts': `export const tracer = new Tracer({});`,
      'services/example-svc/src/handler.ts': `// no spans here`,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      expect(report.pass).toBe(false);
      expect(report.issues.some((i) => i.kind === 'no-root-span')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits a warn (not an error) when tier-2 service is missing the dep', () => {
    const tier2: SloEntry = {
      ...SAMPLE_SLO,
      service: '@domio/lower',
      slo: 'avail-lower',
      tier: 'tier-2',
    };
    const dir = tmpTree({
      'services/lower/package.json': JSON.stringify({ name: '@domio/lower' }),
    });
    try {
      const report = checkTracingCoverage(dir, [tier2]);
      expect(report.pass).toBe(true); // warn doesn't fail
      expect(report.warn.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules / dist when scanning', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({
        name: '@domio/example-svc',
        dependencies: { '@domio/observability': 'workspace:*' },
      }),
      'services/example-svc/src/tracer.ts': `export const tracer = new Tracer({});`,
      'services/example-svc/src/handler.ts': `tracer.startSpan('h');`,
      'services/example-svc/node_modules/foo/index.ts': `// ignored`,
      'services/example-svc/dist/tracer.ts': `// ignored`,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      expect(report.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats Tracer.create() and startTracer() as valid instantiations', () => {
    const dir = tmpTree({
      'services/example-svc/package.json': JSON.stringify({
        name: '@domio/example-svc',
        dependencies: { '@domio/observability': 'workspace:*' },
      }),
      'services/example-svc/src/tracer.ts': `export const tracer = Tracer.create({});`,
      'services/example-svc/src/handler.ts': `startTracer('h');`,
    });
    try {
      const report = checkTracingCoverage(dir, [SAMPLE_SLO]);
      // Tracer.create() satisfies instantiation; startTracer() satisfies root-span.
      expect(report.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
