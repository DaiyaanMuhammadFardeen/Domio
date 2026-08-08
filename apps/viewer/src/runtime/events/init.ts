/**
 * apps/viewer — analytics initialization (Phase 17).
 *
 * One AnalyticsClient per app boot. The defaults (workspace_id, source_app,
 * device_class, country_iso, region_pinned) are detected from the rendered
 * HTML head (data-* attributes) and the browser context.
 *
 * Replace the bootstrap in apps/viewer/src/app/layout.tsx to call
 * initializeAnalytics() once on mount.
 */

import {
  AnalyticsClient,
  type AnalyticsConfig,
  type AnalyticsContext,
  type PrivacyMode,
  type SourceApp,
  type DeviceClass,
} from '@domio/analytics-sdk';

let singleton: AnalyticsClient | null = null;

export interface InitOptions {
  ingestUrl: string;
  hmacKeyHex: string;
  workspace_id: string;
  deck_id: string;
  viewer_id_key: string;
  session_id?: string;
  share_link_id?: string;
  experiment_id?: string;
  variant_id?: string;
  privacy_mode?: PrivacyMode;
  device_class?: DeviceClass;
  region_pinned?: 'global' | 'bd';
  country_iso?: string;
}

/**
 * Initialize the listener-side AnalyticsClient. Idempotent — calling
 * twice returns the same instance.
 */
export function initializeAnalytics(opts: InitOptions): AnalyticsClient {
  if (singleton) return singleton;
  const source_app: SourceApp = 'viewer';
  // Build the context without undefined fields so exactOptionalPropertyTypes
  // is satisfied — when optional values are absent we omit the key
  // rather than serializing `undefined`.
  const context: AnalyticsContext = {
    workspace_id: opts.workspace_id,
    deck_id: opts.deck_id,
    viewer_id_key: opts.viewer_id_key,
    privacy_mode: opts.privacy_mode ?? 'pseudonymous',
    source_app,
    device_class: opts.device_class ?? 'desktop',
    region_pinned: opts.region_pinned ?? 'global',
  };
  if (opts.session_id !== undefined) context.session_id = opts.session_id;
  if (opts.share_link_id !== undefined) context.share_link_id = opts.share_link_id;
  if (opts.experiment_id !== undefined) context.experiment_id = opts.experiment_id;
  if (opts.variant_id !== undefined) context.variant_id = opts.variant_id;
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

/**
 * Test-only: tear down the singleton. Production code never calls this.
 */
export function _resetAnalyticsForTests(): void {
  if (singleton) {
    void singleton.stop();
  }
  singleton = null;
}

export function getAnalyticsClient(): AnalyticsClient | null {
  return singleton;
}
