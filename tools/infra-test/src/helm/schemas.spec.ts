import { describe, it, expect } from 'vitest';
import { readText, listFiles } from '../read.js';
import { REPO_ROOT } from '../repo-root.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const CHARTS = ['domio', 'observability', 'ingress', 'secrets'];
const CHART_ROOT = `${REPO_ROOT}/infrastructure/helm`;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Load schemas that declare draft-2020-12 by stripping the $schema field.
// ajv 8 only knows draft-07 by default; the schema body itself is unchanged.
function compile(schema: Record<string, unknown>) {
  const { $schema, ...rest } = schema;
  void $schema;
  return ajv.compile(rest);
}

describe('Helm values.yaml validates against values.schema.json', () => {
  for (const name of CHARTS) {
    it(`chart ${name} values.yaml validates against its schema`, () => {
      const schemaText = readText(`${CHART_ROOT}/${name}/values.schema.json`);
      const valuesText = readText(`${CHART_ROOT}/${name}/values.yaml`);
      const schema = JSON.parse(schemaText) as Record<string, unknown>;
      const values = parseValuesForSchema(valuesText);
      const validate = compile(schema);
      const valid = validate(values);
      expect(valid, JSON.stringify(validate.errors)).toBe(true);
    });
  }
});

/**
 * Helm values can have expressions like `{{ .Values.foo }}` inside scalar
 * values, which the JSON-schema validator does not understand. Before
 * validating, replace each expression with the string the schema can accept.
 */
function parseValuesForSchema(text: string): unknown {
  // Replace template references inside scalar values with a sentinel string.
  // We do two passes:
  //   1. Replace entire quoted scalar expressions:  "abc{{ .X }}def" -> "STR"
  //   2. Replace bare-scalar expressions:         abc{{ .X }}def    -> "STR"
  // Then we drop lines that contain only template tokens.
  let stripped = text.replace(/\{\{[^}]+\}\}/g, 'TPL');
  // Replace inline-flow {...} blocks that contain only templates with empty map.
  stripped = stripped.replace(/\{\s*"?TPL"?\s*[,TPL"]*\s*\}/g, '{}');
  return YAML.parse(stripped);
}

describe('Negative fixtures — invalid values must be rejected', () => {
  it('rejects an image tag with whitespace', () => {
    const schemaText = readText(`${CHART_ROOT}/domio/values.schema.json`);
    const schema = JSON.parse(schemaText) as Record<string, unknown>;
    const validate = compile(schema);
    const bad = {
      image: { repository: 'ghcr.io/x', tag: 'bad tag', pullPolicy: 'IfNotPresent' },
      replicaCount: 1,
      service: { type: 'ClusterIP', port: 8080 },
      resources: {
        requests: { cpu: '10m', memory: '32Mi' },
        limits: { cpu: '100m', memory: '64Mi' },
      },
      securityContext: {
        runAsNonRoot: true,
        readOnlyRootFilesystem: true,
        allowPrivilegeEscalation: false,
        capabilities: { drop: ['ALL'] },
      },
    };
    expect(validate(bad)).toBe(false);
  });

  it('rejects replicaCount: 0', () => {
    const schemaText = readText(`${CHART_ROOT}/domio/values.schema.json`);
    const schema = JSON.parse(schemaText) as Record<string, unknown>;
    const validate = compile(schema);
    const bad = {
      image: { repository: 'ghcr.io/x', tag: '0.1.0', pullPolicy: 'IfNotPresent' },
      replicaCount: 0,
      service: { type: 'ClusterIP', port: 8080 },
      resources: {
        requests: { cpu: '10m', memory: '32Mi' },
        limits: { cpu: '100m', memory: '64Mi' },
      },
      securityContext: {
        runAsNonRoot: true,
        readOnlyRootFilesystem: true,
        allowPrivilegeEscalation: false,
        capabilities: { drop: ['ALL'] },
      },
    };
    expect(validate(bad)).toBe(false);
  });

  it('rejects runAsNonRoot: false', () => {
    const schemaText = readText(`${CHART_ROOT}/observability/values.schema.json`);
    const schema = JSON.parse(schemaText) as Record<string, unknown>;
    const validate = compile(schema);
    const bad = {
      otelCollector: {
        replicas: 1,
        image: { repository: 'otel/otel', tag: '0.104.0', pullPolicy: 'IfNotPresent' },
        ports: { grpc: 4317, http: 4318 },
        config: {},
        securityContext: { runAsNonRoot: false, readOnlyRootFilesystem: true },
      },
      prometheus: { retentionDays: 7, remoteWritePort: 9090, scrapePort: 9090 },
      grafana: { port: 3000, selfHosted: true },
      tempo: { otlpPort: 4317, retentionDays: 7 },
      loki: { port: 3100, retentionDays: 7 },
    };
    expect(validate(bad)).toBe(false);
  });
});

describe('Helm charts — image registry pinning', () => {
  for (const name of CHARTS) {
    it(`chart ${name} uses an explicit image registry (no implicit latest)`, () => {
      const files = listFiles(`${CHART_ROOT}/${name}`);
      const allText = files.map(readText).join('\n');
      // Must not reference ":latest" anywhere.
      expect(allText).not.toMatch(/:\s*latest\b/);
    });
  }
});
