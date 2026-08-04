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

// ---------------------------------------------------------------------------
// P08 migrations — live data plane.
// ---------------------------------------------------------------------------
const P08_MIGRATIONS = [
  '0021_phase08_data_plane',
  '0022_phase08_live_data_indexes_seed',
];
const P08_TABLES = [
  'data_connection', 'data_source', 'query', 'dataset_snapshot',
  'scenario', 'formula_field', 'chart_widget', 'chart_binding',
  'annotation', 'threshold_rule', 'embed_config', 'freshness_record',
];

describe.skipIf(!hasDocker())('P08 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p08-mig-${process.pid}-${Date.now()}`;
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

  it('applies 0021–0022 cleanly', async () => {
    for (const m of P08_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);
    const expected = [...P08_TABLES, 'freshness_policy', 'threshold_rule_template'];
    for (const t of expected) {
      expect(tables).toContain(t);
    }
  });

  it('creates the key P08 columns and indexes', async () => {
    const { rows: cols } = await client.query<{ column_name: string; table_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'data_connection' AND column_name IN ('tenant_id', 'owner_id', 'connector_id', 'connector_ver', 'credential_ref'))
         OR (table_name = 'data_source' AND column_name IN ('connection_id', 'query_spec', 'schema_json', 'pii_class'))
         OR (table_name = 'query' AND column_name IN ('data_source_id', 'freshness_policy'))
         OR (table_name = 'dataset_snapshot' AND column_name IN ('query_id', 'hash', 'row_count', 'obj_key', 'expires_at'))
         OR (table_name = 'scenario' AND column_name IN ('deck_id', 'parent_id'))
         OR (table_name = 'formula_field' AND column_name IN ('expression', 'ast_json', 'version'))
         OR (table_name = 'chart_widget' AND column_name IN ('component_id', 'binding_id', 'props_json'))
         OR (table_name = 'chart_binding' AND column_name IN ('chart_widget_id', 'query_id', 'field_map', 'listen_to_filters'))
         OR (table_name = 'annotation' AND column_name IN ('chart_widget_id', 'scenario_id', 'bindable_point'))
         OR (table_name = 'threshold_rule' AND column_name IN ('measure', 'comparator', 'values', 'severity', 'style_override'))
         OR (table_name = 'embed_config' AND column_name IN ('provider', 'url', 'sizing', 'auth_passthrough'))
         OR (table_name = 'freshness_record' AND column_name IN ('binding_id', 'status', 'source', 'recorded_at'))
       )`,
    );
    expect(cols.length).toBeGreaterThanOrEqual(40);
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND indexname IN (
         'dataset_snapshot_scenario_idx', 'freshness_record_tenant_status_idx',
         'scenario_parent_idx', 'threshold_rule_widget_measure_idx'
       )`,
    );
    expect(idx.length).toBe(4);
  });

  it('seeds 4 freshness policies and 24 threshold-rule templates', async () => {
    const { rows: policies } = await client.query<{ policy_id: string }>(
      `SELECT policy_id FROM freshness_policy ORDER BY policy_id`,
    );
    expect(policies.map((r) => r.policy_id)).toEqual(['eager', 'lazy', 'manual', 'on_interval']);
    const { rows: templates } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM threshold_rule_template`,
    );
    expect(Number(templates[0]?.count ?? '0')).toBe(24);
  });

  it('enforces RLS policies exist for all P08 tables', async () => {
    const { rows } = await client.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1)
       ORDER BY tablename, policyname`,
      [P08_TABLES],
    );
    const perTable = new Map<string, string[]>();
    for (const r of rows) {
      perTable.set(r.tablename, [...(perTable.get(r.tablename) ?? []), r.policyname]);
    }
    for (const t of P08_TABLES) {
      const policies = perTable.get(t) ?? [];
      expect(policies).toContain(`${t}_tenant_isolation`);
    }
  });

  it('enforces an insert chain across the data plane', async () => {
    // data_connection → data_source → query → chart_widget → chart_binding → threshold_rule / freshness_record
    await client.query(
      `INSERT INTO data_connection (id, tenant_id, owner_id, connector_id, connector_ver, label, credential_ref)
       VALUES ('00000000-0000-4000-8000-000000000001', 'org-test', 'user-test', 'google-sheets', '1.0.0', 'Test Sheet', 'vault:key-1')`,
    );
    await client.query(
      `INSERT INTO data_source (id, tenant_id, connection_id, name, kind, query_spec, schema_json, pii_class)
       VALUES ('00000000-0000-4000-8000-000000000002', 'org-test', '00000000-0000-4000-8000-000000000001',
               'Revenue', 'sheet', '{"range":"A1:D24"}'::jsonb, '{"columns":[]}'::jsonb, 'medium')`,
    );
    await client.query(
      `INSERT INTO query (id, data_source_id, tenant_id, name, query_spec, freshness_policy)
       VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002',
               'org-test', 'revenue-monthly', '{}'::jsonb, '{"type":"eager"}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO chart_widget (id, tenant_id, deck_id, slide_id, component_id, type, props_json, binding_id)
       VALUES ('00000000-0000-4000-8000-000000000004', 'org-test', '00000000-0000-4000-8000-00000000000a',
               '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c',
               'chart', '{}'::jsonb, '00000000-0000-4000-8000-000000000005')`,
    );
    await client.query(
      `INSERT INTO chart_binding (id, tenant_id, chart_widget_id, query_id, field_map, listen_to_filters)
       VALUES ('00000000-0000-4000-8000-000000000005', 'org-test', '00000000-0000-4000-8000-000000000004',
               '00000000-0000-4000-8000-000000000003', '{"x":"month","y":"revenue"}'::jsonb, '{region}')`,
    );
    await client.query(
      `INSERT INTO threshold_rule (id, tenant_id, chart_widget_id, measure, comparator, values, severity, style_override)
       VALUES ('00000000-0000-4000-8000-000000000006', 'org-test', '00000000-0000-4000-8000-000000000004',
               'revenue', 'lt', '[1000000]'::jsonb, 'critical', '{"fill":"#EF4444"}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO freshness_record (id, tenant_id, binding_id, status, source)
       VALUES ('00000000-0000-4000-8000-000000000007', 'org-test', '00000000-0000-4000-8000-000000000005',
               'ok', 'poll')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM chart_binding WHERE tenant_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('rolls back 0022 → 0021 cleanly', async () => {
    for (const m of [...P08_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of [...P08_TABLES, 'freshness_policy', 'threshold_rule_template']) {
      expect(tables).not.toContain(t);
    }
  });
});

const P09_MIGRATIONS = [
  '0023_phase09_animation',
  '0024_phase09_animation_indexes_seed',
];
const P09_TABLES = [
  'timeline', 'timeline_track', 'timeline_keyframe', 'timeline_trigger',
  'easing_curve', 'animation_preset', 'transition', 'reduced_motion_settings',
  'magic_move_config', 'animation_export_job',
];

describe.skipIf(!hasDocker())('P09 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p09-mig-${process.pid}-${Date.now()}`;
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
    try { await client.end(); } catch { /* ignore */ }
    try { execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' }); } catch { /* ignore */ }
  });

  it('applies 0023 + 0024 cleanly', async () => {
    for (const m of P09_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P09_TABLES) {
      expect(tables).toContain(t);
    }
  });

  it('creates the P09 columns and indexes', async () => {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (column_name = 'tenant_id' OR column_name = 'timeline_id' OR column_name = 'track_id')`,
    );
    const cols = rows.map((r) => `${r.table_name}.${r.column_name}`);
    expect(cols).toContain('timeline.tenant_id');
    expect(cols).toContain('timeline_track.tenant_id');
    expect(cols).toContain('timeline_keyframe.tenant_id');
    expect(cols).toContain('timeline_trigger.tenant_id');
    expect(cols).toContain('timeline_track.timeline_id');
    expect(cols).toContain('timeline_keyframe.track_id');
    expect(cols).toContain('timeline_trigger.timeline_id');
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = idx.map((r) => r.indexname);
    for (const i of ['timeline_tenant_deck_idx', 'timeline_track_timeline_idx', 'timeline_keyframe_track_idx', 'transition_tenant_deck_idx']) {
      expect(indexes).toContain(i);
    }
  });

  it('enforces RLS policies on all P09 tables', async () => {
    const { rows } = await client.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`,
    );
    const policies = new Set(rows.map((r) => r.policyname));
    for (const t of P09_TABLES) {
      expect(policies.has(`${t}_tenant_isolation`)).toBe(true);
    }
  });

  it('seeds easing curves and 24 animation presets', async () => {
    const { rows: curves } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM easing_curve WHERE tenant_id = 'system'`,
    );
    expect(Number(curves[0]?.count ?? '0')).toBe(10);
    const { rows: presets } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM animation_preset`,
    );
    expect(Number(presets[0]?.count ?? '0')).toBe(24);
  });

  it('enforces the P09 insert chain (timeline → track → keyframe → trigger)', async () => {
    const tl = await client.query<{ id: string }>(
      `INSERT INTO timeline (id, tenant_id, deck_id, element_id, duration_ms) VALUES
         ('01H0000000000000000000000E1', 'org-test', 'deck-1', NULL, 800) RETURNING id`,
    );
    const timelineId = tl.rows[0]!.id;
    const tr = await client.query<{ id: string }>(
      `INSERT INTO timeline_track (id, tenant_id, timeline_id, property) VALUES
         ('01H0000000000000000000000E2', 'org-test', $1, 'opacity') RETURNING id`,
      [timelineId],
    );
    const trackId = tr.rows[0]!.id;
    await client.query(
      `INSERT INTO timeline_keyframe (id, tenant_id, track_id, time_ms, value) VALUES
         ('01H0000000000000000000000E3', 'org-test', $1, 0, '{"opacity":0}'::jsonb)`,
      [trackId],
    );
    await client.query(
      `INSERT INTO timeline_trigger (id, tenant_id, timeline_id, kind) VALUES
         ('01H0000000000000000000000E4', 'org-test', $1, 'on_enter')`,
      [timelineId],
    );
    await client.query(
      `INSERT INTO transition (id, tenant_id, deck_id, from_slide_id, to_slide_id, kind, duration_ms, easing) VALUES
         ('01H0000000000000000000000E5', 'org-test', 'deck-1', 's1', 's2', 'fade', 300, 'linear')`,
    );
    await client.query(
      `INSERT INTO reduced_motion_settings (deck_id, tenant_id, policy) VALUES
         ('deck-1', 'org-test', 'follow_os')`,
    );
    await client.query(
      `INSERT INTO magic_move_config (id, tenant_id, deck_id, from_slide_id, to_slide_id, element_role, duration_ms, easing) VALUES
         ('01H0000000000000000000000E6', 'org-test', 'deck-1', 's1', 's2', 'hero', 500, 'linear')`,
    );
    await client.query(
      `INSERT INTO animation_export_job (id, tenant_id, deck_id, format, range) VALUES
         ('01H0000000000000000000000E7', 'org-test', 'deck-1', 'gif', '{"from":0,"to":2}'::jsonb)`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM timeline_keyframe WHERE tenant_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('rejects a bad transition kind and a bad trigger kind', async () => {
    await expect(
      client.query(
        `INSERT INTO transition (id, tenant_id, deck_id, from_slide_id, to_slide_id, kind, duration_ms, easing) VALUES
           ('01H0000000000000000000000F1', 'org-test', 'deck-1', 's1', 's2', 'warp', 300, 'linear')`,
      ),
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO timeline_trigger (id, tenant_id, timeline_id, kind) VALUES
           ('01H0000000000000000000000F2', 'org-test', '01H0000000000000000000000E1', 'on_scroll')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0024 → 0023 cleanly', async () => {
    for (const m of [...P09_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P09_TABLES) {
      expect(tables).not.toContain(t);
    }
  });
});
