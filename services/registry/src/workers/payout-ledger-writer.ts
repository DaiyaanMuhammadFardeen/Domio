import type { ServiceDeps } from '../deps.js';
import { isPayoutEligible, markPayout } from '../marketplace/revenue.js';
import type { RevenueEvent } from '../store/types.js';

export interface PayoutResult {
  marked: boolean;
  payoutEvent?: RevenueEvent;
}

/**
 * If the seller is payout-eligible for the given period, mark it.
 * Returns the payout event summary, or { marked: false } if ineligible.
 */
export async function run(
  deps: ServiceDeps,
  sellerId: string,
  periodMonth: string,
): Promise<PayoutResult> {
  const eligible = await isPayoutEligible(deps, sellerId, periodMonth);
  if (!eligible) return { marked: false };
  const event = await markPayout(deps, sellerId, periodMonth);
  return { marked: true, payoutEvent: event };
}
