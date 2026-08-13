/**
 * Marketplace purchase service — buyer's purchase history.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 * Split from the previous monolithic lib/api.ts.
 */

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

export interface PurchaseHistoryRow {
  readonly id: string;
  readonly listingId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: 'initiated' | 'paid' | 'failed' | 'refunded';
  readonly purchasedAtMs: number;
}

export const BOOTSTRAP_PURCHASES: ReadonlyArray<PurchaseHistoryRow> = [];

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`purchase-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function listPurchaseHistory(
  buyerId: string,
): Promise<ReadonlyArray<PurchaseHistoryRow>> {
  try {
    const json = await apiFetch<{ rows?: PurchaseHistoryRow[] }>(
      `/v1/marketplace/purchases?buyer_id=${encodeURIComponent(buyerId)}`,
    );
    return json.rows ?? [];
  } catch {
    return [];
  }
}
