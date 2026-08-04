/**
 * PII redactor tests.
 *
 * Covers:
 *   - constructor rejects empty field list
 *   - mask policy replaces matched fields with `[redacted]`
 *   - hash policy replaces with `[hash]` placeholder
 *   - drop policy removes the key
 *   - case-insensitive field matching
 *   - dotted-path field matching (e.g. user.email)
 *   - arrays are walked (object children only)
 *   - input is never mutated
 *   - non-matching fields are preserved verbatim
 *   - redactedFields list reports touched keys
 *   - custom mask value is honoured
 */

import { describe, it, expect } from 'vitest';
import { PiiRedactor } from './redactor.js';

describe('PiiRedactor', () => {
  it('throws when no fields are configured', () => {
    expect(() => new PiiRedactor({ fields: [] })).toThrowError(/fields/);
  });

  it('masks matching string fields', () => {
    const r = new PiiRedactor({ fields: ['email'] });
    const out = r.redact({ email: 'a@b.c', name: 'Ada' });
    expect(out.value).toEqual({ email: '[redacted]', name: 'Ada' });
    expect(out.redactedFields).toEqual(['email']);
  });

  it('honours a custom mask value', () => {
    const r = new PiiRedactor({ fields: ['email'], maskValue: '<hidden>' });
    const out = r.redact({ email: 'a@b.c' });
    expect(out.value).toEqual({ email: '<hidden>' });
  });

  it('hash policy replaces with [hash]', () => {
    const r = new PiiRedactor({ fields: ['email'], policy: 'hash' });
    const out = r.redact({ email: 'a@b.c' });
    expect(out.value).toEqual({ email: '[hash]' });
  });

  it('drop policy removes the key', () => {
    const r = new PiiRedactor({ fields: ['email'], policy: 'drop' });
    const out = r.redact({ email: 'a@b.c', name: 'Ada' });
    expect(out.value).toEqual({ name: 'Ada' });
  });

  it('matches case-insensitively', () => {
    const r = new PiiRedactor({ fields: ['Email'] });
    const out = r.redact({ EMAIL: 'x', email: 'y', name: 'n' });
    expect(out.value).toEqual({ EMAIL: '[redacted]', email: '[redacted]', name: 'n' });
  });

  it('matches dotted paths into nested objects', () => {
    const r = new PiiRedactor({ fields: ['user.email'] });
    const out = r.redact({ user: { email: 'a@b.c', name: 'Ada' } });
    expect(out.value).toEqual({ user: { email: '[redacted]', name: 'Ada' } });
  });

  it('walks arrays of objects', () => {
    const r = new PiiRedactor({ fields: ['email'] });
    const out = r.redact({ items: [{ email: 'a' }, { email: 'b', other: 1 }] });
    expect(out.value).toEqual({ items: [{ email: '[redacted]' }, { email: '[redacted]', other: 1 }] });
  });

  it('does not mutate the input', () => {
    const input = { email: 'a@b.c', user: { email: 'x@y.z' } };
    const snapshot = JSON.parse(JSON.stringify(input));
    new PiiRedactor({ fields: ['email'] }).redact(input);
    expect(input).toEqual(snapshot);
  });

  it('preserves fields that are not in the list', () => {
    const r = new PiiRedactor({ fields: ['email'] });
    const out = r.redact({ email: 'a@b.c', count: 7, flag: true, blank: null });
    expect(out.value).toEqual({ email: '[redacted]', count: 7, flag: true, blank: null });
  });

  it('reports every redacted path', () => {
    const r = new PiiRedactor({ fields: ['email', 'phone', 'user.email'] });
    const out = r.redact({ email: 'a', phone: 'b', user: { email: 'c', name: 'n' } });
    expect(new Set(out.redactedFields)).toEqual(new Set(['email', 'phone', 'user.email']));
  });

  it('returns the value untouched when nothing matches', () => {
    const r = new PiiRedactor({ fields: ['email'] });
    const out = r.redact({ a: 1, b: { c: 'x' } });
    expect(out.value).toEqual({ a: 1, b: { c: 'x' } });
    expect(out.redactedFields).toEqual([]);
  });

  it('exposes the configured field list via fields()', () => {
    const r = new PiiRedactor({ fields: ['Email', 'phone'] });
    expect(new Set(r.fields())).toEqual(new Set(['email', 'phone']));
  });
});