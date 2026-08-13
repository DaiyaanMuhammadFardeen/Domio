/**
 * Component SDK service tests — Wave 8 §S8.10.
 */

import { describe, it, expect } from 'vitest';
import {
  listSDKPackages,
  listComponentTemplates,
  downloadComponentTemplate,
  publishComponentToOrg,
} from './component-sdk-service';

describe('component-sdk-service', () => {
  it('listSDKPackages returns 6+ entries covering npm/pnpm/yarn/maven/pip/go', async () => {
    const pkgs = await listSDKPackages();
    expect(pkgs.length).toBeGreaterThanOrEqual(6);
    const kinds = new Set(pkgs.map((p) => p.package));
    expect(kinds.has('npm')).toBe(true);
    expect(kinds.has('pnpm')).toBe(true);
    expect(kinds.has('yarn')).toBe(true);
    expect(kinds.has('maven')).toBe(true);
    expect(kinds.has('pip')).toBe(true);
    expect(kinds.has('go')).toBe(true);
  });

  it('listComponentTemplates returns 3 templates', async () => {
    const tpls = await listComponentTemplates();
    expect(tpls.length).toBe(3);
    const languages = tpls.map((t) => t.language);
    expect(languages).toContain('typescript');
    expect(languages).toContain('javascript');
    expect(languages).toContain('python');
  });

  it('downloadComponentTemplate returns a Blob', async () => {
    const blob = await downloadComponentTemplate('tpl-ts-react-starter');
    expect(blob).toBeInstanceOf(Blob);
    const text = await blob.text();
    expect(text).toMatch(/Hello from/);
  });

  it('downloadComponentTemplate throws for unknown id', async () => {
    await expect(downloadComponentTemplate('nope')).rejects.toThrow();
  });

  it('publishComponentToOrg returns a published id', async () => {
    const res = await publishComponentToOrg({
      name: 'My Kpi Tile',
      description: 'Renders a single KPI tile.',
      version: '0.1.0',
      tags: ['kpi', 'tile'],
    });
    expect(res.status).toBe('published');
    expect(res.id).toMatch(/^cmp-/);
  });

  it('publishComponentToOrg rejects empty name', async () => {
    await expect(
      publishComponentToOrg({
        name: '   ',
        description: 'x',
        version: '0.1.0',
        tags: [],
      }),
    ).rejects.toThrow();
  });

  it('publishComponentToOrg rejects empty version', async () => {
    await expect(
      publishComponentToOrg({
        name: 'X',
        description: 'x',
        version: '',
        tags: [],
      }),
    ).rejects.toThrow();
  });
});
