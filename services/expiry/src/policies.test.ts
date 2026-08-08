/**
 * Expiry pure-logic tests (Phase 18).
 */

import { describe, it, expect } from 'vitest';
import {
  effectivePolicy,
  isOverdue,
  tierAction,
  validatePolicyInput,
} from './policies.js';
import type { ExpiryPolicy, WorkspaceDefaults } from './types.js';
import { DEFAULT_WORKSPACE_DEFAULTS } from './types.js';

// ---------------------------------------------------------------------------
// effectivePolicy
// ---------------------------------------------------------------------------

describe('effectivePolicy', () => {
  it('uses workspace defaults when no override', () => {
    const result = effectivePolicy(DEFAULT_WORKSPACE_DEFAULTS);
    expect(result.interval_days).toBe(90);
    expect(result.escalation).toBe('gentle');
    expect(result.auto_revoke_share).toBe(false);
  });

  it('override wins per-field', () => {
    const defaults: WorkspaceDefaults = { interval_days: 90, escalation: 'gentle', auto_revoke_share: false };
    const result = effectivePolicy(defaults, {
      workspace_id: 'ws1',
      resource_type: 'deck',
      resource_id: 'd1',
      interval_days: 30,
      escalation: 'strict',
      auto_revoke_share: true,
    });
    expect(result.interval_days).toBe(30);
    expect(result.escalation).toBe('strict');
    expect(result.auto_revoke_share).toBe(true);
  });

  it('partial override merges correctly', () => {
    const defaults: WorkspaceDefaults = { interval_days: 90, escalation: 'gentle', auto_revoke_share: false };
    const result = effectivePolicy(defaults, {
      workspace_id: 'ws1',
      resource_type: 'deck',
      resource_id: 'd1',
      interval_days: 14,
      // escalation and auto_revoke_share omitted — should use defaults
    });
    expect(result.interval_days).toBe(14);
    expect(result.escalation).toBe('gentle');
    expect(result.auto_revoke_share).toBe(false);
  });

  it('full ExpiryPolicy override preserves all fields', () => {
    const policy: ExpiryPolicy = {
      id: 'p1',
      workspace_id: 'ws1',
      resource_type: 'deck',
      resource_id: 'd1',
      interval_days: 7,
      responsible_id: 'user1',
      escalation: 'moderate',
      auto_revoke_share: true,
      created_at: new Date('2025-01-01'),
      created_by: 'user1',
      updated_by: 'user1',
    };
    const result = effectivePolicy(DEFAULT_WORKSPACE_DEFAULTS, policy);
    expect(result.id).toBe('p1');
    expect(result.interval_days).toBe(7);
    expect(result.escalation).toBe('moderate');
    expect(result.responsible_id).toBe('user1');
  });
});

// ---------------------------------------------------------------------------
// isOverdue
// ---------------------------------------------------------------------------

describe('isOverdue', () => {
  const policy = {
    id: 'p1',
    workspace_id: 'ws1',
    resource_type: 'deck',
    resource_id: 'd1',
    interval_days: 30,
    responsible_id: null,
    escalation: 'gentle' as const,
    auto_revoke_share: false,
    created_at: new Date(),
    created_by: '',
    updated_by: '',
  };

  it('returns true when never reviewed', () => {
    const now = new Date('2025-06-01');
    expect(isOverdue(policy, null, now)).toBe(true);
  });

  it('returns false when reviewed within interval', () => {
    const now = new Date('2025-06-01');
    const lastReviewed = new Date('2025-05-20'); // 12 days ago
    expect(isOverdue(policy, lastReviewed, now)).toBe(false);
  });

  it('returns true when reviewed exactly at interval boundary', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const lastReviewed = new Date('2025-05-02T12:00:00Z'); // exactly 30 days
    expect(isOverdue(policy, lastReviewed, now)).toBe(true);
  });

  it('returns true when reviewed past interval', () => {
    const now = new Date('2025-07-01');
    const lastReviewed = new Date('2025-05-01'); // 61 days ago
    expect(isOverdue(policy, lastReviewed, now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tierAction
// ---------------------------------------------------------------------------

describe('tierAction', () => {
  it('gentle: flag only, no notify, no revoke', () => {
    const action = tierAction('gentle');
    expect(action.flag).toBe(true);
    expect(action.notify).toBe(false);
    expect(action.autoRevoke).toBe(false);
  });

  it('moderate: flag + notify, no revoke', () => {
    const action = tierAction('moderate');
    expect(action.flag).toBe(true);
    expect(action.notify).toBe(true);
    expect(action.autoRevoke).toBe(false);
  });

  it('strict: flag + notify + revoke', () => {
    const action = tierAction('strict');
    expect(action.flag).toBe(true);
    expect(action.notify).toBe(true);
    expect(action.autoRevoke).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePolicyInput
// ---------------------------------------------------------------------------

describe('validatePolicyInput', () => {
  it('passes with valid input', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 30,
      }),
    ).not.toThrow();
  });

  it('throws on missing workspace_id', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: '',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 30,
      }),
    ).toThrow('workspace_id is required');
  });

  it('throws on missing resource_type', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: '',
        resource_id: 'd1',
        interval_days: 30,
      }),
    ).toThrow('resource_type is required');
  });

  it('throws on missing resource_id', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: '',
        interval_days: 30,
      }),
    ).toThrow('resource_id is required');
  });

  it('throws on non-positive interval_days', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 0,
      }),
    ).toThrow('interval_days must be a positive integer');
  });

  it('throws on negative interval_days', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: -5,
      }),
    ).toThrow('interval_days must be a positive integer');
  });

  it('throws on fractional interval_days', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 3.5,
      }),
    ).toThrow('interval_days must be a positive integer');
  });

  it('throws on invalid escalation tier', () => {
    expect(() =>
      validatePolicyInput({
        workspace_id: 'ws1',
        resource_type: 'deck',
        resource_id: 'd1',
        interval_days: 30,
        escalation: 'invalid' as never,
      }),
    ).toThrow('Invalid escalation tier');
  });
});
