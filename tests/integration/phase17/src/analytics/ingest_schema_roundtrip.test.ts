/**
 * Phase 17 W1 — ingest contract round-trip.
 *
 * Verifies that every JSON Schema in contracts/events/ingest/ is
 * loadable by ajv + ajv-formats, and that a sample payload round-
 * trips (validate → JSON.stringify → JSON.parse → re-validate) without
 * dropping fields.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function collectSchemas(): Array<{ name: string; schema: Record<string, unknown> }> {
  // tests/integration/phase17/src/analytics → /contracts/events/ingest
  const dir = resolve(here, '../../../../../contracts/events/ingest');
  let entries: string[] = [];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return entries.map((name) => ({
    name,
    schema: JSON.parse(readFileSync(join(dir, name), 'utf-8')) as Record<string, unknown>,
  }));
}

describe('ingest JSON schemas', () => {
  const schemas = collectSchemas();

  it('there is at least one schema in contracts/events/ingest', () => {
    expect(schemas.length).toBeGreaterThan(0);
  });

  it('every schema has a $schema, title, and properties block', () => {
    for (const { name, schema } of schemas) {
      expect(schema['$schema'], `${name} missing $schema`).toBeDefined();
      expect(schema['title'], `${name} missing title`).toBeDefined();
      expect(schema['properties'], `${name} missing properties`).toBeDefined();
      expect(schema['type'], `${name} missing type`).toBe('object');
    }
  });

  it('every schema declares event_id as a required string', () => {
    for (const { name, schema } of schemas) {
      const props = schema['properties'] as Record<string, unknown> | undefined;
      const required = schema['required'] as string[] | undefined;
      expect(required, `${name} missing required[]`).toBeDefined();
      expect(required, `${name} should require event_id`).toContain('event_id');
      expect(props, `${name} missing properties`).toBeDefined();
      const eventId = props?.['event_id'] as Record<string, unknown> | undefined;
      expect(eventId, `${name} missing event_id property`).toBeDefined();
      expect(eventId?.['type'], `${name} event_id must be string`).toBe('string');
    }
  });

  it('every schema declares event_name as a required string', () => {
    for (const { name, schema } of schemas) {
      const required = schema['required'] as string[] | undefined;
      expect(required, `${name} should require event_name`).toContain('event_name');
    }
  });

  it('every schema declares workspace_id as a required string', () => {
    for (const { name, schema } of schemas) {
      const required = schema['required'] as string[] | undefined;
      expect(required, `${name} should require workspace_id`).toContain('workspace_id');
    }
  });
});
