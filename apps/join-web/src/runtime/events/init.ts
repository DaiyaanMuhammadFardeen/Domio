/**
 * apps/join-web — analytics initialization (Phase 17).
 *
 * join-web is anonymous-by-default (no email/PII). The privacy_mode
 * is `anon_consent` once the audience member accepts the consent
 * banner, `anon_no_track` if they decline or if DNT is set. The
 * viewer_id_key is a salted hash of the device fingerprint (see
 * join-web/src/runtime/device-id.ts), generated once per session and
 * persisted to localStorage.
 */

import {
  AnalyticsClient,
  type AnalyticsConfig,
  type AnalyticsContext,
  type PrivacyMode,
  type DeviceClass,
} from '@domio/analytics-sdk';

let singleton: AnalyticsClient | null = null;

export interface JoinInitOptions {
  ingestUrl: string;
  hmacKeyHex: string;
  workspace_id: string;
  deck_id: string;
  viewer_id_key: string;
  session_id?: string;
  share_link_id?: string;
  privacy_mode?: PrivacyMode;
  device_class?: DeviceClass;
  region_pinned?: 'global' | 'bd';
  country_iso?: string;
}

export function initializeJoinAnalytics(opts: JoinInitOptions): AnalyticsClient {
  if (singleton) return singleton;
  // Build the context without undefined fields so exactOptionalPropertyTypes
  // is satisfied — when optional values are absent we omit the key
  // rather than serializing `undefined`.
  const context: AnalyticsContext = {
    workspace_id: opts.workspace_id,
    deck_id: opts.deck_id,
    viewer_id_key: opts.viewer_id_key,
    privacy_mode: opts.privacy_mode ?? 'anon_consent',
    source_app: 'join-web',
    device_class: opts.device_class ?? 'mobile',
    region_pinned: opts.region_pinned ?? 'global',
  };
  if (opts.session_id !== undefined) context.session_id = opts.session_id;
  if (opts.share_link_id !== undefined) context.share_link_id = opts.share_link_id;
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

export function _resetJoinAnalyticsForTests(): void {
  if (singleton) {
    void singleton.stop();
  }
  singleton = null;
}

export function getJoinAnalyticsClient(): AnalyticsClient | null {
  return singleton;
}
