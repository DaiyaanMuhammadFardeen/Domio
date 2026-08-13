/**
 * Sanity tests for the Careers data layer.
 *
 * S12.11 — confirms the data surface has enough roles, every role
 * has the required fields, and the department coverage matches the
 * spec (engineering, design, GTM, ops — plus product and finance).
 */

import { describe, expect, it } from 'vitest';
import {
  OPEN_ROLES,
  VALUES,
  BENEFITS,
  type Department,
  type RoleLocation,
  type EmploymentType,
  type RoleLevel,
} from './careers-data';

describe('careers-data', () => {
  it('exports at least 10 open roles', () => {
    expect(OPEN_ROLES.length).toBeGreaterThanOrEqual(10);
  });

  it('exports a non-empty VALUES list', () => {
    expect(VALUES.length).toBeGreaterThan(0);
  });

  it('exports a non-empty BENEFITS list', () => {
    expect(BENEFITS.length).toBeGreaterThan(0);
  });

  it.each(OPEN_ROLES.map((r) => r.id))('role %s has required fields', (id) => {
    const role = OPEN_ROLES.find((r) => r.id === id);
    expect(role, `role ${id} should exist`).toBeDefined();
    expect(role!.title.length).toBeGreaterThan(0);
    expect(role!.department.length).toBeGreaterThan(0);
    expect(role!.location.length).toBeGreaterThan(0);
    expect(role!.employment_type.length).toBeGreaterThan(0);
    expect(role!.level.length).toBeGreaterThan(0);
    expect(role!.summary.length).toBeGreaterThan(0);
    expect(role!.apply_url).toMatch(/^https:\/\/boards\.greenhouse\.io\/domio\/jobs\/\d+$/);
    expect(() => new Date(role!.posted_at_iso).toISOString()).not.toThrow();
    expect(role!.posted_at_iso.startsWith('2026')).toBe(true);
  });

  it('covers the four required departments (engineering, design, GTM, ops)', () => {
    const depts = new Set<Department>(OPEN_ROLES.map((r) => r.department));
    expect(depts.has('engineering')).toBe(true);
    expect(depts.has('design')).toBe(true);
    expect(depts.has('go-to-market')).toBe(true);
    expect(depts.has('operations')).toBe(true);
  });

  it('uses location values from the closed set', () => {
    const allowed: ReadonlyArray<RoleLocation> = ['remote', 'sf', 'nyc', 'berlin', 'singapore'];
    for (const role of OPEN_ROLES) {
      expect(allowed).toContain(role.location);
    }
  });

  it('uses employment_type values from the closed set', () => {
    const allowed: ReadonlyArray<EmploymentType> = ['full_time', 'contract', 'intern'];
    for (const role of OPEN_ROLES) {
      expect(allowed).toContain(role.employment_type);
    }
  });

  it('uses level values from the closed set', () => {
    const allowed: ReadonlyArray<RoleLevel> = ['junior', 'mid', 'senior', 'staff', 'principal'];
    for (const role of OPEN_ROLES) {
      expect(allowed).toContain(role.level);
    }
  });

  it('uses unique role ids', () => {
    const ids = OPEN_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every value entry has title and description', () => {
    for (const v of VALUES) {
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }
  });

  it('every benefit entry has title and description', () => {
    for (const b of BENEFITS) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });
});
