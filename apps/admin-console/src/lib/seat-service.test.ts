/**
 * Seat analytics service tests — Wave 8 §S8.7.
 */

import { describe, it, expect } from 'vitest';
import { getLicenseSummary, getSeatUsageHistory, listUserActivity } from './seat-service';

describe('seat-service', () => {
  it('getLicenseSummary returns seats_used <= seats_total', async () => {
    const license = await getLicenseSummary();
    expect(license.seats_used).toBeLessThanOrEqual(license.seats_total);
    expect(license.seats_available).toBe(license.seats_total - license.seats_used);
    expect(['free', 'starter', 'team', 'business', 'enterprise']).toContain(license.tier);
    expect(license.monthly_cost_cents).toBeGreaterThanOrEqual(0);
  });

  it('getSeatUsageHistory(days=30) returns 30 points', async () => {
    const history = await getSeatUsageHistory(30);
    expect(history).toHaveLength(30);
    for (const point of history) {
      expect(typeof point.date_ms).toBe('number');
      expect(point.date_ms).toBeGreaterThan(0);
      expect(typeof point.seats_used).toBe('number');
      expect(point.seats_used).toBeGreaterThanOrEqual(0);
    }
    // Points are ordered oldest → newest.
    for (let i = 1; i < history.length; i += 1) {
      expect(history[i]!.date_ms).toBeGreaterThan(history[i - 1]!.date_ms);
    }
  });

  it('listUserActivity returns 12+ users', async () => {
    const users = await listUserActivity();
    expect(users.length).toBeGreaterThanOrEqual(12);
    for (const u of users) {
      expect(typeof u.user_id).toBe('string');
      expect(u.user_id.length).toBeGreaterThan(0);
      expect(typeof u.email).toBe('string');
      expect(u.email).toMatch(/@/);
      expect(typeof u.name).toBe('string');
      expect(['admin', 'editor', 'viewer', 'guest']).toContain(u.role);
      expect(typeof u.decks_created).toBe('number');
      expect(typeof u.shares_sent).toBe('number');
      expect(typeof u.minutes_presenting).toBe('number');
      expect(u.last_active_at_ms === null || typeof u.last_active_at_ms === 'number').toBe(true);
    }
  });

  it('returned data has consistent types', async () => {
    const license = await getLicenseSummary();
    expect(typeof license.tier).toBe('string');
    expect(typeof license.seats_total).toBe('number');
    expect(typeof license.seats_used).toBe('number');
    expect(typeof license.seats_available).toBe('number');
    expect(license.renews_at_ms === null || typeof license.renews_at_ms === 'number').toBe(true);
    expect(typeof license.monthly_cost_cents).toBe('number');
  });
});
