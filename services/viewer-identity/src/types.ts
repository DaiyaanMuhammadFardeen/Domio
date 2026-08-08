/**
 * Viewer-identity — shared types (Phase 17 W3).
 *
 * The service is the source of truth for:
 *   * Which viewer_id_key (salted) we have ever seen → postgres viewer
 *   * Which devices we believe belong to the same canonical viewer
 *     → postgres identity_link
 *   * What consent the viewer has granted → postgres consent_event
 *   * Workspace-level privacy mode policy (which modes we accept)
 *
 * It is also the entry point for GDPR right-to-erasure and
 * right-to-access. Both run async jobs via the viewer_erase_run /
 * viewer_export_run tables.
 */

export type PrivacyMode = 'identified' | 'pseudonymous' | 'anon_consent' | 'anon_no_track';

export type Region = 'us' | 'eu' | 'bd' | 'sg' | 'au';

export interface IdentityConfig {
  /** Postgres connection string. Required. */
  postgresUrl: string;
  /** Redis URL for hot-path caching (viewer_id_key → viewer_id). */
  redisUrl: string;
  /** Port the HTTP server binds to. */
  port: number;
  /** Salt used for salted-hash identifiers. Rotated quarterly. */
  identifierSalt: string;
  /** Allowed privacy modes per workspace. Default accepts all 4. */
  defaultPrivacyModes: readonly PrivacyMode[];
  /** When false, write to ClickHouse analytics.viewer_identity_long is disabled. */
  writeToClickHouse: boolean;
  /** ClickHouse HTTP endpoint (only used when writeToClickHouse=true). */
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
}

export function loadConfigFromEnv(): IdentityConfig {
  const chUrl = process.env['CLICKHOUSE_URL'];
  return {
    postgresUrl: process.env['DATABASE_URL'] ?? process.env['POSTGRES_URL'] ?? 'postgres://domio:domio@localhost:5432/domio',
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    port: Number(process.env['PORT'] ?? '3050'),
    identifierSalt: process.env['IDENTITY_SALT'] ?? 'change-me-on-deploy',
    defaultPrivacyModes: ['identified', 'pseudonymous', 'anon_consent', 'anon_no_track'],
    writeToClickHouse: process.env['IDENTITY_WRITE_CH'] === 'true',
    clickhouseUrl: chUrl ?? '',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
  };
}

export interface ViewerRecord {
  viewer_id: string;
  workspace_id: string;
  viewer_id_key: string;
  privacy_mode: PrivacyMode;
  region_pinned: Region | null;
  created_at: number;
  last_seen_at: number;
  canonical_id: string | null;
  metadata: Record<string, unknown>;
}

export interface IdentityLink {
  link_id: string;
  workspace_id: string;
  canonical_id: string;
  alternate_id: string;
  confidence: number;
  method: 'last_seen_ip' | 'last_seen_ua' | 'email_hash' | 'manual';
  created_at: number;
}

export interface ConsentEvent {
  event_id: string;
  workspace_id: string;
  viewer_id: string;
  privacy_mode: PrivacyMode;
  action: 'grant' | 'revoke';
  source: string;
  policy_version: string;
  user_agent: string | null;
  ip_class: string | null;
  occurred_at: number;
}
