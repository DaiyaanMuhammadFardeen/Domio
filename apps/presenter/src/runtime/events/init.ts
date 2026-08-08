/**
 * apps/presenter — analytics initialization (Phase 17).
 *
 * The presenter analytics client is initialized once per presenter
 * session (NOT per app boot) so the session_id is set correctly from
 * the start. The presenter is its own viewer-id-source — we use the
 * presenter_user_id as the viewer_id_key, which routes correctly to
 * the per-user analytics surface.
 */

import {
  AnalyticsClient,
  type AnalyticsConfig,
  type AnalyticsContext,
  type PrivacyMode,
  type DeviceClass,
} from '@domio/analytics-sdk';

let singleton: AnalyticsClient | null = null;

export interface PresenterInitOptions {
  ingestUrl: string;
  hmacKeyHex: string;
  workspace_id: string;
  deck_id: string;
  presenter_user_id: string;
  session_id?: string;
  privacy_mode?: PrivacyMode;
  device_class?: DeviceClass;
  region_pinned?: 'global' | 'bd';
  country_iso?: string;
}

export function initializePresenterAnalytics(opts: PresenterInitOptions): AnalyticsClient {
  if (singleton) return singleton;
  // Build the context without undefined fields so exactOptionalPropertyTypes
  // is satisfied — when optional values are absent we omit the key
  // rather than serializing `undefined`.
  const context: AnalyticsContext = {
    workspace_id: opts.workspace_id,
    deck_id: opts.deck_id,
    viewer_id_key: opts.presenter_user_id, // presenter is its own viewer for analytics purposes
    privacy_mode: opts.privacy_mode ?? 'identified',
    source_app: 'presenter',
    device_class: opts.device_class ?? 'desktop',
    region_pinned: opts.region_pinned ?? 'global',
  };
  if (opts.session_id !== undefined) context.session_id = opts.session_id;
  if (opts.country_iso !== undefined) context.country_iso = opts.country_iso;
  const config: AnalyticsConfig = {
    ingestUrl: opts.ingestUrl,
    hmacKeyHex: opts.hmacKeyHex,
    honorDnt: true,
  };
  singleton = new AnalyticsClient({ ...config, context });
  singleton.start();
  return singleton;
}

export function _resetPresenterAnalyticsForTests(): void {
  if (singleton) {
    void singleton.stop();
  }
  singleton = null;
}

export function getPresenterAnalyticsClient(): AnalyticsClient | null {
  return singleton;
}
