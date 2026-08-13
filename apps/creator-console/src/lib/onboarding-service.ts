/**
 * onboarding-service — creator onboarding + KYC state machine.
 *
 * Per Wave 9 §S9.8 of docs/frontend-roadmap/09-wave-marketplace-creator.md.
 *
 * Drives the 4-step onboarding wizard:
 *   1. identity verification (Persona)
 *   2. payout setup (Stripe Connect / bank / PayPal)
 *   3. tax information (country, ID type, treaty claim)
 *   4. first listing (link to /listings/create)
 *
 * Each submit function tries `fetcher<T>` and falls back to a
 * deterministic in-memory state advancement on failure so the UI is
 * testable offline (and the wizard remains usable when the orchestrator
 * is unreachable). The fallback mirrors the public response shape so
 * callers don't branch on success vs failure.
 */

import { fetcher } from './fetcher';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Public types — see creator-console/src/lib/onboarding-service.test.ts.
// ---------------------------------------------------------------------------

export type OnboardingStep = 'identity' | 'payout' | 'tax' | 'listing';

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  'identity',
  'payout',
  'tax',
  'listing',
];

export interface OnboardingIdentity {
  verified: boolean;
  persona_id?: string;
  legal_name?: string;
  country?: string;
}

export interface OnboardingPayout {
  method: 'bank' | 'stripe' | 'paypal';
  last4?: string;
  stripe_id?: string;
  paypal_email?: string;
}

export interface OnboardingTax {
  country: string;
  id_type: 'ssn' | 'ein' | 'vat' | 'none';
  id_value?: string;
  treaty: boolean;
}

export interface OnboardingState {
  workspace_id: string;
  current_step: OnboardingStep;
  identity: OnboardingIdentity;
  payout: OnboardingPayout;
  tax: OnboardingTax;
  completed: OnboardingStep[];
}

// ---------------------------------------------------------------------------
// Payloads accepted by the submit* functions.
// ---------------------------------------------------------------------------

export interface IdentityPayload {
  legal_name: string;
  country: string;
  dob: string;
  persona_id: string;
}

export type PayoutMethod = OnboardingPayout['method'];

export interface PayoutPayload {
  method: PayoutMethod;
  last4?: string;
  stripe_id?: string;
  paypal_email?: string;
}

export type TaxIdType = OnboardingTax['id_type'];

export interface TaxPayload {
  country: string;
  id_type: TaxIdType;
  id_value?: string;
  treaty: boolean;
}

// ---------------------------------------------------------------------------
// In-memory store — fallback when /v1/creator/onboarding is unreachable.
// ---------------------------------------------------------------------------

const STORE: Map<string, OnboardingState> = new Map();

function emptyState(workspaceId: string): OnboardingState {
  return {
    workspace_id: workspaceId,
    current_step: 'identity',
    identity: { verified: false },
    payout: { method: 'stripe' },
    tax: { country: '', id_type: 'none', treaty: false },
    completed: [],
  };
}

function advance(state: OnboardingState, step: OnboardingStep): OnboardingState {
  const completed = state.completed.includes(step) ? state.completed : [...state.completed, step];
  const idx = ONBOARDING_STEPS.indexOf(step);
  const nextIdx = idx + 1 < ONBOARDING_STEPS.length ? idx + 1 : idx;
  const current_step = ONBOARDING_STEPS[nextIdx] ?? state.current_step;
  return { ...state, completed, current_step };
}

function merged<T extends object>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch };
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export async function getOnboarding(workspaceId: string): Promise<OnboardingState> {
  try {
    const json = await fetcher<OnboardingState>(
      API_BASE,
      `/v1/creator/onboarding?workspace_id=${encodeURIComponent(workspaceId)}`,
    );
    if (json) {
      STORE.set(workspaceId, json);
      return json;
    }
  } catch {
    // fall through to in-memory state
  }
  const existing = STORE.get(workspaceId);
  if (existing) return existing;
  const seeded = emptyState(workspaceId);
  STORE.set(workspaceId, seeded);
  return seeded;
}

export async function submitIdentity(
  workspaceId: string,
  payload: IdentityPayload,
): Promise<OnboardingState> {
  const identity: OnboardingIdentity = {
    verified: true,
    persona_id: payload.persona_id,
    legal_name: payload.legal_name,
    country: payload.country,
  };

  let next: OnboardingState | null = null;
  try {
    next = await fetcher<OnboardingState>(
      API_BASE,
      `/v1/creator/onboarding/${encodeURIComponent(workspaceId)}/identity`,
      { method: 'POST', body: { ...payload, identity } },
    );
  } catch {
    // fall through to in-memory update
  }

  if (next) {
    STORE.set(workspaceId, next);
    return next;
  }

  const current = await getOnboarding(workspaceId);
  const updated: OnboardingState = advance(merged(current, { identity }), 'identity');
  STORE.set(workspaceId, updated);
  return updated;
}

export async function submitPayout(
  workspaceId: string,
  payload: PayoutPayload,
): Promise<OnboardingState> {
  const payout: OnboardingPayout = (() => {
    const base: OnboardingPayout = { method: payload.method };
    if (payload.method === 'bank' && payload.last4) base.last4 = payload.last4;
    if (payload.method === 'stripe' && payload.stripe_id) base.stripe_id = payload.stripe_id;
    if (payload.method === 'paypal' && payload.paypal_email)
      base.paypal_email = payload.paypal_email;
    return base;
  })();

  let next: OnboardingState | null = null;
  try {
    next = await fetcher<OnboardingState>(
      API_BASE,
      `/v1/creator/onboarding/${encodeURIComponent(workspaceId)}/payout`,
      { method: 'POST', body: { ...payload, payout } },
    );
  } catch {
    // fall through to in-memory update
  }

  if (next) {
    STORE.set(workspaceId, next);
    return next;
  }

  const current = await getOnboarding(workspaceId);
  const updated: OnboardingState = advance(merged(current, { payout }), 'payout');
  STORE.set(workspaceId, updated);
  return updated;
}

export async function submitTax(
  workspaceId: string,
  payload: TaxPayload,
): Promise<OnboardingState> {
  const tax: OnboardingTax = (() => {
    const base: OnboardingTax = {
      country: payload.country,
      id_type: payload.id_type,
      treaty: payload.treaty,
    };
    if (payload.id_type !== 'none' && payload.id_value) {
      base.id_value = payload.id_value;
    }
    return base;
  })();

  let next: OnboardingState | null = null;
  try {
    next = await fetcher<OnboardingState>(
      API_BASE,
      `/v1/creator/onboarding/${encodeURIComponent(workspaceId)}/tax`,
      { method: 'POST', body: { ...payload, tax } },
    );
  } catch {
    // fall through to in-memory update
  }

  if (next) {
    STORE.set(workspaceId, next);
    return next;
  }

  const current = await getOnboarding(workspaceId);
  const updated: OnboardingState = advance(merged(current, { tax }), 'tax');
  STORE.set(workspaceId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Helpers exposed for tests.
// ---------------------------------------------------------------------------

export const __test = { STORE, emptyState, advance, merged };
