/**
 * Field-aware PII redactor.
 *
 * Usage:
 *   const r = new PiiRedactor({ fields: ['email', 'phone', 'user.name'] });
 *   const out = r.redact({ email: 'a@b.c', phone: '+1 555', score: 42 });
 *   //   out.value === { email: '[redacted]', phone: '[redacted]', score: 42 }
 *
 * The redactor never inspects free-form values. It walks the object and
 * replaces values whose key matches the `fields` allow-list.
 */

import type { PiiRedactorOptions, RedactResult, RedactionPolicy } from './types.js';

const DEFAULT_MASK = '[redacted]';

export class PiiRedactor {
  private readonly fieldsLower: ReadonlySet<string>;
  private readonly policy: RedactionPolicy;
  private readonly maskValue: string;

  constructor(opts: PiiRedactorOptions) {
    if (!opts.fields || opts.fields.length === 0) {
      throw new Error('PiiRedactor: fields must be a non-empty list');
    }
    this.fieldsLower = new Set(opts.fields.map((f) => f.toLowerCase()));
    this.policy = opts.policy ?? 'mask';
    this.maskValue = opts.maskValue ?? DEFAULT_MASK;
  }

  /** Returns the lower-cased field set used by `redact()`. */
  fields(): readonly string[] {
    return [...this.fieldsLower];
  }

  /**
   * Redact PII fields. Returns a deep-cloned value with replacements
   * applied plus the list of fields that were touched. Never mutates
   * the input.
   */
  redact<T>(value: T): RedactResult<T> {
    const redactedFields: string[] = [];
    const cloned = this.walk(value, [], (path) => {
      redactedFields.push(path.join('.'));
      return this.replaceValue();
    }) as T;
    return { value: cloned, redactedFields };
  }

  private shouldRedact(path: readonly string[]): boolean {
    // Match by exact dotted path (e.g. `user.email`) and by leaf key
    // (`email` matches anywhere).
    const dotted = path.join('.').toLowerCase();
    if (this.fieldsLower.has(dotted)) return true;
    const leaf = path[path.length - 1];
    if (!leaf) return false;
    return this.fieldsLower.has(leaf.toLowerCase());
  }

  private replaceValue(): unknown {
    if (this.policy === 'drop') return undefined;
    if (this.policy === 'hash') {
      // Use a deterministic value; the real hash is computed server-side
      // because we have no secret here. Keep the placeholder short.
      return '[hash]';
    }
    return this.maskValue;
  }

  private walk(value: unknown, path: string[], onHit: (path: string[]) => unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry, idx) => {
        if (entry && typeof entry === 'object') {
          return this.walk(entry, [...path, String(idx)], onHit);
        }
        if (this.shouldRedact([...path, String(idx)])) {
          return onHit([...path, String(idx)]);
        }
        return entry;
      });
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const childPath = [...path, k];
        if (v && typeof v === 'object') {
          out[k] = this.walk(v, childPath, onHit);
          continue;
        }
        if (this.shouldRedact(childPath)) {
          out[k] = onHit(childPath);
          continue;
        }
        out[k] = v;
      }
      return out;
    }
    if (this.shouldRedact(path)) {
      return onHit(path);
    }
    return value;
  }
}