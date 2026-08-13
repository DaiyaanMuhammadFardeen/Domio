/**
 * Plugin service tests — Wave 8 §S8.9.
 */

import { describe, it, expect } from 'vitest';
import {
  listPlugins,
  getPlugin,
  enablePlugin,
  disablePlugin,
  listPublishRequests,
  approvePublishRequest,
  rejectPublishRequest,
  getPluginAuditLog,
} from './plugin-service';

describe('plugin-service', () => {
  it('lists all seeded plugins (6 total)', async () => {
    const plugins = await listPlugins();
    expect(plugins.length).toBe(6);
  });

  it('filters plugins by state', async () => {
    const installed = await listPlugins('installed');
    expect(installed.every((p) => p.state === 'installed')).toBe(true);
    expect(installed.length).toBeGreaterThanOrEqual(2);

    const available = await listPlugins('available');
    expect(available.every((p) => p.state === 'available')).toBe(true);
    expect(available.length).toBeGreaterThanOrEqual(2);

    const deprecated = await listPlugins('deprecated');
    expect(deprecated.every((p) => p.state === 'deprecated')).toBe(true);
  });

  it('retrieves a plugin by id', async () => {
    const p = await getPlugin('plg-slack-notifier');
    expect(p?.name).toBe('Slack Notifier');
    expect(p?.state).toBe('installed');
  });

  it('returns null for unknown plugin id', async () => {
    expect(await getPlugin('nope')).toBeNull();
  });

  it('disablePlugin changes state to deprecated', async () => {
    const updated = await disablePlugin('plg-slack-notifier');
    expect(updated.state).toBe('deprecated');
    expect(updated.deprecation_notice).toBeTruthy();
  });

  it('enablePlugin changes state back to installed', async () => {
    // First disable to ensure it's deprecated
    await disablePlugin('plg-ai-summary');
    const updated = await enablePlugin('plg-ai-summary');
    expect(updated.state).toBe('installed');
    expect(updated.installed_at_ms).toBeGreaterThan(0);
    expect(updated.deprecation_notice).toBeNull();
  });

  it('enablePlugin throws for unknown id', async () => {
    await expect(enablePlugin('nope')).rejects.toThrow(/not found/);
  });

  it('disablePlugin throws for unknown id', async () => {
    await expect(disablePlugin('nope')).rejects.toThrow(/not found/);
  });

  it('lists 3 publish requests', async () => {
    const reqs = await listPublishRequests();
    expect(reqs.length).toBe(3);
    const statuses = reqs.map((r) => r.status).sort();
    expect(statuses).toEqual(['approved', 'pending', 'rejected']);
  });

  it('approvePublishRequest sets status to approved', async () => {
    const updated = await approvePublishRequest('pub-req-001', 'Looks fine, scope is read-only.');
    expect(updated.status).toBe('approved');
    expect(updated.review_notes).toBe('Looks fine, scope is read-only.');
    expect(updated.reviewer).toBeTruthy();
    expect(updated.reviewed_at_ms).toBeGreaterThan(0);
  });

  it('rejectPublishRequest sets status to rejected', async () => {
    const updated = await rejectPublishRequest('pub-req-001', 'Needs more security review.');
    expect(updated.status).toBe('rejected');
    expect(updated.review_notes).toBe('Needs more security review.');
    expect(updated.reviewer).toBeTruthy();
  });

  it('approvePublishRequest throws for unknown id', async () => {
    await expect(approvePublishRequest('nope', 'note')).rejects.toThrow(/not found/);
  });

  it('rejectPublishRequest throws for unknown id', async () => {
    await expect(rejectPublishRequest('nope', 'note')).rejects.toThrow(/not found/);
  });

  it('getPluginAuditLog returns up to 20 events sorted newest-first', async () => {
    const log = await getPluginAuditLog('plg-slack-notifier');
    expect(log.length).toBeGreaterThan(0);
    expect(log.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i - 1]!.timestamp_ms).toBeGreaterThanOrEqual(log[i]!.timestamp_ms);
    }
  });
});
