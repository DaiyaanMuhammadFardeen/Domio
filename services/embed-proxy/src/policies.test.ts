/**
 * Embed policy CRUD tests — covers create, read, update, delete,
 * validation, listing by workspace, and default values.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EmbedPolicyService,
  PolicyNotFoundError,
  PolicyValidationError,
  DEFAULT_POLICY,
} from './policies.js';

describe('EmbedPolicyService', () => {
  let service: EmbedPolicyService;

  beforeEach(() => {
    service = new EmbedPolicyService(() => new Date('2026-01-01T00:00:00Z'));
  });

  describe('create', () => {
    it('creates a policy with provided fields', () => {
      const policy = service.create({
        workspaceId: 'ws-1',
        name: 'Test Policy',
        allowedOrigins: ['https://example.com'],
        sandboxFlags: 'allow-scripts allow-same-origin',
        jwtRequired: true,
        jwtAudience: 'https://api.example.com',
        trapFocus: true,
      });

      expect(policy.id).toBeDefined();
      expect(policy.workspaceId).toBe('ws-1');
      expect(policy.name).toBe('Test Policy');
      expect(policy.allowedOrigins).toEqual(['https://example.com']);
      expect(policy.sandboxFlags).toBe('allow-scripts allow-same-origin');
      expect(policy.jwtRequired).toBe(true);
      expect(policy.jwtAudience).toBe('https://api.example.com');
      expect(policy.trapFocus).toBe(true);
      expect(policy.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('applies defaults for optional fields', () => {
      const policy = service.create({
        workspaceId: 'ws-1',
        name: 'Minimal Policy',
      });

      expect(policy.allowedOrigins).toEqual([]);
      expect(policy.sandboxFlags).toBe('allow-scripts allow-same-origin allow-forms');
      expect(policy.jwtRequired).toBe(true);
      expect(policy.jwtAudience).toBeNull();
      expect(policy.trapFocus).toBe(false);
    });

    it('throws PolicyValidationError when workspaceId is missing', () => {
      expect(() =>
        service.create({ workspaceId: '', name: 'Test' }),
      ).toThrow(PolicyValidationError);
    });

    it('throws PolicyValidationError when name is missing', () => {
      expect(() =>
        service.create({ workspaceId: 'ws-1', name: '' }),
      ).toThrow(PolicyValidationError);
    });

    it('throws PolicyValidationError for invalid sandbox flags', () => {
      expect(() =>
        service.create({
          workspaceId: 'ws-1',
          name: 'Test',
          sandboxFlags: 'invalid-flag',
        }),
      ).toThrow(PolicyValidationError);
    });

    it('accepts valid sandbox flags', () => {
      const policy = service.create({
        workspaceId: 'ws-1',
        name: 'Test',
        sandboxFlags: 'allow-scripts allow-same-origin allow-forms allow-popups',
      });
      expect(policy.sandboxFlags).toBe('allow-scripts allow-same-origin allow-forms allow-popups');
    });
  });

  describe('getById', () => {
    it('returns policy by ID', () => {
      const created = service.create({ workspaceId: 'ws-1', name: 'Test' });
      const fetched = service.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });

    it('returns null for unknown ID', () => {
      expect(service.getById('nonexistent')).toBeNull();
    });
  });

  describe('listByWorkspace', () => {
    it('returns only policies for the given workspace', () => {
      service.create({ workspaceId: 'ws-1', name: 'Policy 1' });
      service.create({ workspaceId: 'ws-1', name: 'Policy 2' });
      service.create({ workspaceId: 'ws-2', name: 'Policy 3' });

      const ws1 = service.listByWorkspace('ws-1');
      expect(ws1).toHaveLength(2);
      expect(ws1.map((p) => p.name)).toContain('Policy 1');
      expect(ws1.map((p) => p.name)).toContain('Policy 2');

      const ws2 = service.listByWorkspace('ws-2');
      expect(ws2).toHaveLength(1);
      expect(ws2[0].name).toBe('Policy 3');
    });

    it('returns empty array for workspace with no policies', () => {
      expect(service.listByWorkspace('ws-empty')).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates provided fields', () => {
      const created = service.create({
        workspaceId: 'ws-1',
        name: 'Original',
        trapFocus: false,
      });

      const updated = service.update(created.id, {
        name: 'Updated',
        trapFocus: true,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.trapFocus).toBe(true);
      expect(updated.id).toBe(created.id);
    });

    it('preserves unchanged fields', () => {
      const created = service.create({
        workspaceId: 'ws-1',
        name: 'Original',
        jwtRequired: false,
      });

      const updated = service.update(created.id, { name: 'Updated' });
      expect(updated.jwtRequired).toBe(false);
      expect(updated.workspaceId).toBe('ws-1');
    });

    it('throws PolicyNotFoundError for unknown ID', () => {
      expect(() => service.update('nonexistent', { name: 'X' })).toThrow(PolicyNotFoundError);
    });

    it('throws PolicyValidationError for invalid sandbox flags', () => {
      const created = service.create({ workspaceId: 'ws-1', name: 'Test' });
      expect(() =>
        service.update(created.id, { sandboxFlags: 'bad-flag' }),
      ).toThrow(PolicyValidationError);
    });
  });

  describe('delete', () => {
    it('deletes existing policy', () => {
      const created = service.create({ workspaceId: 'ws-1', name: 'Test' });
      expect(service.delete(created.id)).toBe(true);
      expect(service.getById(created.id)).toBeNull();
    });

    it('returns false for unknown ID', () => {
      expect(service.delete('nonexistent')).toBe(false);
    });
  });

  describe('resolveForPath', () => {
    it('returns first policy for the workspace', () => {
      const p1 = service.create({ workspaceId: 'ws-1', name: 'Policy 1' });
      service.create({ workspaceId: 'ws-2', name: 'Policy 2' });

      const resolved = service.resolveForPath('ws-1', '/deck/my-deck');
      expect(resolved).not.toBeNull();
      expect(resolved!.id).toBe(p1.id);
    });

    it('returns null when no policies exist for workspace', () => {
      expect(service.resolveForPath('ws-empty', '/deck/test')).toBeNull();
    });
  });
});

describe('DEFAULT_POLICY', () => {
  it('has deny-all origins', () => {
    expect(DEFAULT_POLICY.allowedOrigins).toEqual([]);
  });

  it('requires JWT', () => {
    expect(DEFAULT_POLICY.jwtRequired).toBe(true);
  });

  it('does not trap focus', () => {
    expect(DEFAULT_POLICY.trapFocus).toBe(false);
  });

  it('has default sandbox flags', () => {
    expect(DEFAULT_POLICY.sandboxFlags).toBe('allow-scripts allow-same-origin allow-forms');
  });
});
