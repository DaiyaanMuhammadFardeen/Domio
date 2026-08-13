/**
 * Tests for services-docs auto-generation.
 */

import { describe, expect, it } from 'vitest';
import { USER_FACING_SERVICES } from './services-registry';
import { buildServiceDoc, listServiceDocs } from './services-docs';

describe('services-docs', () => {
  it('builds a doc for every user-facing service', () => {
    for (const svc of USER_FACING_SERVICES) {
      const doc = buildServiceDoc(svc.id);
      expect(doc).toBeTruthy();
      expect(doc?.service.id).toBe(svc.id);
      expect(doc?.href).toBe(`/services/${svc.id}`);
      expect(doc?.docsHref).toBe(`/docs/${svc.docsSlug}`);
      expect(doc?.summary.length ?? 0).toBeGreaterThan(0);
      expect(doc?.consumersLabel.length ?? 0).toBeGreaterThan(0);
      expect(doc?.ownersLabel.length ?? 0).toBeGreaterThan(0);
      expect(doc?.apiSurface.length ?? 0).toBeGreaterThan(0);
      expect(doc?.runbookSteps.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('returns null for unknown services and infrastructure', () => {
    expect(buildServiceDoc('postgres')).toBeNull();
    expect(buildServiceDoc('redis')).toBeNull();
    expect(buildServiceDoc('clickhouse')).toBeNull();
    expect(buildServiceDoc('not-a-service')).toBeNull();
  });

  it('listServiceDocs matches the user-facing registry size', () => {
    expect(listServiceDocs().length).toBe(USER_FACING_SERVICES.length);
  });

  it('every doc has a unique href', () => {
    const hrefs = listServiceDocs().map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
