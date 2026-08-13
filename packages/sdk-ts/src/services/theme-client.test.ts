/**
 * Tests for HttpThemeServiceClient — verifies URL shape, request
 * encoding, and error mapping.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { describe, expect, it } from 'vitest';
import { HttpThemeServiceClient } from './http-theme-client.js';
import type { HttpLikeTransport } from '../loader.js';

interface RecordedCall {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly body?: unknown;
}

function makeTransport(responses: ReadonlyArray<{ ok: boolean; status: number; body: unknown }>): {
  transport: HttpLikeTransport;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let i = 0;
  const transport: HttpLikeTransport = {
    async get(url: string) {
      calls.push({ method: 'GET', url });
      return responses[i++] ?? { ok: false, status: 500, body: null };
    },
    async post(url: string, body: unknown) {
      calls.push({ method: 'POST', url, body });
      return responses[i++] ?? { ok: false, status: 500, body: null };
    },
  };
  return { transport, calls };
}

describe('HttpThemeServiceClient', () => {
  it('lists themes for an org', async () => {
    const { transport, calls } = makeTransport([
      {
        ok: true,
        status: 200,
        body: {
          themes: [
            {
              themeId: 't1',
              orgId: 'o1',
              name: 'Light',
              kind: 'light',
              tokens: {},
              createdAt: 0,
              createdBy: 'u1',
            },
          ],
        },
      },
    ]);
    const client = new HttpThemeServiceClient('https://api.example.test', transport);
    const themes = await client.listThemes('o1');
    expect(themes).toHaveLength(1);
    expect(themes[0]?.themeId).toBe('t1');
    expect(calls[0]?.url).toBe('https://api.example.test/v1/orgs/o1/themes');
    expect(calls[0]?.method).toBe('GET');
  });

  it('creates a brand kit', async () => {
    const { transport, calls } = makeTransport([
      {
        ok: true,
        status: 201,
        body: {
          brandKitId: 'b1',
          orgId: 'o1',
          name: 'Acme',
          primaryHex: '#000',
          accentHex: '#fff',
          createdAt: 0,
        },
      },
    ]);
    const client = new HttpThemeServiceClient('https://api.example.test', transport);
    const kit = await client.createBrandKit({
      orgId: 'o1',
      name: 'Acme',
      primaryHex: '#000',
      accentHex: '#fff',
    });
    expect(kit.brandKitId).toBe('b1');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.example.test/v1/orgs/o1/brand-kits');
  });

  it('audits a11y for a brand kit', async () => {
    const { transport, calls } = makeTransport([
      {
        ok: true,
        status: 200,
        body: {
          findings: [
            {
              severity: 'WARN',
              tokenId: 'color.text',
              issue: 'low contrast',
              suggestion: 'use white',
            },
          ],
        },
      },
    ]);
    const client = new HttpThemeServiceClient('https://api.example.test', transport);
    const findings = await client.auditA11y({
      orgId: 'o1',
      brandKitId: 'b1',
      tokens: { 'color.text': '#aaa' },
    });
    expect(findings).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.test/v1/orgs/o1/brand-kits/b1/audit-a11y');
  });

  it('throws a structured error on 404', async () => {
    const { transport } = makeTransport([
      { ok: false, status: 404, body: { code: 'NOT_FOUND', error: 'no theme' } },
    ]);
    const client = new HttpThemeServiceClient('https://api.example.test', transport);
    await expect(client.getTheme('o1', 'missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'no theme',
    });
  });

  it('maps unknown status codes to NETWORK', async () => {
    const { transport } = makeTransport([{ ok: false, status: 503, body: null }]);
    const client = new HttpThemeServiceClient('https://api.example.test', transport);
    await expect(client.listThemes('o1')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
