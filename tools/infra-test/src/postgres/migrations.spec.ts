import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'infrastructure', 'postgres', 'migrations');
const P06_MIGRATIONS = [
  '0011_phase06_component_catalog',
  '0012_phase06_libraries',
  '0013_phase06_marketplace',
  '0014_phase06_templates',
  '0015_phase06_icon_index',
  '0016_phase06_media_audit',
];
const P07_MIGRATIONS = [
  '0017_phase07_design_tokens',
  '0018_phase07_themes',
  '0019_phase07_brand_kits',
  '0020_phase07_brand_context_fonts_audit',
];

function readSql(name: string, dir: 'up' | 'down'): string {
  return readFileSync(join(MIGRATIONS_DIR, `${name}.${dir}.sql`), 'utf8');
}

function hasDocker(): boolean {
  try {
    execSync('docker info >/dev/null 2>&1', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForPg(cfg: pg.ClientConfig, attempts = 60): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const c = new pg.Client(cfg);
    try {
      await c.connect();
      await c.end();
      return;
    } catch (e) {
      lastErr = e;
      try {
        await c.end();
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Postgres did not become ready in time: ${String(lastErr)}`);
}

describe.skipIf(!hasDocker())('P06 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p06-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=domio', '-p', '0:5432', 'postgres:16-alpine'],
      { stdio: 'ignore' },
    );
    let attempts = 90;
    while (attempts-- > 0) {
      try {
        const out = execSync(`docker port ${name} 5432/tcp`, { encoding: 'utf8' }).trim();
        const line = out.split('\n')[0];
        const [h, p] = line ? line.split(':') : ['', ''];
        if (h && p) {
          host = h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h;
          port = Number(p);
          if (port) break;
        }
      } catch {
        /* container not ready yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!port) throw new Error('Could not determine container port');
    await waitForPg({ host, port, user: 'postgres', password: 'test', database: 'domio' });
    client = new pg.Client({ host, port, user: 'postgres', password: 'test', database: 'domio' });
    await client.connect();
  }, 180000);

  afterAll(async () => {
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    try {
      execSync(`docker rm -f ${containerName} >/dev/null 2>&1`, { stdio: 'ignore' });
    } catch {
      /* nothing to clean */
    }
  }, 30000);

  it('applies 0011–0015 cleanly', async () => {
    for (const m of P06_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);
    const expected = [
      'brand_lock_region',
      'component_packages',
      'component_variants',
      'icons',
      'license_grant',
      'marketplace_listing',
      'marketplace_review',
      'revenue_share_event',
      'section_template',
      'smart_component_prop',
      'sticker_pack',
      'stored_blobs',
      'audit_log',
      'team_library',
      'team_library_event',
      'template',
      'user_library',
    ];
    for (const t of expected) {
      expect(tables).toContain(t);
    }
  });

  it('creates the key columns and indexes', async () => {
    const { rows: cols } = await client.query<{ column_name: string; table_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'component_packages' AND column_name IN ('props_schema', 'package_hash', 'files', 'catalog_id'))
         OR (table_name = 'smart_component_prop' AND column_name IN ('prop_key', 'prop_schema', 'control_hint'))
         OR (table_name = 'team_library_event' AND column_name IN ('library_id', 'seq', 'event_type'))
         OR (table_name = 'license_grant' AND column_name IN ('token', 'expires_at', 'offline_grace_until'))
         OR (table_name = 'marketplace_review' AND column_name IN ('rating', 'status', 'verified_buyer'))
         OR (table_name = 'revenue_share_event' AND column_name IN ('gross_cents', 'fee_cents', 'net_cents'))
         OR (table_name = 'brand_lock_region' AND column_name IN ('scope', 'strictness', 'scene_graph_selector'))
         OR (table_name = 'icons' AND column_name IN ('name', 'path_data', 'perceptual_hash'))
       )`,
    );
    expect(cols.length).toBeGreaterThanOrEqual(16);
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_trgm%'`,
    );
    expect(idx.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces a smart component prop insert', async () => {
    await client.query(
      `INSERT INTO component_packages (id, catalog_id, version, kind, name, props_schema, files, package_hash)
       VALUES ('00000000-0000-4000-8000-000000000001', 'domio.test.card', '1.0.0', 'component', 'Test',
               '{"type":"object","properties":{}}'::jsonb, '{}'::jsonb, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM component_packages WHERE catalog_id = 'domio.test.card'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('rolls back 0015 → 0011 cleanly', async () => {
    for (const m of [...P06_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of ['component_packages', 'marketplace_listing', 'brand_lock_region', 'icons', 'team_library_event']) {
      expect(tables).not.toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// P07 migrations — theming, brand & design tokens.
// ---------------------------------------------------------------------------
describe.skipIf(!hasDocker())('P07 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p07-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=domio', '-p', '0:5432', 'postgres:16-alpine'],
      { stdio: 'ignore' },
    );
    let attempts = 90;
    while (attempts-- > 0) {
      try {
        const out = execSync(`docker port ${name} 5432/tcp`, { encoding: 'utf8' }).trim();
        const line = out.split('\n')[0];
        const [h, p] = line ? line.split(':') : ['', ''];
        if (h && p) {
          host = h === '0.0.0.0' || h === '::' ? '127.0.0.1' : h;
          port = Number(p);
          if (port) break;
        }
      } catch {
        /* container not ready yet */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!port) throw new Error('Could not determine container port');
    await waitForPg({ host, port, user: 'postgres', password: 'test', database: 'domio' });
    client = new pg.Client({ host, port, user: 'postgres', password: 'test', database: 'domio' });
    await client.connect();
  }, 180000);

  afterAll(async () => {
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    try {
      execSync(`docker rm -f ${containerName} >/dev/null 2>&1`, { stdio: 'ignore' });
    } catch {
      /* nothing to clean */
    }
  }, 30000);

  it('applies 0017–0020 cleanly', async () => {
    for (const m of P07_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);
    const expected = [
      'audit_brand_event',
      'brand_context',
      'brand_extraction_job',
      'brand_kit',
      'brand_kit_archive',
      'brand_kit_font',
      'brand_kit_imagery_rule',
      'brand_kit_logo',
      'brand_kit_palette',
      'brand_kit_sub_brand',
      'design_token',
      'font_asset',
      'theme',
      'theme_application_event',
      'theme_override',
      'theme_version',
      'token_alias',
    ];
    for (const t of expected) {
      expect(tables).toContain(t);
    }
  });

  it('creates the key P07 columns and indexes', async () => {
    const { rows: cols } = await client.query<{ column_name: string; table_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'design_token' AND column_name IN ('token_id', 'org_id', 'group_name', 'type', 'value', 'roles'))
         OR (table_name = 'token_alias' AND column_name IN ('alias_token_id', 'target_token_id', 'org_id'))
         OR (table_name = 'theme' AND column_name IN ('theme_id', 'org_id', 'kind', 'parent_theme_id', 'signature'))
         OR (table_name = 'theme_version' AND column_name IN ('theme_id', 'version', 'tokens_resolved'))
         OR (table_name = 'theme_override' AND column_name IN ('override_id', 'org_id', 'deck_id', 'scope', 'scope_id', 'tokens_partial', 'condition_expr'))
         OR (table_name = 'theme_application_event' AND column_name IN ('event_id', 'org_id', 'deck_id', 'from_theme_id', 'to_theme_id', 'tokens_changed_count', 'latency_ms'))
         OR (table_name = 'brand_kit' AND column_name IN ('kit_id', 'owner_org_id', 'scope', 'status', 'published_at', 'archived_at', 'signature', 'extraction_attestation_id'))
         OR (table_name = 'brand_kit_logo' AND column_name IN ('logo_id', 'kit_id', 'variant', 'format', 'asset_url', 'content_hash', 'clear_space_px'))
         OR (table_name = 'brand_kit_palette' AND column_name IN ('palette_id', 'kit_id', 'token_ids', 'cv_safe', 'hue_spacing_deg'))
         OR (table_name = 'brand_kit_font' AND column_name IN ('font_id', 'kit_id', 'font_asset_id', 'license_status', 'glyph_coverage', 'axes'))
         OR (table_name = 'brand_kit_imagery_rule' AND column_name IN ('rule_id', 'kit_id', 'do_rules', 'dont_rules', 'min_resolution'))
         OR (table_name = 'brand_kit_sub_brand' AND column_name IN ('parent_kit_id', 'child_kit_id', 'inheritance_type'))
         OR (table_name = 'brand_kit_archive' AND column_name IN ('kit_id', 'archived_at', 'reason'))
         OR (table_name = 'brand_context' AND column_name IN ('context_id', 'org_id', 'name', 'active_kit_id', 'archived_at'))
         OR (table_name = 'brand_extraction_job' AND column_name IN ('job_id', 'org_id', 'url', 'status', 'stages', 'attribution', 'confidence_scores', 'result', 'error_code'))
         OR (table_name = 'font_asset' AND column_name IN ('font_id', 'kit_id', 'file_url', 'format', 'weight', 'sha256', 'license_status', 'license_url', 'anti_piracy_score'))
         OR (table_name = 'audit_brand_event' AND column_name IN ('event_id', 'org_id', 'kit_id', 'actor_id', 'action', 'payload'))
       )`,
    );
    expect(cols.length).toBeGreaterThanOrEqual(40);
  });

  it('enforces a design_token insert', async () => {
    await client.query(
      `INSERT INTO design_token (token_id, org_id, group_name, name, type, value, created_by)
       VALUES ('00000000-0000-4000-8000-000000000001', 'org-test', 'color', 'brand.primary', 'color',
               '{"hex":"#FF0000"}'::jsonb, 'user-test')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM design_token WHERE org_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('enforces a brand_kit insert', async () => {
    await client.query(
      `INSERT INTO brand_kit (kit_id, name, owner_org_id, scope, status, created_by)
       VALUES ('00000000-0000-4000-8000-000000000002', 'Test Brand', 'org-test', 'org', 'draft', 'user-test')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM brand_kit WHERE owner_org_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('enforces a theme insert', async () => {
    await client.query(
      `INSERT INTO theme (theme_id, org_id, name, kind, created_by)
       VALUES ('00000000-0000-4000-8000-000000000003', 'org-test', 'Test Theme', 'user', 'user-test')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM theme WHERE org_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('enforces an audit_brand_event insert', async () => {
    await client.query(
      `INSERT INTO audit_brand_event (event_id, org_id, kit_id, actor_id, action, payload)
       VALUES ('00000000-0000-4000-8000-000000000004', 'org-test',
               '00000000-0000-4000-8000-000000000002', 'user-test', 'brand_kit.published',
               '{"message":"published"}'::jsonb)`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM audit_brand_event WHERE org_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('enforces RLS policies exist for P07 tables', async () => {
    const { rows } = await client.query<{ policyname: string; tablename: string }>(
      `SELECT policyname, tablename FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN (
           'design_token', 'token_alias', 'theme', 'theme_version',
           'theme_override', 'theme_application_event', 'brand_kit',
           'brand_kit_logo', 'brand_kit_palette', 'brand_kit_font',
           'brand_kit_imagery_rule', 'brand_kit_sub_brand', 'brand_kit_archive',
           'brand_context', 'brand_extraction_job', 'font_asset', 'audit_brand_event'
         )
       ORDER BY tablename, policyname`,
    );
    // Every P07 table should have at least one RLS policy.
    const tablesWithPolicies = new Set(rows.map((r) => r.tablename));
    for (const t of [
      'design_token', 'token_alias', 'theme', 'brand_kit',
      'brand_context', 'audit_brand_event',
    ]) {
      expect(tablesWithPolicies.has(t)).toBe(true);
    }
    // audit_brand_event should have exactly SELECT + INSERT (no UPDATE/DELETE).
    const auditPolicies = rows.filter((r) => r.tablename === 'audit_brand_event');
    const auditPolicyNames = auditPolicies.map((r) => r.policyname);
    expect(auditPolicyNames).toContain('audit_brand_event_select');
    expect(auditPolicyNames).toContain('audit_brand_event_insert');
    expect(auditPolicyNames).not.toContain('audit_brand_event_update');
    expect(auditPolicyNames).not.toContain('audit_brand_event_delete');
  });

  it('rolls back 0020 → 0017 cleanly', async () => {
    for (const m of [...P07_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of [
      'design_token', 'token_alias', 'theme', 'theme_version',
      'theme_override', 'theme_application_event', 'brand_kit',
      'brand_kit_logo', 'brand_kit_palette', 'brand_kit_font',
      'brand_kit_imagery_rule', 'brand_kit_sub_brand', 'brand_kit_archive',
      'brand_context', 'brand_extraction_job', 'font_asset', 'audit_brand_event',
    ]) {
      expect(tables).not.toContain(t);
    }
  });
});
