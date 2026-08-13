import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'infrastructure',
  'postgres',
  'migrations',
);
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
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
    for (const t of [
      'component_packages',
      'marketplace_listing',
      'brand_lock_region',
      'icons',
      'team_library_event',
    ]) {
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
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      'design_token',
      'token_alias',
      'theme',
      'brand_kit',
      'brand_context',
      'audit_brand_event',
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
      'design_token',
      'token_alias',
      'theme',
      'theme_version',
      'theme_override',
      'theme_application_event',
      'brand_kit',
      'brand_kit_logo',
      'brand_kit_palette',
      'brand_kit_font',
      'brand_kit_imagery_rule',
      'brand_kit_sub_brand',
      'brand_kit_archive',
      'brand_context',
      'brand_extraction_job',
      'font_asset',
      'audit_brand_event',
    ]) {
      expect(tables).not.toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// P08 migrations — live data plane.
// ---------------------------------------------------------------------------
const P08_MIGRATIONS = ['0021_phase08_data_plane', '0022_phase08_live_data_indexes_seed'];
const P08_TABLES = [
  'data_connection',
  'data_source',
  'query',
  'dataset_snapshot',
  'scenario',
  'formula_field',
  'chart_widget',
  'chart_binding',
  'annotation',
  'threshold_rule',
  'embed_config',
  'freshness_record',
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
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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

const P09_MIGRATIONS = ['0023_phase09_animation', '0024_phase09_animation_indexes_seed'];
const P09_TABLES = [
  'timeline',
  'timeline_track',
  'timeline_keyframe',
  'timeline_trigger',
  'easing_curve',
  'animation_preset',
  'transition',
  'reduced_motion_settings',
  'magic_move_config',
  'animation_export_job',
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
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
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
    for (const i of [
      'timeline_tenant_deck_idx',
      'timeline_track_timeline_idx',
      'timeline_keyframe_track_idx',
      'transition_tenant_deck_idx',
    ]) {
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

const P10_MIGRATIONS = ['0025_phase10_prototyping', '0026_phase10_prototyping_indexes_seed'];
const P10_TABLES = [
  'hotspot',
  'overlay',
  'branching_edge',
  'interaction_state',
  'variable',
  'variable_binding',
  'conditional_rule',
];

describe.skipIf(!hasDocker())('P10 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0025 + 0026 cleanly', async () => {
    for (const m of P10_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P10_TABLES) expect(tables).toContain(t);
  });

  it('creates the P10 columns and indexes', async () => {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [P10_TABLES],
    );
    const cols = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    for (const c of [
      'hotspot.geometry',
      'hotspot.target_ref',
      'overlay.schema',
      'branching_edge.from_slide_id',
      'branching_edge.to_slide_id',
      'interaction_state.state_machine',
      'variable.default_value',
      'variable_binding.variable_id',
      'conditional_rule.condition',
      'conditional_rule.action',
    ])
      expect(cols.has(c)).toBe(true);

    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = new Set(idx.map((r) => r.indexname));
    for (const i of [
      'hotspot_geometry_gin_idx',
      'interaction_state_machine_gin_idx',
      'branching_edge_tenant_deck_idx',
      'variable_tenant_deck_idx',
      'conditional_rule_deck_priority_idx',
    ])
      expect(indexes.has(i)).toBe(true);
  });

  it('enforces RLS policies on all P10 tables', async () => {
    const { rows } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public'`,
    );
    const policies = new Set(rows.map((r) => r.policyname));
    for (const t of P10_TABLES) expect(policies.has(`${t}_tenant_isolation`)).toBe(true);
  });

  it('seeds four hotspots and two overlays', async () => {
    const { rows: hs } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM hotspot WHERE tenant_id = 'system'`,
    );
    expect(Number(hs[0]?.count ?? '0')).toBe(4);
    const { rows: ov } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM overlay WHERE tenant_id = 'system'`,
    );
    expect(Number(ov[0]?.count ?? '0')).toBe(2);
  });

  it('inserts a full M1 + M2 record chain', async () => {
    await client.query(
      `INSERT INTO hotspot (id, tenant_id, deck_id, slide_id, name, geometry, target_type, target_ref)
       VALUES ('01H000000000000000000000QA1', 'org-test', 'deck-1', 's1', 'Next',
               '{"kind":"rect","x":0,"y":0,"w":0.2,"h":0.2}'::jsonb,
               'slide', '{"slideId":"s2"}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO overlay (id, tenant_id, deck_id, slide_id, name, type, size_strategy, schema)
       VALUES ('01H000000000000000000000QA2', 'org-test', 'deck-1', 's1', 'Info', 'modal', 'small', '{}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO variable (id, tenant_id, deck_id, name, scope, type, default_value)
       VALUES ('01H000000000000000000000QA3', 'org-test', 'deck-1', 'TIER', 'deck', 'string', '"monthly"'::jsonb)`,
    );
    await client.query(
      `INSERT INTO conditional_rule (id, tenant_id, deck_id, name, condition, condition_source, action)
       VALUES ('01H000000000000000000000QA4', 'org-test', 'deck-1', 'Annual',
               '{"kind":"binary"}'::jsonb, '$TIER == "annual"',
               '{"kind":"show","params":{"targetId":"badge"}}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO variable_binding (id, tenant_id, deck_id, variable_id, target_kind, target_id, target_prop)
       VALUES ('01H000000000000000000000QA5', 'org-test', 'deck-1',
               '01H000000000000000000000QA3', 'element_prop', 'badge', 'visible')`,
    );
    await client.query(
      `INSERT INTO branching_edge (id, tenant_id, deck_id, from_slide_id, to_slide_id, name, rule_id)
       VALUES ('01H000000000000000000000QA6', 'org-test', 'deck-1', 's1', 's2', 'Continue',
               '01H000000000000000000000QA4')`,
    );
    await client.query(
      `INSERT INTO interaction_state (id, tenant_id, deck_id, instance_id, state_machine, current_state, scope)
       VALUES ('01H000000000000000000000QA7', 'org-test', 'deck-1', 'instance-1',
               '{"states":["idle","active"],"initial":"idle","transitions":[]}'::jsonb,
               'idle', 'session')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM variable_binding WHERE tenant_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('rejects invalid enum values and duplicate branching edges', async () => {
    await expect(
      client.query(
        `INSERT INTO overlay (id, tenant_id, deck_id, slide_id, name, type, size_strategy, schema)
         VALUES ('01H000000000000000000000QB1', 'org-test', 'deck-1', 's1', 'Bad', 'window', 'small', '{}')`,
      ),
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO branching_edge (id, tenant_id, deck_id, from_slide_id, to_slide_id, name)
         VALUES ('01H000000000000000000000QB2', 'org-test', 'deck-1', 's1', 's2', 'Duplicate')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0026 → 0025 cleanly', async () => {
    for (const m of [...P10_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P10_TABLES) expect(tables).not.toContain(t);
  });
});

const P10_M5_MIGRATIONS = ['0031_phase10_telemetry'];
const P10_M5_TABLES = ['prototype_sessions', 'prototype_events', 'integrity_chain'];

describe.skipIf(!hasDocker())('P10-M5 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10m5-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0031 cleanly', async () => {
    for (const m of P10_M5_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P10_M5_TABLES) expect(tables).toContain(t);
  });

  it('creates the P10-M5 columns and indexes', async () => {
    const { rows: cols } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [P10_M5_TABLES],
    );
    const cols2 = new Set(cols.map((r) => `${r.table_name}.${r.column_name}`));
    for (const c of [
      'prototype_sessions.consent',
      'prototype_sessions.region_pinned',
      'prototype_sessions.kid',
      'prototype_sessions.expires_at',
      'prototype_events.seq',
      'prototype_events.prev_hash',
      'prototype_events.event_hash',
      'prototype_events.payload',
      'prototype_events.kid',
      'prototype_events.client_fingerprint',
      'integrity_chain.kid',
      'integrity_chain.key_hex',
      'integrity_chain.overlap_until',
      'integrity_chain.expires_at',
    ])
      expect(cols2.has(c)).toBe(true);

    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = new Set(idx.map((r) => r.indexname));
    for (const i of [
      'prototype_events_session_seq_idx',
      'prototype_events_tenant_created_idx',
      'prototype_events_deck_type_idx',
      'prototype_sessions_expires_idx',
      'integrity_chain_active_idx',
    ])
      expect(indexes.has(i)).toBe(true);
  });

  it('enforces RLS policies on all P10-M5 tables', async () => {
    const { rows } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public'`,
    );
    const policies = new Set(rows.map((r) => r.policyname));
    for (const t of P10_M5_TABLES) {
      expect(policies.has(`${t}_tenant_isolation`)).toBe(true);
    }
  });

  it('inserts a full chain (session → event → key)', async () => {
    await client.query(
      `INSERT INTO integrity_chain (id, tenant_id, deck_id, kid, key_hex, expires_at, overlap_until)
       VALUES ('01H000000000000000000I001', 'org-test', 'deck-1', 'kid-1',
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               now() + interval '90 days', now() + interval '7 days')`,
    );
    await client.query(
      `INSERT INTO prototype_sessions (id, tenant_id, deck_id, session_token, consent, region, kid, expires_at)
       VALUES ('01H000000000000000000S001', 'org-test', 'deck-1', 'tok-1', 'opt_in', 'us-east',
               'kid-1', now() + interval '30 days')`,
    );
    await client.query(
      `INSERT INTO prototype_events (id, tenant_id, deck_id, session_id, seq, event_type, payload,
                                     prev_hash, event_hash, kid, client_fingerprint, region)
       VALUES ('01H000000000000000000E001', 'org-test', 'deck-1', '01H000000000000000000S001',
               1, 'slide_enter', '{"slide":"s1"}'::jsonb,
               '0000000000000000000000000000000000000000000000000000000000000000',
               '1111111111111111111111111111111111111111111111111111111111111111',
               'kid-1', 'fp-1', 'us-east')`,
    );
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM prototype_events WHERE tenant_id = 'org-test'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
  });

  it('rejects malformed consent tier and duplicate session seq', async () => {
    await expect(
      client.query(
        `INSERT INTO prototype_sessions (id, tenant_id, deck_id, session_token, consent, region, kid, expires_at)
         VALUES ('01H000000000000000000SX01', 'org-test', 'deck-1', 'tok-x', 'yes',
                 'us-east', 'kid-1', now() + interval '30 days')`,
      ),
    ).rejects.toThrow();
    await expect(
      client.query(
        `INSERT INTO prototype_events (id, tenant_id, deck_id, session_id, seq, event_type, payload,
                                       prev_hash, event_hash, kid, client_fingerprint, region)
         VALUES ('01H000000000000000000EX01', 'org-test', 'deck-1', '01H000000000000000000S001',
                 1, 'click', '{}'::jsonb, 'p', 'h', 'kid-1', 'fp', 'us-east')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0031 cleanly', async () => {
    for (const m of [...P10_M5_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P10_M5_TABLES) expect(tables).not.toContain(t);
  });
});

/* ─── P10-M3 — Component state machines ───────────────────────────
 *
 * Migration 0027 is purely additive over the `interaction_state`
 * table that 0025 already created: it adds
 *   - interaction_state.persist_instance_state (boolean, default false)
 *   - interaction_state_instance_idx (btree on tenant/deck/instance)
 *   - interaction_state_persist_idx (partial btree for the persist=true slice)
 *
 * The harness inherits 0025 + 0026 so the base table is present
 * before 0027 runs.
 */
const P10_M3_MIGRATIONS = [
  '0025_phase10_prototyping',
  '0026_phase10_prototyping_indexes_seed',
  '0027_phase10_state_machines',
];

describe.skipIf(!hasDocker())('P10-M3 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10m3-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0025 → 0027 cleanly and exposes interaction_state', async () => {
    for (const m of P10_M3_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    expect(tables).toContain('interaction_state');
  });

  it('adds persist_instance_state with the expected default', async () => {
    const { rows: cols } = await client.query<{
      column_name: string;
      data_type: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'interaction_state'`,
    );
    const persist = cols.find((c) => c.column_name === 'persist_instance_state');
    expect(persist?.data_type).toBe('boolean');
    // pg_catalog returns the default with type-cast wrapping for booleans.
    expect(persist?.column_default ?? '').toMatch(/false/);
  });

  it('creates the M3 lookup indexes', async () => {
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = new Set(idx.map((r) => r.indexname));
    expect(indexes.has('interaction_state_instance_idx')).toBe(true);
    expect(indexes.has('interaction_state_persist_idx')).toBe(true);
  });

  it('round-trips a persisted state machine row', async () => {
    await client.query(
      `INSERT INTO interaction_state
         (id, tenant_id, deck_id, instance_id, state_machine, current_state, scope, persist_instance_state)
       VALUES
         ('01H000000000000000000M301', 'org-test', 'deck-1', 'inst-d1-1',
          '{"states":{"idle":{},"active":{}},"initial":"idle",
            "transitions":[{"from":"idle","to":"active","event":"click"}]}'::jsonb,
          'idle', 'slide', true)`,
    );
    const { rows } = await client.query<{
      current_state: string;
      persist_instance_state: boolean;
      state_machine: unknown;
    }>(
      `SELECT current_state, persist_instance_state, state_machine
         FROM interaction_state WHERE id = '01H000000000000000000M301'`,
    );
    expect(rows[0]?.current_state).toBe('idle');
    expect(rows[0]?.persist_instance_state).toBe(true);
    expect(rows[0]?.state_machine).toBeTruthy();
  });

  it('rejects rows with an unknown scope', async () => {
    await expect(
      client.query(
        `INSERT INTO interaction_state
           (id, tenant_id, deck_id, instance_id, state_machine, current_state, scope)
         VALUES
           ('01H000000000000000000M3X1', 'org-test', 'deck-1', 'inst-d1-x',
            '{}'::jsonb, 'idle', 'tenant')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0027 cleanly', async () => {
    // Roll back 0027 alone; the base 0025/0026 must remain so the
    // base schema harness isn't disturbed.
    await client.query(readSql('0027_phase10_state_machines', 'down'));
    const { rows: cols } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'interaction_state'`,
    );
    const columnNames = new Set(cols.map((c) => c.column_name));
    expect(columnNames.has('persist_instance_state')).toBe(false);
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
         AND tablename = 'interaction_state'`,
    );
    const indexNames = new Set(idx.map((r) => r.indexname));
    expect(indexNames.has('interaction_state_instance_idx')).toBe(false);
    expect(indexNames.has('interaction_state_persist_idx')).toBe(false);
  });
});

/* ─── P10-M7 — Deep-link state codec ───────────────────────────────
 *
 * 0034_phase10_deep_links is a clean add: it introduces the
 * `deep_links` table for short-link records, plus the
 * `deep_links_deck_idx` and `deep_links_tenant_expiry_idx` lookup
 * indexes, and enables tenant-isolation RLS. The migration also
 * seeds a demo row under the `system` tenant so the harness can
 * resolve something concrete after applying.
 */
const P10_M7_MIGRATIONS = ['0034_phase10_deep_links'];

describe.skipIf(!hasDocker())('P10-M7 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10m7-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0034 cleanly and exposes deep_links', async () => {
    for (const m of P10_M7_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    expect(tables).toContain('deep_links');
  });

  it('creates the deep_links columns with the expected types', async () => {
    const { rows } = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'deep_links'`,
    );
    const columns = new Map(rows.map((r) => [r.column_name, r.data_type]));
    for (const c of [
      'id',
      'tenant_id',
      'deck_id',
      'kid',
      'payload',
      'click_count',
      'expires_at',
      'viewer_scope',
      'single_use',
      'created_at',
      'created_by',
    ]) {
      expect(columns.has(c), `column ${c} should exist`).toBe(true);
    }
    expect(columns.get('payload')).toBe('jsonb');
    expect(columns.get('click_count')).toBe('integer');
    expect(columns.get('expires_at')).toBe('timestamp with time zone');
    expect(columns.get('created_at')).toBe('timestamp with time zone');
    expect(columns.get('single_use')).toBe('boolean');
  });

  it('creates the deep_links lookup indexes', async () => {
    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
         AND tablename = 'deep_links'`,
    );
    const indexes = new Set(rows.map((r) => r.indexname));
    expect(indexes.has('deep_links_deck_idx')).toBe(true);
    expect(indexes.has('deep_links_tenant_expiry_idx')).toBe(true);
  });

  it('enforces the viewer_scope CHECK constraint', async () => {
    await expect(
      client.query(
        `INSERT INTO deep_links
           (id, tenant_id, deck_id, kid, payload, expires_at, viewer_scope)
         VALUES
           ('dlk_bad_scope01', 'org-test', 'deck-1', 'kid-x',
            '{}'::jsonb, now() + interval '1 day', 'random')`,
      ),
    ).rejects.toThrow();
  });

  it('enables tenant-isolation RLS on deep_links', async () => {
    const { rows } = await client.query<{ relname: string; rowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS rowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'deep_links'`,
    );
    expect(rows[0]?.rowsecurity).toBe(true);
    const { rows: policies } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'deep_links'`,
    );
    const policyNames = policies.map((p) => p.policyname);
    expect(policyNames).toContain('deep_links_tenant_isolation');
  });

  it('round-trips an inserted deep_links row', async () => {
    await client.query(
      `INSERT INTO deep_links
         (id, tenant_id, deck_id, kid, payload, expires_at, viewer_scope, single_use, created_by)
       VALUES
         ('dlk_round_trip01', 'org-test', 'deck-1', 'kid-rt',
          jsonb_build_object('v', 1, 'exp', 4102444800000, 'deck_id', 'deck-1',
                             'slide_id', 's-1', 'aud', 'viewer', 'sig', 'x'),
          now() + interval '30 days', 'tenant', true, 'user-1')`,
    );
    const { rows } = await client.query<{
      click_count: number;
      viewer_scope: string;
      single_use: boolean;
    }>(
      `SELECT click_count, viewer_scope, single_use FROM deep_links WHERE id = 'dlk_round_trip01'`,
    );
    expect(rows[0]?.click_count).toBe(0);
    expect(rows[0]?.viewer_scope).toBe('tenant');
    expect(rows[0]?.single_use).toBe(true);
  });

  it('rolls back 0034 cleanly', async () => {
    await client.query(readSql('0034_phase10_deep_links', 'down'));
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    expect(tables).not.toContain('deep_links');
  });
});

/* ─── P10-M6.1 — Quizzes + LLM review queue ──────────────────────────
 *
 * 0032_phase10_quizzes is a clean add: it introduces the `quiz`,
 * `quiz_attempt`, `quiz_answer`, `quiz_result`, and `llm_review_queue`
 * tables, the related lookup indexes, and enables tenant-isolation
 * RLS on each. The harness installs the base 0025 + 0026 migrations
 * first so the tenant_id conventions are established.
 */
const P10_M6_1_MIGRATIONS = [
  '0025_phase10_prototyping',
  '0026_phase10_prototyping_indexes_seed',
  '0032_phase10_quizzes',
];

describe.skipIf(!hasDocker())('P10-M6.1 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10m6-1-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0025 + 0026 + 0032 cleanly and exposes all M6.1 tables', async () => {
    for (const m of P10_M6_1_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    for (const t of ['quiz', 'quiz_attempt', 'quiz_answer', 'quiz_result', 'llm_review_queue']) {
      expect(tables.has(t)).toBe(true);
    }
  });

  it('creates the M6.1 lookup indexes', async () => {
    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = new Set(idx.map((r) => r.indexname));
    expect(indexes.has('quiz_deck_idx')).toBe(true);
    expect(indexes.has('quiz_attempt_quiz_idx')).toBe(true);
    expect(indexes.has('quiz_attempt_viewer_idx')).toBe(true);
    expect(indexes.has('quiz_answer_attempt_idx')).toBe(true);
    expect(indexes.has('llm_review_queue_status_idx')).toBe(true);
  });

  it('enables tenant-isolation RLS on every M6.1 table', async () => {
    for (const t of ['quiz', 'quiz_attempt', 'quiz_answer', 'quiz_result', 'llm_review_queue']) {
      const { rows } = await client.query<{ rowsecurity: boolean }>(
        `SELECT c.relrowsecurity AS rowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = $1`,
        [t],
      );
      expect(rows[0]?.rowsecurity).toBe(true);
      const { rows: policies } = await client.query<{ policyname: string }>(
        `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
        [t],
      );
      const names = policies.map((p) => p.policyname);
      expect(names).toContain(`${t}_tenant_isolation`);
    }
  });

  it('round-trips a quiz row + an attempt + an answer + a result', async () => {
    await client.query(
      `INSERT INTO quiz (id, tenant_id, deck_id, name, questions, pass_threshold)
       VALUES ('qz000000000000000000M6Q1Z', 'org-test', 'deck-1', 'Q', '[{"id":"q1","type":"true_false","prompt":"?","correct":true}]'::jsonb, 0.7)`,
    );
    await client.query(
      `INSERT INTO quiz_attempt (id, tenant_id, deck_id, quiz_id, seed, viewer_id, status)
       VALUES ('qa000000000000000000M6Q1A', 'org-test', 'deck-1', 'qz000000000000000000M6Q1Z', 'seed-x', 'v-1', 'in_progress')`,
    );
    await client.query(
      `INSERT INTO quiz_answer (id, tenant_id, attempt_id, question_id, value, correct, score)
       VALUES ('qn000000000000000000M6Q1N', 'org-test', 'qa000000000000000000M6Q1A', 'q1', 'true'::jsonb, true, 1)`,
    );
    await client.query(
      `INSERT INTO quiz_result (id, tenant_id, attempt_id, quiz_id, total_score, max_score, percentage, passed, answers)
       VALUES ('qr000000000000000000M6Q1R', 'org-test', 'qa000000000000000000M6Q1A', 'qz000000000000000000M6Q1Z', 1, 1, 1, true, '[]'::jsonb)`,
    );
    const { rows } = await client.query<{ passed: boolean; total_score: string }>(
      `SELECT passed, total_score FROM quiz_result WHERE id = 'qr000000000000000000M6Q1R'`,
    );
    expect(rows[0]?.passed).toBe(true);
    expect(Number(rows[0]?.total_score)).toBe(1);
  });

  it('rejects rows with an unknown status', async () => {
    await expect(
      client.query(
        `INSERT INTO quiz_attempt (id, tenant_id, deck_id, quiz_id, seed, viewer_id, status)
         VALUES ('qa000000000000000000M6BAD', 'org-test', 'deck-1', 'qz000000000000000000M6Q1Z', 'seed', 'v-2', 'WUT')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0032 cleanly', async () => {
    await client.query(readSql('0032_phase10_quizzes', 'down'));
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    for (const t of ['quiz', 'quiz_attempt', 'quiz_answer', 'quiz_result', 'llm_review_queue']) {
      expect(tables.has(t)).toBe(false);
    }
  });
});

/* ─── P10-M6.2 — Presentation sequences ──────────────────────────────
 *
 * 0033_phase10_sequences introduces the `presentation_sequence` table
 * with the interruption-policy enum + a deck lookup index + RLS.
 */
const P10_M6_2_MIGRATIONS = [
  '0025_phase10_prototyping',
  '0026_phase10_prototyping_indexes_seed',
  '0033_phase10_sequences',
];

describe.skipIf(!hasDocker())('P10-M6.2 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p10m6-2-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0025 + 0026 + 0033 cleanly and exposes presentation_sequence', async () => {
    for (const m of P10_M6_2_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    expect(tables.has('presentation_sequence')).toBe(true);
  });

  it('enables tenant-isolation RLS on presentation_sequence', async () => {
    const { rows } = await client.query<{ rowsecurity: boolean }>(
      `SELECT c.relrowsecurity AS rowsecurity FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'presentation_sequence'`,
    );
    expect(rows[0]?.rowsecurity).toBe(true);
    const { rows: policies } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'presentation_sequence'`,
    );
    const names = policies.map((p) => p.policyname);
    expect(names).toContain('presentation_sequence_tenant_isolation');
  });

  it('round-trips a presentation_sequence row', async () => {
    await client.query(
      `INSERT INTO presentation_sequence
         (id, tenant_id, deck_id, name, slides, interval_ms, interruption_policy)
       VALUES
         ('ps000000000000000000M6Q2P', 'org-test', 'deck-1', 'Seq',
          ARRAY['s1','s2','s3']::text[], 1000, 'queue')`,
    );
    const { rows } = await client.query<{ slides: string[]; interruption_policy: string }>(
      `SELECT slides, interruption_policy FROM presentation_sequence WHERE id = 'ps000000000000000000M6Q2P'`,
    );
    // pg's default array parser returns text[] as a JS array.
    expect(rows[0]?.slides?.length).toBe(3);
    expect(rows[0]?.interruption_policy).toBe('queue');
  });

  it('rejects rows with an unknown interruption_policy', async () => {
    await expect(
      client.query(
        `INSERT INTO presentation_sequence
           (id, tenant_id, deck_id, name, slides, interval_ms, interruption_policy)
         VALUES
           ('ps000000000000000000M6BAD', 'org-test', 'deck-1', 'Bad',
            ARRAY['s1']::text[], 1000, 'panic')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0033 cleanly', async () => {
    await client.query(readSql('0033_phase10_sequences', 'down'));
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = new Set(rows.map((r) => r.table_name));
    expect(tables.has('presentation_sequence')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P11 migrations — 3D, Motion & Rich Media.
// ---------------------------------------------------------------------------
const P11_MIGRATIONS = [
  '0035_phase11_3d_assets',
  '0036_phase11_media_assets',
  '0037_phase11_embed_maps_jobs',
  '0038_phase11_3d_indexes_seed',
];
const P11_TABLES = [
  'license',
  'model_asset',
  'scene',
  'camera_keyframe',
  'shader',
  'video_asset',
  'audio_track',
  'lottie_asset',
  'ar_session',
  'code_sandbox_policy',
  'embed_policy',
  'latex_doc',
  'map_style',
  'cad_jobs',
  'video_jobs',
];

describe.skipIf(!hasDocker())('P11 migrations apply + rollback', () => {
  let containerName = '';
  let client = new pg.Client({ user: 'postgres', password: 'test', database: 'domio' });
  let host = '127.0.0.1';
  let port = 0;

  beforeAll(async () => {
    const name = `domio-p11-mig-${process.pid}-${Date.now()}`;
    containerName = name;
    spawn(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=test',
        '-e',
        'POSTGRES_DB=domio',
        '-p',
        '0:5432',
        'postgres:16-alpine',
      ],
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
      /* ignore */
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });

  it('applies 0035–0038 cleanly', async () => {
    for (const m of P11_MIGRATIONS) {
      await client.query(readSql(m, 'up'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P11_TABLES) {
      expect(tables).toContain(t);
    }
  });

  it('creates the P11 columns and indexes', async () => {
    const { rows: cols } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'model_asset' AND column_name IN ('tenant_id', 'format', 'source_url', 'derived_url', 'poly_count', 'license_id'))
         OR (table_name = 'scene' AND column_name IN ('tenant_id', 'model_asset_id', 'environment'))
         OR (table_name = 'camera_keyframe' AND column_name IN ('tenant_id', 'slide_id', 'scene_id', 'order_index', 'fov'))
         OR (table_name = 'shader' AND column_name IN ('tenant_id', 'kind', 'source_wgsl', 'source_glsl'))
         OR (table_name = 'license' AND column_name IN ('tenant_id', 'name', 'source', 'terms_url'))
         OR (table_name = 'video_asset' AND column_name IN ('tenant_id', 'transcode_state', 'hls_url', 'duration_ms'))
         OR (table_name = 'audio_track' AND column_name IN ('tenant_id', 'slide_id', 'kind', 'volume'))
         OR (table_name = 'lottie_asset' AND column_name IN ('tenant_id', 'format', 'state_machine'))
         OR (table_name = 'ar_session' AND column_name IN ('tenant_id', 'slide_id', 'model_asset_id', 'token', 'expires_at'))
         OR (table_name = 'code_sandbox_policy' AND column_name IN ('tenant_id', 'max_cpu_ms', 'max_memory_mb'))
         OR (table_name = 'embed_policy' AND column_name IN ('tenant_id', 'sandbox_flags', 'jwt_required'))
         OR (table_name = 'latex_doc' AND column_name IN ('tenant_id', 'cache_key', 'rendered_html'))
         OR (table_name = 'map_style' AND column_name IN ('tenant_id', 'provider', 'style_url'))
         OR (table_name = 'cad_jobs' AND column_name IN ('tenant_id', 'model_asset_id', 'progress'))
         OR (table_name = 'video_jobs' AND column_name IN ('tenant_id', 'video_asset_id', 'status'))
       )`,
    );
    const colSet = new Set(cols.map((r) => `${r.table_name}.${r.column_name}`));
    // Spot-check key columns across all 15 tables
    for (const c of [
      'model_asset.tenant_id',
      'model_asset.format',
      'scene.model_asset_id',
      'camera_keyframe.slide_id',
      'camera_keyframe.order_index',
      'shader.tenant_id',
      'shader.kind',
      'license.source',
      'video_asset.tenant_id',
      'video_asset.transcode_state',
      'audio_track.slide_id',
      'lottie_asset.format',
      'ar_session.token',
      'ar_session.expires_at',
      'code_sandbox_policy.tenant_id',
      'embed_policy.sandbox_flags',
      'latex_doc.cache_key',
      'map_style.provider',
      'cad_jobs.progress',
      'video_jobs.status',
    ]) {
      expect(colSet.has(c)).toBe(true);
    }

    const { rows: idx } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexes = idx.map((r) => r.indexname);
    for (const i of [
      'model_asset_tenant_idx',
      'model_asset_format_idx',
      'scene_model_asset_idx',
      'camera_keyframe_slide_order_idx',
      'shader_tenant_kind_idx',
      'video_asset_tenant_idx',
      'video_asset_transcode_idx',
      'audio_track_slide_idx',
      'lottie_asset_tenant_format_idx',
      'ar_session_expires_idx',
      'code_sandbox_policy_tenant_idx',
      'latex_doc_cache_key_idx',
      'map_style_tenant_idx',
    ]) {
      expect(indexes).toContain(i);
    }
  });

  it('enforces RLS policies on all P11 tables', async () => {
    const { rows } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public'`,
    );
    const policies = new Set(rows.map((r) => r.policyname));
    for (const t of P11_TABLES) {
      expect(policies.has(`${t}_tenant_isolation`)).toBe(true);
    }
  });

  it('seeds 3 default licenses and 3 shader presets', async () => {
    const { rows: licenses } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM license WHERE tenant_id = 'system'`,
    );
    expect(Number(licenses[0]?.count ?? '0')).toBe(3);
    const { rows: shaders } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM shader WHERE tenant_id = 'system'`,
    );
    expect(Number(shaders[0]?.count ?? '0')).toBe(3);
  });

  it('enforces the P11 insert chain across all 15 tables', async () => {
    // license (already seeded, but insert a tenant-scoped one)
    await client.query(
      `INSERT INTO license (id, tenant_id, name, source) VALUES
         ('p11lic00000000000000001', 'tenant-p11', 'Test License', 'user-upload')`,
    );
    // model_asset
    await client.query(
      `INSERT INTO model_asset (id, tenant_id, uploader_id, name, format, source_url, derived_url, poly_count, texture_count, license_id) VALUES
         ('p11mod00000000000000001', 'tenant-p11', 'user-1', 'Test Model', 'glb', 'https://cdn.example.com/m.glb', 'https://cdn.example.com/m-derived.glb', 15000, 3, 'p11lic00000000000000001')`,
    );
    // scene
    await client.query(
      `INSERT INTO scene (id, tenant_id, model_asset_id) VALUES
         ('p11sce00000000000000001', 'tenant-p11', 'p11mod00000000000000001')`,
    );
    // camera_keyframe
    await client.query(
      `INSERT INTO camera_keyframe (id, tenant_id, slide_id, scene_id, order_index, position, target, fov, easing, duration_ms) VALUES
         ('p11cam00000000000000001', 'tenant-p11', 'slide-1', 'p11sce00000000000000001', 1,
          '{"x":0,"y":1.5,"z":5}'::jsonb, '{"x":0,"y":0,"z":0}'::jsonb, 50.0,
          '{"type":"cubic-bezier","x1":0.42,"y1":0,"x2":0.58,"y2":1}'::jsonb, 800)`,
    );
    // shader
    await client.query(
      `INSERT INTO shader (id, tenant_id, workspace_id, author_id, name, kind, source_wgsl, source_glsl) VALUES
         ('p11sha00000000000000001', 'tenant-p11', 'ws-1', 'user-1', 'Test Shader', 'background', '@fragment fn f() -> vec4f { return vec4f(1.0); }', 'void main() {}')`,
    );
    // video_asset
    await client.query(
      `INSERT INTO video_asset (id, tenant_id, uploader_id, name, source_url, duration_ms, width, height, has_audio, license_id) VALUES
         ('p11vid00000000000000001', 'tenant-p11', 'user-1', 'Test Video', 'https://cdn.example.com/v.mp4', 30000, 1920, 1080, true, 'p11lic00000000000000001')`,
    );
    // audio_track
    await client.query(
      `INSERT INTO audio_track (id, tenant_id, slide_id, workspace_id, uploader_id, kind, source_url, duration_ms) VALUES
         ('p11aud00000000000000001', 'tenant-p11', 'slide-1', 'ws-1', 'user-1', 'voiceover', 'https://cdn.example.com/a.mp3', 15000)`,
    );
    // lottie_asset
    await client.query(
      `INSERT INTO lottie_asset (id, tenant_id, workspace_id, uploader_id, name, format, source_url, width, height) VALUES
         ('p11lot00000000000000001', 'tenant-p11', 'ws-1', 'user-1', 'Test Lottie', 'lottie', 'https://cdn.example.com/l.json', 200, 200)`,
    );
    // ar_session
    await client.query(
      `INSERT INTO ar_session (id, tenant_id, slide_id, model_asset_id, token, expires_at) VALUES
         ('p11ars00000000000000001', 'tenant-p11', 'slide-1', 'p11mod00000000000000001',
          'ar-token-abc123', now() + interval '30 minutes')`,
    );
    // code_sandbox_policy
    await client.query(
      `INSERT INTO code_sandbox_policy (id, tenant_id, workspace_id, name) VALUES
         ('p11csp00000000000000001', 'tenant-p11', 'ws-1', 'Default Sandbox')`,
    );
    // embed_policy
    await client.query(
      `INSERT INTO embed_policy (id, tenant_id, workspace_id, name) VALUES
         ('p11emb00000000000000001', 'tenant-p11', 'ws-1', 'Default Embed')`,
    );
    // latex_doc
    await client.query(
      `INSERT INTO latex_doc (id, tenant_id, workspace_id, source, rendered_html, theme_hash, cache_key) VALUES
         ('p11tex00000000000000001', 'tenant-p11', 'ws-1', E'\\\\frac{1}{2}', '<span>1/2</span>', 'h1', 'cache-abc-123')`,
    );
    // map_style
    await client.query(
      `INSERT INTO map_style (id, tenant_id, workspace_id, name, provider, style_url) VALUES
         ('p11map00000000000000001', 'tenant-p11', 'ws-1', 'Test Map', 'mapbox', 'https://api.mapbox.com/styles/v1/test')`,
    );
    // cad_jobs
    await client.query(
      `INSERT INTO cad_jobs (id, tenant_id, model_asset_id, progress) VALUES
         ('p11cad00000000000000001', 'tenant-p11', 'p11mod00000000000000001', 'parsing')`,
    );
    // video_jobs
    await client.query(
      `INSERT INTO video_jobs (id, tenant_id, video_asset_id, status) VALUES
         ('p11vjb00000000000000001', 'tenant-p11', 'p11vid00000000000000001', 'queued')`,
    );
    // Verify all rows inserted
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM model_asset WHERE tenant_id = 'tenant-p11'`,
    );
    expect(Number(rows[0]?.count ?? '0')).toBe(1);
    const { rows: r2 } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ar_session WHERE tenant_id = 'tenant-p11'`,
    );
    expect(Number(r2[0]?.count ?? '0')).toBe(1);
    const { rows: r3 } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM video_jobs WHERE tenant_id = 'tenant-p11'`,
    );
    expect(Number(r3[0]?.count ?? '0')).toBe(1);
  });

  it('rejects an invalid model_asset format', async () => {
    await expect(
      client.query(
        `INSERT INTO model_asset (id, tenant_id, uploader_id, name, format, source_url, derived_url, poly_count, texture_count) VALUES
           ('p11bad00000000000000001', 'tenant-p11', 'user-1', 'Bad', 'bmp', 'http://x', 'http://x', 0, 0)`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back 0038 → 0035 cleanly', async () => {
    for (const m of [...P11_MIGRATIONS].reverse()) {
      await client.query(readSql(m, 'down'));
    }
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const t of P11_TABLES) {
      expect(tables).not.toContain(t);
    }
  });
});
