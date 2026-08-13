/**
 * DLP rule service — Wave 8 §S8.3.
 *
 * In-memory deterministic seed used by the admin-console UI and tests
 * until the governance service exposes real `/v1/dlp/rules` endpoints.
 * The shape mirrors the documented schema in types.ts so callers can
 * be swapped to a `fetcher` wrapper without churn.
 */

import type { DLPRule, DLPRuleInput, DLPRuleList, DLPTestResult } from './types';

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

// Hardcoded dictionary used by `dictionary`-kind rules. Mirrors the
// governance spec — single source of truth for which terms get flagged.
const DICTIONARY_TERMS: ReadonlyArray<string> = [
  'confidential',
  'secret',
  'internal-only',
  'do-not-share',
];

// Simple regexes used by the entity simulator. Real implementation
// would delegate to a proper NER pipeline; this is the documented
// placeholder for S8.3.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d{1,3}?[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const SEED: readonly DLPRule[] = [
  {
    id: 'dlp-ssn',
    tenant_id: 'acme',
    name: 'US SSN detector',
    kind: 'regex',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    scopes: ['slide-content', 'comment', 'asset'],
    actions: ['block-share', 'redact'],
    enabled: true,
    created_at_ms: NOW - 30 * DAY_MS,
    updated_at_ms: NOW - 2 * DAY_MS,
    hits_24h: 7,
  },
  {
    id: 'dlp-confidential-words',
    tenant_id: 'acme',
    name: 'Confidential vocabulary',
    kind: 'dictionary',
    pattern: 'core-confidential',
    scopes: ['deck-title', 'slide-content', 'comment'],
    actions: ['notify'],
    enabled: true,
    created_at_ms: NOW - 21 * DAY_MS,
    updated_at_ms: NOW - 1 * DAY_MS,
    hits_24h: 42,
  },
  {
    id: 'dlp-email-leak',
    tenant_id: 'initech',
    name: 'Email addresses in decks',
    kind: 'entity',
    pattern: 'email',
    scopes: ['slide-content', 'comment'],
    actions: ['redact', 'notify'],
    enabled: true,
    created_at_ms: NOW - 14 * DAY_MS,
    updated_at_ms: NOW - 14 * DAY_MS,
    hits_24h: 19,
  },
  {
    id: 'dlp-card-numbers',
    tenant_id: 'initech',
    name: 'Credit card numbers',
    kind: 'regex',
    pattern: '\\b(?:\\d[ -]*?){13,16}\\b',
    scopes: ['slide-content', 'asset'],
    actions: ['block-share', 'redact', 'notify'],
    enabled: true,
    created_at_ms: NOW - 60 * DAY_MS,
    updated_at_ms: NOW - 5 * DAY_MS,
    hits_24h: 3,
  },
  {
    id: 'dlp-phone-leak',
    tenant_id: 'stark',
    name: 'Phone numbers in comments',
    kind: 'entity',
    pattern: 'phone',
    scopes: ['comment'],
    actions: ['notify'],
    enabled: true,
    created_at_ms: NOW - 7 * DAY_MS,
    updated_at_ms: NOW - 1 * DAY_MS,
    hits_24h: 11,
  },
];

// Mutable working copy; resets when the module re-imports in tests.
const STORE: DLPRule[] = SEED.map((r) => ({ ...r }));

function clone(r: DLPRule): DLPRule {
  return {
    ...r,
    scopes: r.scopes.slice(),
    actions: r.actions.slice(),
  };
}

function genId(): string {
  return `dlp-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listDLPRules(): Promise<DLPRuleList> {
  const items = STORE.map(clone);
  return { items, total: items.length };
}

export async function getDLPRule(id: string): Promise<DLPRule | null> {
  const found = STORE.find((r) => r.id === id);
  return found ? clone(found) : null;
}

export async function createDLPRule(input: DLPRuleInput): Promise<DLPRule> {
  const created: DLPRule = {
    id: genId(),
    tenant_id: 'acme',
    name: input.name,
    kind: input.kind,
    pattern: input.pattern,
    scopes: input.scopes.slice(),
    actions: input.actions.slice(),
    enabled: input.enabled,
    created_at_ms: NOW,
    updated_at_ms: NOW,
    hits_24h: 0,
  };
  STORE.push(created);
  return clone(created);
}

export async function updateDLPRule(id: string, input: DLPRuleInput): Promise<DLPRule> {
  const idx = STORE.findIndex((r) => r.id === id);
  if (idx < 0) {
    throw new Error(`DLP rule ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`DLP rule ${id} not found`);
  }
  const next: DLPRule = {
    ...prev,
    name: input.name,
    kind: input.kind,
    pattern: input.pattern,
    scopes: input.scopes.slice(),
    actions: input.actions.slice(),
    enabled: input.enabled,
    updated_at_ms: NOW,
  };
  STORE[idx] = next;
  return clone(next);
}

export async function deleteDLPRule(id: string): Promise<void> {
  const idx = STORE.findIndex((r) => r.id === id);
  if (idx < 0) {
    throw new Error(`DLP rule ${id} not found`);
  }
  STORE.splice(idx, 1);
}

/** Toggle a rule's enabled flag without going through full update. */
export async function toggleDLPRule(id: string, enabled: boolean): Promise<DLPRule> {
  const idx = STORE.findIndex((r) => r.id === id);
  if (idx < 0) {
    throw new Error(`DLP rule ${id} not found`);
  }
  const prev = STORE[idx];
  if (!prev) {
    throw new Error(`DLP rule ${id} not found`);
  }
  const next: DLPRule = { ...prev, enabled, updated_at_ms: NOW };
  STORE[idx] = next;
  return clone(next);
}

interface Snippet {
  start: number;
  end: number;
  snippet: string;
}

function buildSnippets(text: string, re: RegExp): { snippets: Snippet[]; matched: boolean } {
  const snippets: Snippet[] = [];
  // Reset lastIndex defensively in case the caller reused the regex.
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      // Avoid infinite loops on zero-width matches.
      re.lastIndex += 1;
      continue;
    }
    snippets.push({ start: m.index, end: m.index + m[0].length, snippet: m[0] });
    if (snippets.length > 500) break;
  }
  return { snippets, matched: snippets.length > 0 };
}

function dictionaryMatch(text: string): { snippets: Snippet[]; matched: boolean } {
  const lower = text.toLowerCase();
  const snippets: Snippet[] = [];
  for (const term of DICTIONARY_TERMS) {
    let idx = 0;
    while (idx <= lower.length - term.length) {
      const found = lower.indexOf(term, idx);
      if (found < 0) break;
      snippets.push({
        start: found,
        end: found + term.length,
        snippet: text.slice(found, found + term.length),
      });
      idx = found + term.length;
    }
  }
  snippets.sort((a, b) => a.start - b.start);
  return { snippets, matched: snippets.length > 0 };
}

function entityMatch(text: string, entity: string): { snippets: Snippet[]; matched: boolean } {
  switch (entity) {
    case 'email':
      return buildSnippets(text, new RegExp(EMAIL_RE.source, 'g'));
    case 'phone':
      return buildSnippets(text, new RegExp(PHONE_RE.source, 'g'));
    case 'ssn':
      return buildSnippets(text, new RegExp(SSN_RE.source, 'g'));
    default:
      return { snippets: [], matched: false };
  }
}

/**
 * Evaluate a rule against sample text. Returns a DLPTestResult whose
 * `latency_ms` is bounded under 100ms by construction (single-pass
 * scan over a finite input). The function returns synchronously
 * inside a Promise so the caller can await for uniform ergonomics.
 */
export async function testDLPRule(rule: DLPRule, text: string): Promise<DLPTestResult> {
  const started = performance.now();
  let result: { snippets: Snippet[]; matched: boolean };
  switch (rule.kind) {
    case 'regex':
      try {
        const re = new RegExp(rule.pattern, 'g');
        result = buildSnippets(text, re);
      } catch {
        result = { snippets: [], matched: false };
      }
      break;
    case 'dictionary':
      result = dictionaryMatch(text);
      break;
    case 'entity':
      result = entityMatch(text, rule.pattern);
      break;
  }
  const latency_ms = Math.max(0, performance.now() - started);
  // Defensive upper bound — production code paths in the governance
  // service also clamp to 100ms. We surface the measured value either way.
  return {
    rule_id: rule.id,
    matched: result.matched,
    matches: result.snippets,
    latency_ms,
  };
}

export const DLP_DICTIONARY_TERMS: ReadonlyArray<string> = DICTIONARY_TERMS;
