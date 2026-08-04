-- Migration 0022: Phase 08 — live-data indexes + seed data.
--
-- Extra indexes beyond the per-table ones in 0021, plus the built-in
-- freshness policies and 24 threshold-rule templates referenced by the
-- phase doc. Idempotent; safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- dataset_snapshot already has (query_id, created_at DESC) from 0021;
-- add a scenario-serving index for O(1) scenario snapshot lookups.
CREATE INDEX IF NOT EXISTS dataset_snapshot_scenario_idx
    ON dataset_snapshot (scenario_id);

-- freshness: per-binding latest-first is covered; add tenant + status for
-- the freshness panel rollups.
CREATE INDEX IF NOT EXISTS freshness_record_tenant_status_idx
    ON freshness_record (tenant_id, status, recorded_at DESC);

-- scenario DAG lookups (parent chains for overlay inheritance).
CREATE INDEX IF NOT EXISTS scenario_parent_idx
    ON scenario (parent_id);

-- threshold rules per widget.
CREATE INDEX IF NOT EXISTS threshold_rule_widget_measure_idx
    ON threshold_rule (chart_widget_id, measure);

-- ---------------------------------------------------------------------------
-- Seed: built-in query freshness policies (feature #51).
-- Stored as a reference table so the refresh scheduler can resolve policy
-- names without hard-coding.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freshness_policy (
    policy_id        text PRIMARY KEY,
    label            text NOT NULL,
    type             text NOT NULL
                     CHECK (type IN ('eager', 'lazy', 'manual', 'on_interval')),
    default_interval_seconds integer,
    description      text NOT NULL DEFAULT ''
);

INSERT INTO freshness_policy (policy_id, label, type, default_interval_seconds, description)
VALUES
    ('eager',       'Always refresh on stage open', 'eager',        NULL, 'Refresh completes within 4s of stage-open (p95).'),
    ('lazy',        'Refresh on first view',        'lazy',         NULL, 'Refresh completes within 250ms of first view.'),
    ('manual',      'Never auto-refresh',           'manual',       NULL, 'Refresh only via the toolbar / manual trigger.'),
    ('on_interval', 'Refresh every N seconds',      'on_interval',  300,  'Refresh drift <= 1s from the scheduled time.')
ON CONFLICT (policy_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: threshold-rule templates (feature #60). 24 templates across the
-- common measures; authors copy a template into a threshold_rule.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS threshold_rule_template (
    template_id   text PRIMARY KEY,
    label         text NOT NULL,
    measure       text NOT NULL,
    comparator    text NOT NULL
                  CHECK (comparator IN ('lt', 'lte', 'gt', 'gte', 'eq', 'between', 'outside')),
    values        jsonb NOT NULL,
    severity      text NOT NULL
                  CHECK (severity IN ('info', 'warn', 'critical')),
    style_override jsonb NOT NULL,
    description   text NOT NULL DEFAULT ''
);

INSERT INTO threshold_rule_template
    (template_id, label, measure, comparator, values, severity, style_override, description)
VALUES
    -- Revenue
    ('rev_below_1m',      'Revenue below $1M',      'revenue', 'lt',      '[1000000]', 'critical',
     '{"fill": "#EF4444", "textColor": "#FFFFFF"}', 'Revenue dropped below $1M — red callout.'),
    ('rev_below_2m',      'Revenue below $2M',      'revenue', 'lt',      '[2000000]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Revenue below $2M — amber callout.'),
    ('rev_above_5m',      'Revenue above $5M',      'revenue', 'gt',      '[5000000]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Revenue above $5M — green callout.'),
    ('rev_between_1_3m',  'Revenue $1M-$3M band',   'revenue', 'between', '[1000000, 3000000]', 'info',
     '{"fill": "#3B82F6", "textColor": "#FFFFFF"}', 'Revenue inside the $1M-$3M band.'),
    -- Churn
    ('churn_gt_8',        'Churn above 8%',         'churn', 'gt',       '[0.08]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Churn above 8% — amber callout.'),
    ('churn_gt_12',       'Churn above 12%',        'churn', 'gt',       '[0.12]', 'critical',
     '{"fill": "#EF4444", "textColor": "#FFFFFF"}', 'Churn above 12% — red callout.'),
    ('churn_lt_4',        'Churn below 4%',         'churn', 'lt',       '[0.04]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Churn below 4% — healthy.'),
    -- GMV / sales
    ('gmv_lt_500k',       'GMV below $500K',        'gmv', 'lt',         '[500000]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'GMV below $500K.'),
    ('gmv_gt_2m',         'GMV above $2M',          'gmv', 'gt',         '[2000000]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'GMV above $2M.'),
    -- Users / signups
    ('signups_lt_100',    'Signups below 100',      'signups', 'lt',     '[100]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Daily signups below 100.'),
    ('users_gt_1m',       'Users above 1M',         'users', 'gt',       '[1000000]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Active users above 1M.'),
    -- Costs / burn
    ('burn_gt_100k',      'Burn above $100K',       'burn', 'gt',        '[100000]', 'critical',
     '{"fill": "#EF4444", "textColor": "#FFFFFF"}', 'Monthly burn above $100K.'),
    ('cac_gt_50',         'CAC above $50',          'cac', 'gt',         '[50]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Customer acquisition cost above $50.'),
    -- Growth / targets
    ('growth_lt_5pct',    'Growth below 5%',        'growth_rate', 'lt', '[0.05]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Growth rate below 5%.'),
    ('growth_gt_20pct',   'Growth above 20%',       'growth_rate', 'gt', '[0.20]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Growth rate above 20%.'),
    -- Quality
    ('nps_lt_30',         'NPS below 30',           'nps', 'lt',         '[30]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Net promoter score below 30.'),
    ('nps_gt_50',         'NPS above 50',           'nps', 'gt',         '[50]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Net promoter score above 50.'),
    ('csat_lt_80',        'CSAT below 80%',         'csat', 'lt',        '[0.80]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'CSAT below 80%.'),
    ('uptime_lt_99_9',    'Uptime below 99.9%',     'uptime', 'lt',      '[0.999]', 'critical',
     '{"fill": "#EF4444", "textColor": "#FFFFFF"}', 'Uptime below 99.9%.'),
    ('error_rate_gt_1',   'Error rate above 1%',    'error_rate', 'gt',  '[0.01]', 'critical',
     '{"fill": "#EF4444", "textColor": "#FFFFFF"}', 'Error rate above 1%.'),
    -- Capacity / efficiency
    ('margin_lt_20pct',   'Margin below 20%',       'margin', 'lt',      '[0.20]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Gross margin below 20%.'),
    ('margin_gt_40pct',   'Margin above 40%',       'margin', 'gt',      '[0.40]', 'info',
     '{"fill": "#10B981", "textColor": "#FFFFFF"}', 'Gross margin above 40%.'),
    ('inventory_lt_90',   'Inventory below 90 days','inventory_days', 'lt', '[90]', 'warn',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Inventory coverage below 90 days.'),
    ('headcount_gt_plan', 'Headcount above plan',   'headcount', 'gt',   '[0]', 'info',
     '{"fill": "#F59E0B", "textColor": "#1F2937"}', 'Headcount above plan (configure value).')
ON CONFLICT (template_id) DO NOTHING;

COMMIT;