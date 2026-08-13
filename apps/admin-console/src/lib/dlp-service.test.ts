/**
 * DLP service tests — Wave 8 §S8.3.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  listDLPRules,
  getDLPRule,
  createDLPRule,
  updateDLPRule,
  deleteDLPRule,
  testDLPRule,
} from './dlp-service';
import type { DLPRule } from './types';

describe('dlp-service', () => {
  beforeEach(async () => {
    // The store is module-singleton. Wipe any leftover state from prior
    // tests by deleting every rule other than the canonical seeded set
    // — simpler than re-importing.
    const list = await listDLPRules();
    for (const r of list.items) {
      await deleteDLPRule(r.id);
    }
    // Re-seed by recreating canonical rules through the public API.
    await createDLPRule({
      name: 'US SSN detector',
      kind: 'regex',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      scopes: ['slide-content', 'comment', 'asset'],
      actions: ['block-share', 'redact'],
      enabled: true,
    });
    await createDLPRule({
      name: 'Confidential vocabulary',
      kind: 'dictionary',
      pattern: 'core-confidential',
      scopes: ['deck-title', 'slide-content', 'comment'],
      actions: ['notify'],
      enabled: true,
    });
    await createDLPRule({
      name: 'Email addresses in decks',
      kind: 'entity',
      pattern: 'email',
      scopes: ['slide-content', 'comment'],
      actions: ['redact', 'notify'],
      enabled: true,
    });
    await createDLPRule({
      name: 'Credit card numbers',
      kind: 'regex',
      pattern: '\\b(?:\\d[ -]*?){13,16}\\b',
      scopes: ['slide-content', 'asset'],
      actions: ['block-share', 'redact', 'notify'],
      enabled: true,
    });
    await createDLPRule({
      name: 'Phone numbers in comments',
      kind: 'entity',
      pattern: 'phone',
      scopes: ['comment'],
      actions: ['notify'],
      enabled: true,
    });
  });

  it('lists five or more seeded rules', async () => {
    const list = await listDLPRules();
    expect(list.total).toBeGreaterThanOrEqual(5);
    expect(list.items.length).toBeGreaterThanOrEqual(5);
  });

  it('creates a rule with a generated id', async () => {
    const rule = await createDLPRule({
      name: 'New test rule',
      kind: 'regex',
      pattern: 'foobar',
      scopes: ['comment'],
      actions: ['notify'],
      enabled: true,
    });
    expect(rule.id).toMatch(/^dlp-/);
    expect(rule.name).toBe('New test rule');
    expect(rule.hits_24h).toBe(0);
  });

  it('retrieves a rule by id', async () => {
    const list = await listDLPRules();
    const target = list.items[0];
    expect(target).toBeDefined();
    if (!target) return;
    const fetched = await getDLPRule(target.id);
    expect(fetched?.id).toBe(target.id);
  });

  it('returns null for unknown ids', async () => {
    expect(await getDLPRule('dlp-does-not-exist')).toBeNull();
  });

  it('updates an existing rule', async () => {
    const list = await listDLPRules();
    const target = list.items[0];
    expect(target).toBeDefined();
    if (!target) return;
    const updated = await updateDLPRule(target.id, {
      name: 'Renamed rule',
      kind: target.kind,
      pattern: target.pattern,
      scopes: target.scopes,
      actions: target.actions,
      enabled: false,
    });
    expect(updated.name).toBe('Renamed rule');
    expect(updated.enabled).toBe(false);
    expect(updated.updated_at_ms).toBeGreaterThanOrEqual(target.updated_at_ms);
  });

  it('throws when updating an unknown id', async () => {
    await expect(
      updateDLPRule('dlp-nope', {
        name: 'x',
        kind: 'regex',
        pattern: 'x',
        scopes: [],
        actions: [],
        enabled: true,
      }),
    ).rejects.toThrow();
  });

  it('deletes a rule', async () => {
    const list = await listDLPRules();
    const target = list.items[0];
    expect(target).toBeDefined();
    if (!target) return;
    await deleteDLPRule(target.id);
    const after = await getDLPRule(target.id);
    expect(after).toBeNull();
  });

  it('throws when deleting an unknown id', async () => {
    await expect(deleteDLPRule('dlp-nope')).rejects.toThrow();
  });

  it('regex testDLPRule matches in <100ms', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'SSN',
      kind: 'regex',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      scopes: ['comment'],
      actions: ['block-share'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'My SSN is 123-45-6789 and yours is 999-88-7777.');
    expect(result.matched).toBe(true);
    expect(result.matches.length).toBe(2);
    expect(result.latency_ms).toBeLessThan(100);
  });

  it('dictionary testDLPRule matches "confidential"', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'Dictionary',
      kind: 'dictionary',
      pattern: 'core-confidential',
      scopes: ['comment'],
      actions: ['notify'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'This slide is Confidential, please review.');
    expect(result.matched).toBe(true);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });

  it('testDLPRule returns matched=false when there is no match', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'SSN',
      kind: 'regex',
      pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
      scopes: ['comment'],
      actions: ['block-share'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'no sensitive data here at all');
    expect(result.matched).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  it('entity testDLPRule matches an email address', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'Email',
      kind: 'entity',
      pattern: 'email',
      scopes: ['comment'],
      actions: ['notify'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'Reach me at jane.doe@example.com for details.');
    expect(result.matched).toBe(true);
    expect(result.matches[0]?.snippet).toBe('jane.doe@example.com');
  });

  it('entity testDLPRule matches an SSN-like entity', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'SSN entity',
      kind: 'entity',
      pattern: 'ssn',
      scopes: ['comment'],
      actions: ['block-share'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'Backup is 123-45-6789');
    expect(result.matched).toBe(true);
  });

  it('testDLPRule handles invalid regex without throwing', async () => {
    const rule: DLPRule = {
      id: 'r',
      tenant_id: 't',
      name: 'Broken',
      kind: 'regex',
      pattern: '([unclosed',
      scopes: ['comment'],
      actions: ['notify'],
      enabled: true,
      created_at_ms: 0,
      updated_at_ms: 0,
      hits_24h: 0,
    };
    const result = await testDLPRule(rule, 'whatever');
    expect(result.matched).toBe(false);
  });
});
