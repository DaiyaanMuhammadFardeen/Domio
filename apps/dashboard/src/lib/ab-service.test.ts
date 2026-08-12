/**
 * ab-service — tests.
 *
 * Per Wave 1 §S1.2 acceptance: services ship with at least one test
 * that asserts the public shape.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchExperiments } from './ab-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ab-service', () => {
  it('returns the experiments array on a 200 response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        experiments: [
          { id: 'exp-001', name: 'Hero CTA color', status: 'significant' },
          { id: 'exp-002', name: 'Onboarding flow', status: 'running' },
        ],
      }),
    })) as unknown as typeof fetch;

    const list = await fetchExperiments('ws-demo', 'http://ab.test');
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe('exp-001');
    expect(list[1]?.status).toBe('running');
  });

  it('returns an empty array on a 404', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not found' }),
    })) as unknown as typeof fetch;

    const list = await fetchExperiments('ws-empty', 'http://ab.test');
    expect(list).toEqual([]);
  });

  it('returns an empty array on a network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const list = await fetchExperiments('ws-down', 'http://ab.test');
    expect(list).toEqual([]);
  });

  it('forwards the workspaceId as a query param', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ experiments: [] }),
    })) as unknown as typeof fetch;
    globalThis.fetch = mock;

    await fetchExperiments('ws-xyz', 'http://ab.test');
    const calledUrl = (mock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('workspace_id=ws-xyz');
  });
});
