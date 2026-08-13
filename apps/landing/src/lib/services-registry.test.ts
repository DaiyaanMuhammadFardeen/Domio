/**
 * Tests for the services-registry taxonomy.
 *
 * Per Wave 13. Verifies:
 *   - every USER_FACING_SERVICES has unique id, unique port, unique name
 *   - taxonomy is disjoint (infrastructure ports don't collide with
 *     user-facing ports)
 *   - INFRASTRUCTURE entries are excluded from user-facing lookups
 *   - userFacingByCategory groups deterministically
 */

import { describe, expect, it } from 'vitest';
import {
  INFRASTRUCTURE,
  PURE_BACKEND_SERVICES,
  USER_FACING_SERVICES,
  userFacingByCategory,
  userFacingById,
} from './services-registry';

describe('services-registry', () => {
  it('every user-facing service has a unique id, name, and port', () => {
    const ids = USER_FACING_SERVICES.map((s) => s.id);
    const names = USER_FACING_SERVICES.map((s) => s.name);
    const ports = USER_FACING_SERVICES.map((s) => s.port);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('every user-facing service has a non-empty description and consumers', () => {
    for (const svc of USER_FACING_SERVICES) {
      expect(svc.description.length).toBeGreaterThan(0);
      expect(svc.consumers.length).toBeGreaterThan(0);
      expect(svc.owners.length).toBeGreaterThan(0);
      expect(svc.docsSlug.length).toBeGreaterThan(0);
    }
  });

  it('infrastructure ports do not collide with user-facing ports', () => {
    const userPorts = new Set(USER_FACING_SERVICES.map((s) => s.port));
    for (const infra of INFRASTRUCTURE) {
      expect(userPorts.has(infra.port)).toBe(false);
    }
  });

  it('infrastructure has its own unique ports', () => {
    const ports = INFRASTRUCTURE.map((i) => i.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('pure-backend services do not appear in user-facing lookups', () => {
    for (const svc of PURE_BACKEND_SERVICES) {
      expect(userFacingById(svc.id)).toBeNull();
    }
  });

  it('infrastructure entries are never present in USER_FACING_SERVICES', () => {
    const userIds = new Set(USER_FACING_SERVICES.map((s) => s.id));
    for (const infra of INFRASTRUCTURE) {
      expect(userIds.has(infra.id)).toBe(false);
    }
    for (const svc of PURE_BACKEND_SERVICES) {
      expect(userIds.has(svc.id)).toBe(false);
    }
  });

  it('userFacingByCategory groups every user-facing service exactly once', () => {
    const groups = userFacingByCategory();
    let total = 0;
    for (const group of groups) {
      for (const svc of group.services) {
        expect(svc.category).toBe(group.category);
      }
      total += group.services.length;
    }
    expect(total).toBe(USER_FACING_SERVICES.length);
  });

  it('userFacingById resolves known services and returns null for unknown', () => {
    expect(userFacingById('theme')).toBeTruthy();
    expect(userFacingById('postgres')).toBeNull();
    expect(userFacingById('redis')).toBeNull();
    expect(userFacingById('not-a-service')).toBeNull();
  });
});
