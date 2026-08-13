/**
 * Tests for FormRegistry + input validator + autosave policy.
 * Phase 10 M4.1.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AutosavePolicy,
  FormRegistry,
  coerce,
  defaultValueFor,
  validateForm,
  type FormDefinition,
  type FormRecord,
} from './index.js';

// ── coerce() ────────────────────────────────────────────────────────────

describe('coerce()', () => {
  it('passes strings through for text/textarea/email/url/tel', () => {
    for (const t of ['text', 'textarea', 'email', 'url', 'tel', 'richtext'] as const) {
      expect(coerce(t, 'hello').ok).toBe(true);
      expect(coerce(t, '').ok).toBe(true);
    }
  });

  it('trims whitespace for email/url/tel', () => {
    expect(coerce('email', '  a@b.com  ')).toEqual({ ok: true, value: 'a@b.com' });
  });

  it('parses numeric strings for number inputs', () => {
    expect(coerce('number', '3.14')).toEqual({ ok: true, value: 3.14 });
    expect(coerce('number', '0')).toEqual({ ok: true, value: 0 });
    expect(coerce('number', 'abc')).toEqual({ ok: false, error: 'TYPE_MISMATCH' });
  });

  it('coerces booleans to 0/1 for numbers', () => {
    expect(coerce('number', true)).toEqual({ ok: true, value: 1 });
    expect(coerce('number', false)).toEqual({ ok: true, value: 0 });
  });

  it('rejects malformed file uploads', () => {
    expect(coerce('file', { name: 'a.txt', size: 1, mimeType: 'text/plain' }).ok).toBe(true);
    expect(coerce('file', 'not-a-file').ok).toBe(false);
  });

  it('coerces multiselect arrays', () => {
    expect(coerce('multiselect', ['a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
    expect(coerce('multiselect', 'a')).toEqual({ ok: false, error: 'TYPE_MISMATCH' });
  });

  it('validates hex color format', () => {
    expect(coerce('color', '#fff').ok).toBe(true);
    expect(coerce('color', 'red')).toEqual({ ok: false, error: 'TYPE_MISMATCH' });
  });

  it('parses date strings', () => {
    expect(coerce('date', '2024-01-02').ok).toBe(true);
    expect(coerce('date', 'not-a-date').ok).toBe(false);
  });
});

// ── defaultValueFor() ───────────────────────────────────────────────────

describe('defaultValueFor()', () => {
  it('returns author-provided defaults', () => {
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'text', defaultValue: 'hi' })).toBe('hi');
  });

  it('returns type-zero defaults when none provided', () => {
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'number' })).toBe(0);
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'checkbox' })).toBe(false);
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'multiselect' })).toEqual([]);
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'textarea' })).toBe('');
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'file' })).toEqual([]);
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'signature' })).toBe(null);
  });

  it('uses min for slider/range', () => {
    expect(defaultValueFor({ name: 'x', label: 'X', type: 'slider', min: 10 })).toBe(10);
  });
});

// ── FormRegistry ────────────────────────────────────────────────────────

describe('FormRegistry', () => {
  const makeDef = (over: Partial<FormDefinition> = {}): FormDefinition => ({
    name: 'Contact',
    description: 'demo',
    inputs: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'seats', label: 'Seats', type: 'number', validators: [{ kind: 'min', value: 1 }] },
    ],
    submitLabel: 'Send',
    ...over,
  });

  it('defines, retrieves, and enumerates forms', () => {
    const reg = new FormRegistry();
    reg.define('contact', makeDef());
    expect(reg.has('contact')).toBe(true);
    expect(reg.get('contact')?.name).toBe('Contact');
    expect(reg.size()).toBe(1);
    expect(reg.remove('contact')).toBe(true);
    expect(reg.has('contact')).toBe(false);
  });

  it('rejects definitions with no inputs', () => {
    const reg = new FormRegistry();
    expect(() => reg.define('x', { name: 'X', inputs: [] })).toThrow();
  });

  it('rejects duplicate input names', () => {
    const reg = new FormRegistry();
    expect(() =>
      reg.define('x', {
        name: 'X',
        inputs: [
          { name: 'a', label: 'A', type: 'text' },
          { name: 'a', label: 'A2', type: 'text' },
        ],
      }),
    ).toThrow(/Duplicate input/);
  });

  it('rejects unknown input types', () => {
    const reg = new FormRegistry();
    expect(() =>
      reg.define('x', {
        name: 'X',
        inputs: [{ name: 'a', label: 'A', type: 'whatever' as unknown as 'text' }],
      }),
    ).toThrow(/Unknown input type/);
  });

  it('rejects blank / oversized names', () => {
    const reg = new FormRegistry();
    expect(() =>
      reg.define('x', { name: '', inputs: [{ name: 'a', label: 'A', type: 'text' }] }),
    ).toThrow();
  });

  it('rejects oversized submitLabel', () => {
    const reg = new FormRegistry();
    expect(() =>
      reg.define('x', {
        name: 'X',
        inputs: [{ name: 'a', label: 'A', type: 'text' }],
        submitLabel: 'a'.repeat(65),
      }),
    ).toThrow();
  });

  it('validate() returns errors for unknown form', () => {
    const reg = new FormRegistry();
    const res = reg.validate('nope', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors['_form']).toContain('FORM_NOT_FOUND');
  });

  it('validate() succeeds for valid values', () => {
    const reg = new FormRegistry();
    reg.define('contact', makeDef());
    const res = reg.validate('contact', { email: 'a@b.com', seats: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value['email']).toBe('a@b.com');
      expect(res.value['seats']).toBe(5);
    }
  });

  it('validate() reports REQUIRED when an email is missing', () => {
    const reg = new FormRegistry();
    reg.define('contact', makeDef());
    const res = reg.validate('contact', { seats: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors['email']).toContain('REQUIRED');
  });

  it('validate() reports MIN when seats < 1', () => {
    const reg = new FormRegistry();
    reg.define('contact', makeDef());
    const res = reg.validate('contact', { email: 'a@b.com', seats: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors['seats']).toContain('MIN');
  });

  it('supports all 20 input types', () => {
    const reg = new FormRegistry();
    const inputs = [
      'text',
      'number',
      'email',
      'url',
      'tel',
      'password',
      'textarea',
      'select',
      'multiselect',
      'checkbox',
      'radio',
      'date',
      'time',
      'datetime',
      'range',
      'slider',
      'file',
      'signature',
      'richtext',
      'color',
    ] as const;
    const def: FormDefinition = {
      name: 'All',
      inputs: inputs.map((t) => ({ name: t, label: t, type: t })),
    };
    reg.define('all', def);
    expect(reg.get('all')?.inputs.length).toBe(20);
  });
});

// ── Validation rules ────────────────────────────────────────────────────

describe('validateForm()', () => {
  const def: FormDefinition = {
    name: 'Signup',
    inputs: [
      {
        name: 'pw',
        label: 'Password',
        type: 'password',
        validators: [
          { kind: 'minLength', value: 8 },
          { kind: 'pattern', value: '[A-Z]', flags: 'i' },
        ],
      },
      {
        name: 'pw2',
        label: 'Repeat',
        type: 'password',
        validators: [{ kind: 'crossField', field: 'pw', rule: 'equals' }],
      },
      { name: 'age', label: 'Age', type: 'number', validators: [{ kind: 'max', value: 120 }] },
      {
        name: 'username',
        label: 'Handle',
        type: 'text',
        validators: [{ kind: 'maxLength', value: 24 }],
      },
      { name: 'color', label: 'Color', type: 'color' },
    ],
  };

  it('fails on short password', () => {
    const r = validateForm(def, { pw: 'short', pw2: 'short', age: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors['pw']).toContain('MIN_LENGTH');
  });

  it('fails on cross-field mismatch', () => {
    const r = validateForm(def, { pw: 'longerpw', pw2: 'different', age: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors['pw2']).toContain('CROSS_FIELD');
  });

  it('succeeds when all rules pass', () => {
    const r = validateForm(def, {
      pw: 'longerpw',
      pw2: 'longerpw',
      age: 30,
      username: 'alice',
      color: '#fff',
    });
    expect(r.ok).toBe(true);
  });

  it('succeeds on valid input set', () => {
    const r = validateForm(def, {
      pw: 'placeholderpw',
      pw2: 'placeholderpw',
      age: 30,
      username: 'alice',
      color: '#fff',
    });
    expect(r.ok).toBe(true);
  });

  it('handles malformed patterns gracefully (does not throw)', () => {
    const bad: FormDefinition = {
      name: 'X',
      inputs: [
        {
          name: 'a',
          label: 'A',
          type: 'text',
          validators: [{ kind: 'pattern', value: '[unclosed' }],
        },
      ],
    };
    const r = validateForm(bad, { a: 'anything' });
    expect(r.ok).toBe(true);
  });

  it('compares numeric cross-field rules', () => {
    const d: FormDefinition = {
      name: 'Range',
      inputs: [
        { name: 'a', label: 'A', type: 'number' },
        {
          name: 'b',
          label: 'B',
          type: 'number',
          validators: [{ kind: 'crossField', field: 'a', rule: 'greaterThan' }],
        },
      ],
    };
    expect(validateForm(d, { a: 5, b: 6 }).ok).toBe(true);
    expect(validateForm(d, { a: 5, b: 4 }).ok).toBe(false);
  });
});

// ── AutosavePolicy ──────────────────────────────────────────────────────

describe('AutosavePolicy', () => {
  it('debounces save calls and exposes drafts after firing', async () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const policy = new AutosavePolicy({ debounceMs: 1000, save: cb });
    policy.markDirty('contact', { email: 'a@b.com' });
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(cb).toHaveBeenCalledWith('contact', { email: 'a@b.com' });
    const draft = policy.restoreDraft('contact');
    expect(draft).not.toBeNull();
    expect(draft?.values).toEqual({ email: 'a@b.com' });
    policy.destroy();
    vi.useRealTimers();
  });

  it('reset the timer on successive edits', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const policy = new AutosavePolicy({ debounceMs: 1000, save: cb });
    policy.markDirty('f', { v: 1 });
    vi.advanceTimersByTime(500);
    policy.markDirty('f', { v: 2 });
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledWith('f', { v: 2 });
    policy.destroy();
    vi.useRealTimers();
  });

  it('clearDraft drops the saved draft and cancels the timer', () => {
    vi.useFakeTimers();
    const policy = new AutosavePolicy({ debounceMs: 1000, save: vi.fn() });
    policy.markDirty('f', { v: 1 });
    policy.clearDraft('f');
    expect(policy.restoreDraft('f')).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(policy.restoreDraft('f')).toBeNull();
    policy.destroy();
    vi.useRealTimers();
  });

  it('flush() runs immediately and updates savedAt', async () => {
    const cb = vi.fn();
    const policy = new AutosavePolicy({ save: cb, clock: () => 12345 });
    await policy.flush('f', { v: 9 });
    expect(cb).toHaveBeenCalledWith('f', { v: 9 });
    expect(policy.restoreDraft('f')?.savedAt).toBe(12345);
  });

  it('listDrafts enumerates every persisted draft', async () => {
    const policy = new AutosavePolicy({ save: vi.fn() });
    await policy.flush('a', { x: 1 });
    await policy.flush('b', { x: 2 });
    expect(
      policy
        .listDrafts()
        .map((d) => d.formId)
        .sort(),
    ).toEqual(['a', 'b']);
  });
});

// ── FormRecord shape (sanity) ───────────────────────────────────────────

describe('FormRecord shape', () => {
  it('FormRecord carries all required fields', () => {
    const rec: FormRecord = {
      id: '01H000000000000000000000F1',
      tenantId: 't1',
      deckId: '01H000000000000000000000D1',
      slideId: '01H000000000000000000000S1',
      name: 'Contact',
      inputs: [{ name: 'email', label: 'Email', type: 'email' }],
      version: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(rec.version).toBe(0);
  });
});
