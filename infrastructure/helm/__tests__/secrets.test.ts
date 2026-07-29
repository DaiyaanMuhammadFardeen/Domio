import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRETS_CHART = join(HERE, '..', 'secrets');

/** Smallest-possible YAML subset that's enough for our chart files. */
function parseTopLevel(raw: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m) out.push({ key: m[1]!, value: (m[2] ?? '').trim() });
  }
  return out;
}

describe('secrets helm chart', () => {
  it('has a Chart.yaml with required fields', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'Chart.yaml'), 'utf8');
    const top = parseTopLevel(raw);
    const byKey = Object.fromEntries(top.map((t) => [t.key, t.value]));
    expect(byKey['apiVersion']).toBe('v2');
    expect(byKey['name']).toBe('secrets');
    expect(byKey['type']).toBe('application');
    expect(byKey['version']).toBeTruthy();
  });

  it('values.yaml declares required top-level keys', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'values.yaml'), 'utf8');
    expect(raw).toContain('vault:');
    expect(raw).toContain('secrets:');
    expect(raw).toContain('oncall:');
    expect(raw).toContain('refreshInterval:');
    expect(raw).toContain('image:');
    expect(raw).toContain('securityContext:');
    expect(raw).toContain('runAsNonRoot: true');
    expect(raw).toContain('readOnlyRootFilesystem: true');
  });

  it('values.yaml pins an image tag (not :latest)', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'values.yaml'), 'utf8');
    const m = raw.match(/tag:\s*"?([^"\s]+)"?/);
    expect(m, 'image tag must be present').toBeTruthy();
    expect(m![1]).not.toMatch(/latest/i);
  });

  it('declares ExternalSecret for every workload component', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'values.yaml'), 'utf8');
    for (const component of ['api-gateway', 'realtime-gateway', 'editor', 'postgres']) {
      expect(raw, `values.yaml must mention ${component}`).toContain(component);
    }
  });

  it('values.schema.json validates well-formed values', () => {
    const schema = JSON.parse(readFileSync(join(SECRETS_CHART, 'values.schema.json'), 'utf8'));
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['vault', 'secrets', 'oncall', 'refreshInterval']);
    expect(schema.properties.vault.required).toContain('address');
    expect(schema.properties.vault.required).toContain('authMethod');
    expect(schema.properties.vault.required).toContain('role');
    expect(schema.properties.oncall.required).toContain('enabled');
  });

  it('emits a SecretStore and at least one ExternalSecret template', () => {
    const tplDir = join(SECRETS_CHART, 'templates');
    const files = readdirSync(tplDir);
    expect(files).toContain('secret-store.yaml');
    expect(files).toContain('external-secrets.yaml');
    expect(files).toContain('oncall-configmap.yaml');
  });

  it('ExternalSecret template references the SecretStore', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'templates/external-secrets.yaml'), 'utf8');
    expect(raw).toContain('kind: ExternalSecret');
    expect(raw).toContain('apiVersion: external-secrets.io/v1beta1');
    expect(raw).toContain('secretStoreRef:');
    expect(raw).toContain('kind: SecretStore');
  });

  it('secret-store.yaml binds vault backend', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'templates/secret-store.yaml'), 'utf8');
    expect(raw).toContain('kind: SecretStore');
    expect(raw).toContain('vault:');
    expect(raw).toContain('kubernetes:');
    expect(raw).toContain('role:');
  });

  it('oncall-configmap template defines rotation/escalation/pager/budget', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'templates/oncall-configmap.yaml'), 'utf8');
    expect(raw).toContain('schedule:');
    expect(raw).toContain('escalation:');
    expect(raw).toContain('pager_routing:');
    expect(raw).toContain('budget_freeze:');
    expect(raw).toContain('rotation:');
    expect(raw).toContain('levels:');
    expect(raw).toContain('routes:');
    expect(raw).toContain('slo_budget_remaining_ratio');
  });

  it('oncall-configmap template is gated by oncall.enabled', () => {
    const raw = readFileSync(join(SECRETS_CHART, 'templates/oncall-configmap.yaml'), 'utf8');
    expect(raw).toContain('if .Values.oncall.enabled');
  });
});
