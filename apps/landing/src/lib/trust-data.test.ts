/**
 * Sanity tests for the trust page data layer.
 *
 * These guards catch regressions if the compliance catalogue, residency
 * regions, or report list is ever trimmed below the documented surface
 * area. The TrustClient page renders against these constants; trimming
 * silently would break the procurement pitch.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_BADGES,
  RESIDENCY_REGIONS,
  SECURITY_REPORTS,
  SECURITY_CONTACT,
  type ComplianceStatus,
} from './trust-data';

describe('trust-data', () => {
  it('exports 4+ compliance badges with mixed statuses', () => {
    expect(COMPLIANCE_BADGES.length).toBeGreaterThanOrEqual(4);
    const statuses = new Set<ComplianceStatus>(
      COMPLIANCE_BADGES.map((b) => b.status),
    );
    expect(statuses.has('certified')).toBe(true);
  });

  it('covers the four required compliance programmes', () => {
    const names = new Set(COMPLIANCE_BADGES.map((b) => b.name));
    expect(names.has('SOC 2 Type II')).toBe(true);
    expect(names.has('GDPR')).toBe(true);
    expect(names.has('CCPA')).toBe(true);
    expect(names.has('PDPA')).toBe(true);
  });

  it('every compliance badge has populated fields', () => {
    for (const badge of COMPLIANCE_BADGES) {
      expect(badge.id.length).toBeGreaterThan(0);
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
      expect(badge.icon.length).toBeGreaterThan(0);
    }
  });

  it('exports 6+ residency regions', () => {
    expect(RESIDENCY_REGIONS.length).toBeGreaterThanOrEqual(6);
  });

  it('every region has a code, label, countries, and default_for list', () => {
    for (const region of RESIDENCY_REGIONS) {
      expect(region.code.length).toBeGreaterThan(0);
      expect(region.label.length).toBeGreaterThan(0);
      expect(region.countries.length).toBeGreaterThan(0);
      expect(region.default_for.length).toBeGreaterThan(0);
    }
  });

  it('region codes are unique', () => {
    const codes = RESIDENCY_REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('exposes a non-empty security report list', () => {
    expect(SECURITY_REPORTS.length).toBeGreaterThan(0);
    for (const report of SECURITY_REPORTS) {
      expect(report.id.length).toBeGreaterThan(0);
      expect(report.title.length).toBeGreaterThan(0);
      expect(report.period.length).toBeGreaterThan(0);
      expect(report.download_url.length).toBeGreaterThan(0);
    }
  });

  it('exposes a populated security contact', () => {
    expect(SECURITY_CONTACT.email.length).toBeGreaterThan(0);
    expect(SECURITY_CONTACT.email).toContain('@');
    expect(SECURITY_CONTACT.pgp_fingerprint.length).toBeGreaterThan(0);
    expect(SECURITY_CONTACT.bug_bounty_url.length).toBeGreaterThan(0);
    expect(SECURITY_CONTACT.response_sla.length).toBeGreaterThan(0);
  });
});
