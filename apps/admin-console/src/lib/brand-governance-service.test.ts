/**
 * Brand governance service tests — Wave 8 §S8.2.
 */

import { describe, it, expect } from 'vitest';
import {
  getBrandGovernanceSnapshot,
  setBrandLockEnforcement,
  importBrandLocksCSV,
} from './brand-governance-service';

// jsdom provides a working File.text(); no extra stub needed.
function makeCsvFile(content: string): File {
  const blob = new Blob([content], { type: 'text/csv' });
  const file = new File([blob], 'brand-locks.csv', { type: 'text/csv' });
  // Replace .text() with a deterministic stub so jsdom's File.text works.
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(content),
    writable: false,
  });
  return file;
}

describe('brand-governance-service', () => {
  it('returns an org score in [0, 100]', async () => {
    const snap = await getBrandGovernanceSnapshot();
    expect(snap.orgScore).toBeGreaterThanOrEqual(0);
    expect(snap.orgScore).toBeLessThanOrEqual(100);
  });

  it('produces 30 trend points', async () => {
    const snap = await getBrandGovernanceSnapshot();
    expect(snap.trend).toHaveLength(30);
    for (const point of snap.trend) {
      expect(point.score).toBeGreaterThanOrEqual(0);
      expect(point.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns at least one violation', async () => {
    const snap = await getBrandGovernanceSnapshot();
    expect(snap.violations.length).toBeGreaterThanOrEqual(1);
    const v = snap.violations[0]!;
    expect(['off-brand-color', 'forbidden-font', 'logo-misuse']).toContain(v.kind);
    expect(['low', 'medium', 'high']).toContain(v.severity);
  });

  it('setBrandLockEnforcement does not throw', async () => {
    await expect(setBrandLockEnforcement('d-acme', 'enforced')).resolves.toBeUndefined();
    await expect(setBrandLockEnforcement('d-acme', 'warning')).resolves.toBeUndefined();
    await expect(setBrandLockEnforcement('d-acme', 'off')).resolves.toBeUndefined();
  });

  it('importBrandLocksCSV returns a numeric imported count', async () => {
    const csv = 'deck_id,mode,notes\nd-acme,enforced,q3 update\nd-initech,warning,rebrand';
    const file = makeCsvFile(csv);
    const result = await importBrandLocksCSV(file);
    expect(typeof result.imported).toBe('number');
    expect(result.imported).toBeGreaterThanOrEqual(2);
    expect(result.skipped).toBe(0);
  });

  it('importBrandLocksCSV counts invalid rows as skipped', async () => {
    const csv = 'deck_id,mode,notes\n,bad mode,oops\nd-acme,enforced,ok';
    const file = makeCsvFile(csv);
    const result = await importBrandLocksCSV(file);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.imported).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
