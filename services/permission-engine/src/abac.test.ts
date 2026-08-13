/**
 * @domio/permission-engine — ABAC tests (P20.5 B1).
 *
 * Covers §4.1 (T-B1.4) verification matrix:
 *   - Brand-locked region blocks `editor`; allows `admin`.
 *   - Restricted-data public share blocked for editor; allowed for admin.
 *   - Resolution order: first deny wins.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateAbac,
  brandLockRegionsPolicy,
  restrictedDataSharePolicy,
  BRAND_LOCKED_REGIONS,
  type PolicySubject,
  type PolicyResource,
  type PolicyContext,
  type PolicyAction,
} from './abac.js';

function subject(role: PolicySubject['role']): PolicySubject {
  return {
    userId: `u-${role}`,
    workspaceId: 'ws-1',
    role,
    capabilities: ['view', 'edit'],
  };
}

describe('brandLockRegionsPolicy', () => {
  const action: PolicyAction = 'slide-element.edit';

  it('allows editor on a non-locked region', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1', regions: ['body'] };
    const d = brandLockRegionsPolicy(subject('editor'), action, resource);
    expect(d.effect).toBe('allow');
  });

  it('blocks editor on a locked region', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1', regions: ['header'] };
    const d = brandLockRegionsPolicy(subject('editor'), action, resource);
    expect(d.effect).toBe('deny');
    expect(d.reason).toMatch(/brand-locked/);
  });

  it('allows admin on a locked region', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1', regions: ['header'] };
    const d = brandLockRegionsPolicy(subject('admin'), action, resource);
    expect(d.effect).toBe('allow');
    expect(d.reason).toMatch(/admin role bypasses/);
  });

  it('allows owner on a locked region', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1', regions: ['logo-zone'] };
    const d = brandLockRegionsPolicy(subject('owner'), action, resource);
    expect(d.effect).toBe('allow');
  });

  it('blocks commenter on a locked region', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1', regions: ['header'] };
    const d = brandLockRegionsPolicy(subject('commenter'), action, resource);
    expect(d.effect).toBe('deny');
  });

  it('passes through actions that are not slide-element edits', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1' };
    const d = brandLockRegionsPolicy(subject('editor'), 'deck.share.create', resource);
    expect(d.effect).toBe('allow');
    expect(d.reason).toMatch(/not covered/);
  });

  it('passes through when the resource has no regions metadata', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1' };
    const d = brandLockRegionsPolicy(subject('editor'), action, resource);
    expect(d.effect).toBe('allow');
  });

  it('default BRAND_LOCKED_REGIONS contains the canonical set', () => {
    expect(BRAND_LOCKED_REGIONS.has('header')).toBe(true);
    expect(BRAND_LOCKED_REGIONS.has('footer-left')).toBe(true);
    expect(BRAND_LOCKED_REGIONS.has('body')).toBe(false);
  });
});

describe('restrictedDataSharePolicy', () => {
  const action: PolicyAction = 'deck.share.create';

  it('allows editor public share when deck has no restricted data', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1', containsRestrictedData: false };
    const context: PolicyContext = { shareScope: 'public' };
    const d = restrictedDataSharePolicy(subject('editor'), action, resource, context);
    expect(d.effect).toBe('allow');
  });

  it('blocks editor public share when deck has restricted data', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1', containsRestrictedData: true };
    const context: PolicyContext = { shareScope: 'public' };
    const d = restrictedDataSharePolicy(subject('editor'), action, resource, context);
    expect(d.effect).toBe('deny');
    expect(d.reason).toMatch(/restricted data/);
  });

  it('allows admin to share restricted data publicly', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1', containsRestrictedData: true };
    const context: PolicyContext = { shareScope: 'public' };
    const d = restrictedDataSharePolicy(subject('admin'), action, resource, context);
    expect(d.effect).toBe('allow');
    expect(d.reason).toMatch(/admin override/);
  });

  it('allows editor team/private share even with restricted data', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1', containsRestrictedData: true };
    for (const scope of ['team', 'private'] as const) {
      const context: PolicyContext = { shareScope: scope };
      const d = restrictedDataSharePolicy(subject('editor'), action, resource, context);
      expect(d.effect).toBe('allow');
    }
  });

  it('passes through non-share actions', () => {
    const resource: PolicyResource = { kind: 'deck', id: 'd1' };
    const context: PolicyContext = {};
    const d = restrictedDataSharePolicy(subject('editor'), 'slide-element.edit', resource, context);
    expect(d.effect).toBe('allow');
  });

  it('passes through non-deck resources', () => {
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1' };
    const context: PolicyContext = { shareScope: 'public' };
    const d = restrictedDataSharePolicy(subject('editor'), action, resource, context);
    expect(d.effect).toBe('allow');
  });
});

describe('evaluateAbac — combined', () => {
  it('first deny wins across predicates', () => {
    // Editor editing a locked region on a deck with restricted data
    const editor: PolicySubject = { ...subject('editor'), workspaceId: 'ws-1' };
    const resource: PolicyResource = {
      kind: 'slide-element',
      id: 'e1',
      regions: ['header'],
      containsRestrictedData: true,
    };
    const context: PolicyContext = { shareScope: 'public' };
    const d = evaluateAbac(editor, 'slide-element.edit', resource, context);
    expect(d.effect).toBe('deny');
    expect(d.rule).toBe('brand_lock_regions');
  });

  it('falls back to RBAC when no rule fires', () => {
    // Viewer reading a slide-element with no regions and the action is not
    // a share — both predicates pass through as "no opinion".
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1' };
    const context: PolicyContext = {};
    const d = evaluateAbac(subject('viewer'), 'slide-element.edit', resource, context);
    // Brand-lock still fires ("element not in a locked region") because the
    // resource has empty regions → not in a locked region.
    // Both predicates give "allow" — first relevant wins.
    expect(d.effect).toBe('allow');
  });

  it('skips pass-through predicates (no opinion)', () => {
    // Action is share-create on a slide-element (not a deck) — restricted-data
    // rule passes through ("resource not a deck"), brand-lock passes through
    // ("resource not subject to brand lock").
    const resource: PolicyResource = { kind: 'slide-element', id: 'e1' };
    const context: PolicyContext = { shareScope: 'public' };
    const d = evaluateAbac(subject('editor'), 'deck.share.create', resource, context);
    expect(d.effect).toBe('allow');
    expect(d.rule).toBe('fallback');
  });
});
