import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { uuid } from '../crypto/index.js';
import type { RevenueEvent } from '../store/types.js';

/** Period month string in UTC: 'YYYY-MM'. */
function toPeriodMonth(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface SaleInput {
  listingId: string;
  sellerId: string;
  workspaceId: string;
  currency: string;
  grossCents: number;
  feeBps: number;
}

/** Record a sale: compute marketplace fee, append a revenue event. */
export async function recordSale(deps: ServiceDeps, input: SaleInput): Promise<RevenueEvent> {
  const feeCents = Math.round((input.grossCents * input.feeBps) / 10000);
  const netCents = input.grossCents - feeCents;
  const periodMonth = toPeriodMonth(nowMs(deps));
  const event: RevenueEvent = {
    id: uuid(),
    listingId: input.listingId,
    sellerId: input.sellerId,
    workspaceId: input.workspaceId,
    currency: input.currency,
    grossCents: input.grossCents,
    feeCents,
    netCents,
    payoutStatus: 'pending',
    periodMonth,
    eventType: 'sale',
    createdAt: nowMs(deps),
  };
  await deps.store.appendRevenueEvent(event);
  return event;
}

export interface RefundInput {
  listingId: string;
  sellerId: string;
  workspaceId: string;
  currency: string;
  amountCents: number;
  periodMonth: string;
}

/** Record a refund: negative gross, zero fee, append a revenue event. */
export async function recordRefund(deps: ServiceDeps, input: RefundInput): Promise<RevenueEvent> {
  const event: RevenueEvent = {
    id: uuid(),
    listingId: input.listingId,
    sellerId: input.sellerId,
    workspaceId: input.workspaceId,
    currency: input.currency,
    grossCents: -input.amountCents,
    feeCents: 0,
    netCents: -input.amountCents,
    payoutStatus: 'pending',
    periodMonth: input.periodMonth,
    eventType: 'refund',
    createdAt: nowMs(deps),
  };
  await deps.store.appendRevenueEvent(event);
  return event;
}

/** Sum netCents for a seller, optionally scoped to a period month. */
export async function ledgerBalance(
  deps: ServiceDeps,
  sellerId: string,
  periodMonth?: string,
): Promise<number> {
  const events = await deps.store.listRevenueEvents(sellerId, periodMonth);
  return events.reduce((sum, e) => sum + e.netCents, 0);
}

/** Check whether a seller meets the minimum payout threshold. */
export async function isPayoutEligible(
  deps: ServiceDeps,
  sellerId: string,
  periodMonth: string,
): Promise<boolean> {
  const balance = await ledgerBalance(deps, sellerId, periodMonth);
  return balance >= deps.limits.minPayoutCents;
}

/**
 * Mark a period as paid by appending an immutable 'payout' row.
 *
 * Immutability: we never mutate existing rows — we append a new event of
 * eventType 'payout' that references the seller + period.  Querying code
 * can look for a 'payout' row to determine paid status.
 */
export async function markPayout(
  deps: ServiceDeps,
  sellerId: string,
  periodMonth: string,
): Promise<RevenueEvent> {
  const event: RevenueEvent = {
    id: uuid(),
    listingId: '',
    sellerId,
    workspaceId: '',
    currency: '',
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    payoutStatus: 'eligible',
    periodMonth,
    eventType: 'payout',
    createdAt: nowMs(deps),
  };
  await deps.store.appendRevenueEvent(event);
  return event;
}
