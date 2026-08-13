/**
 * Retention Policy service — Wave 8 §S8.6.
 *
 * Per-content-type retention policy store. Backed by a module-singleton
 * in-memory array seeded with one policy per `RetentionContentType`.
 * The retention period determines which decks fall due on the
 * `previewRetention` endpoint, with legal-hold items excluded and
 * counted as exemptions.
 */

import type {
  RetentionContentType,
  RetentionPeriod,
  RetentionPolicy,
  RetentionPolicyInput,
  RetentionPreview,
} from './types';

const NOW = Date.UTC(2026, 6, 1);
const DAY_MS = 1000 * 60 * 60 * 24;

const SEED: readonly RetentionPolicy[] = [
  {
    id: 'ret-deck',
    tenant_id: 'acme',
    content_type: 'deck',
    period: '3y',
    updated_at_ms: NOW - 30 * DAY_MS,
    updated_by: 'compliance@acme.com',
    exemptions: 2,
  },
  {
    id: 'ret-asset',
    tenant_id: 'acme',
    content_type: 'asset',
    period: '1y',
    updated_at_ms: NOW - 12 * DAY_MS,
    updated_by: 'admin@acme.com',
    exemptions: 0,
  },
  {
    id: 'ret-comment',
    tenant_id: 'acme',
    content_type: 'comment',
    period: '90d',
    updated_at_ms: NOW - 5 * DAY_MS,
    updated_by: 'admin@acme.com',
    exemptions: 0,
  },
  {
    id: 'ret-audit-log',
    tenant_id: 'acme',
    content_type: 'audit-log',
    period: '7y',
    updated_at_ms: NOW - 60 * DAY_MS,
    updated_by: 'compliance@acme.com',
    exemptions: 0,
  },
  {
    id: 'ret-export',
    tenant_id: 'acme',
    content_type: 'export',
    period: '30d',
    updated_at_ms: NOW - 2 * DAY_MS,
    updated_by: 'admin@acme.com',
    exemptions: 0,
  },
];

const STORE: RetentionPolicy[] = SEED.map((p) => ({ ...p }));

function clone(p: RetentionPolicy): RetentionPolicy {
  return { ...p };
}

export async function listRetentionPolicies(): Promise<ReadonlyArray<RetentionPolicy>> {
  return STORE.map(clone);
}

export async function getRetentionPolicy(id: string): Promise<RetentionPolicy | null> {
  const found = STORE.find((p) => p.id === id);
  return found ? clone(found) : null;
}

/** Map a period token to its day-length, or null for indefinite. */
function periodDays(period: RetentionPeriod): number | null {
  switch (period) {
    case '30d':
      return 30;
    case '90d':
      return 90;
    case '1y':
      return 365;
    case '3y':
      return 365 * 3;
    case '7y':
      return 365 * 7;
    case 'indefinite':
      return null;
  }
}

const DECK_TITLES: ReadonlyArray<string> = [
  'Q1 Board Update',
  'Investor Pitch',
  'Sales Enablement Deck',
  'Customer Story — Acme Co',
  'Onboarding Walkthrough',
  'Pricing Proposal',
  'Engineering Roadmap',
  'Marketing Plan',
  'Annual Report',
  'Partner Agreement',
  'Security Overview',
  'Product Launch',
  'Field Training',
  'Q3 Earnings Call',
];

export async function upsertRetentionPolicy(input: RetentionPolicyInput): Promise<RetentionPolicy> {
  const idx = STORE.findIndex((p) => p.content_type === input.content_type);
  const next: RetentionPolicy = {
    id: idx >= 0 ? STORE[idx]!.id : `ret-${input.content_type}`,
    tenant_id: idx >= 0 ? STORE[idx]!.tenant_id : 'acme',
    content_type: input.content_type,
    period: input.period,
    updated_at_ms: NOW,
    updated_by: 'admin@domio.app',
    exemptions: idx >= 0 ? STORE[idx]!.exemptions : 0,
  };
  if (idx >= 0) {
    STORE[idx] = next;
  } else {
    STORE.push(next);
  }
  return clone(next);
}

/**
 * Preview decks affected by a policy. For content_type !== 'deck' we
 * still surface a deck-shaped projection so the UI has a consistent
 * table to render.
 */
export async function previewRetention(policyId: string): Promise<RetentionPreview> {
  const policy = STORE.find((p) => p.id === policyId);
  if (!policy) {
    return { policy_id: policyId, affected_decks: [], total_affected: 0 };
  }
  const days = periodDays(policy.period);
  if (days === null) {
    // Indefinite — nothing falls due.
    return { policy_id: policyId, affected_decks: [], total_affected: 0 };
  }
  // Deterministic count between 5 and 15 inclusive.
  const seed = hashString(`${policy.id}:${policy.content_type}`);
  const count = 5 + (seed % 11);
  const affected = Array.from({ length: count }).map((_, i) => {
    const lastModifiedMs = NOW - DAY_MS * (days - 1 - (i % Math.max(days, 2)));
    const daysLeft = Math.max(1, days - Math.floor((NOW - lastModifiedMs) / DAY_MS));
    return {
      id: `${policy.content_type}-${i}`,
      title: DECK_TITLES[i % DECK_TITLES.length] ?? `Item ${i + 1}`,
      last_modified_ms: lastModifiedMs,
      days_until_purge: daysLeft,
    };
  });
  return {
    policy_id: policyId,
    affected_decks: affected,
    total_affected: affected.length,
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const RETENTION_PERIOD_LABELS: Readonly<Record<RetentionPeriod, string>> = {
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
  '3y': '3 years',
  '7y': '7 years',
  indefinite: 'Indefinite',
};

export const RETENTION_CONTENT_TYPE_LABELS: Readonly<Record<RetentionContentType, string>> = {
  deck: 'Decks',
  asset: 'Assets',
  comment: 'Comments',
  'audit-log': 'Audit log',
  export: 'Exports',
};
