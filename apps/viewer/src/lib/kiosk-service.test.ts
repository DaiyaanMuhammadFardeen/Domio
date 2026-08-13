/**
 * Kiosk service tests — Wave 11 §S11.14.
 *
 * Per docs/frontend-roadmap/11-wave-novel-frontier.md.
 */

import { describe, it, expect } from 'vitest';
import {
  getKioskConfig,
  setKioskConfig,
  verifyAdminPin,
  type KioskConfig,
} from './kiosk-service';

describe('kiosk-service', () => {
  it('getKioskConfig returns a deterministic config for a deckId', async () => {
    const cfg = await getKioskConfig('demo-deck');
    expect(cfg.deck_id).toBe('demo-deck');
    expect(cfg.admin_pin).toBeTruthy();
    expect(cfg.reset_after_sec).toBeGreaterThan(0);
    expect(cfg.fullscreen).toBe(true);
    expect(cfg.hide_cursor).toBe(true);
  });

  it('getKioskConfig is deterministic for the same deckId', async () => {
    const a = await getKioskConfig('demo-deck');
    const b = await getKioskConfig('demo-deck');
    expect(a).toEqual(b);
  });

  it('getKioskConfig echoes the requested deckId', async () => {
    const cfg = await getKioskConfig('some-other-deck');
    expect(cfg.deck_id).toBe('some-other-deck');
  });

  it('setKioskConfig echoes the supplied config', async () => {
    const input: KioskConfig = {
      deck_id: 'demo-deck',
      admin_pin: '9999',
      reset_after_sec: 30,
      auto_advance_sec: 10,
      fullscreen: false,
      hide_cursor: false,
    };
    const out = await setKioskConfig(input);
    expect(out).toEqual(input);
  });

  it('verifyAdminPin returns valid=true for the bootstrap PIN', async () => {
    const cfg = await getKioskConfig('demo-deck');
    const res = await verifyAdminPin('demo-deck', cfg.admin_pin);
    expect(res.valid).toBe(true);
  });

  it('verifyAdminPin returns valid=false for a wrong PIN', async () => {
    const res = await verifyAdminPin('demo-deck', '0000');
    expect(res.valid).toBe(false);
  });

  it('verifyAdminPin returns valid=false for empty PIN', async () => {
    const res = await verifyAdminPin('demo-deck', '');
    expect(res.valid).toBe(false);
  });

  it('auto_advance_sec may be null (touch-only)', async () => {
    const cfg = await getKioskConfig('demo-deck');
    // Either null or a number — we just require the type narrows.
    if (cfg.auto_advance_sec !== null) {
      expect(typeof cfg.auto_advance_sec).toBe('number');
    } else {
      expect(cfg.auto_advance_sec).toBeNull();
    }
  });
});
