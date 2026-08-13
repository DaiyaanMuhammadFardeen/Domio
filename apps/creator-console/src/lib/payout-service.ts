/**
 * Payout service — creator-side payout history and settings.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Extended in Wave 9 §S9.4 with `getPayoutSettings` and
 * `updatePayoutSettings`. Settings are stored per-creator in an
 * in-memory map seeded with sensible defaults so the UI renders
 * without an upstream.
 */

import { fetcher } from './fetcher';
import type { PayoutMethod, PayoutSchedule, PayoutSettings, PayoutSettingsInput } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface CreatorPayoutRow {
  readonly id: string;
  readonly amountCents: number;
  readonly status: 'queued' | 'paid' | 'failed';
  readonly paidAtMs: number | null;
}

export const BOOTSTRAP_CREATOR_PAYOUTS: ReadonlyArray<CreatorPayoutRow> = [];

export async function listCreatorPayouts(
  workspaceId: string,
): Promise<ReadonlyArray<CreatorPayoutRow>> {
  try {
    const json = await fetcher<{ rows?: CreatorPayoutRow[] }>(
      API_BASE,
      `/v1/creator/payouts?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Wave 9 §S9.4 — PayoutSettings primitives.
// ---------------------------------------------------------------------------

/** Per-creator settings store. */
const SETTINGS_STORE: Map<string, PayoutSettings> = new Map();

function defaultSettings(creatorId: string): PayoutSettings {
  return {
    creator_id: creatorId,
    method: 'stripe-connect',
    schedule: 'monthly',
    bank_account_last4: null,
    stripe_connect_id: 'acct_demo_1234',
    paypal_email: null,
    min_payout_cents: 5000,
    updated_at_ms: Date.now(),
  };
}

export async function getPayoutSettings(creatorId: string): Promise<PayoutSettings> {
  try {
    const json = await fetcher<PayoutSettings>(
      API_BASE,
      `/v1/creator/payouts/settings?creator_id=${encodeURIComponent(creatorId)}`,
    );
    if (json) {
      SETTINGS_STORE.set(creatorId, json);
      return json;
    }
  } catch {
    // fall through to seeded defaults
  }
  const existing = SETTINGS_STORE.get(creatorId);
  if (existing) return existing;
  const seeded = defaultSettings(creatorId);
  SETTINGS_STORE.set(creatorId, seeded);
  return seeded;
}

export async function updatePayoutSettings(
  creatorId: string,
  input: PayoutSettingsInput,
): Promise<PayoutSettings> {
  const now = Date.now();
  const current = (await getPayoutSettings(creatorId)) as PayoutSettings;
  const updated: PayoutSettings = {
    creator_id: creatorId,
    method: input.method,
    schedule: input.schedule,
    bank_account_last4:
      input.method === 'bank-transfer'
        ? (input.bank_account_last4 ?? current.bank_account_last4 ?? null)
        : null,
    stripe_connect_id:
      input.method === 'stripe-connect'
        ? (input.stripe_connect_id ?? current.stripe_connect_id ?? null)
        : null,
    paypal_email:
      input.method === 'paypal'
        ? (input.paypal_email ?? current.paypal_email ?? null)
        : null,
    min_payout_cents: input.min_payout_cents,
    updated_at_ms: now,
  };
  SETTINGS_STORE.set(creatorId, updated);
  return updated;
}

export type { PayoutMethod, PayoutSchedule };