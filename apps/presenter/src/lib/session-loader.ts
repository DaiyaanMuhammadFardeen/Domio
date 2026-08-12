/**
 * session-loader — server-side fetchers for the presenter session page.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Two server-component loaders: one for the session state, one for the
 * pairing info. Both delegate to the same SessionClient on the wire.
 */

import type { PresenterSessionState, PairingInfo } from '../runtime/types';

const PRESENTER_API = process.env['PRESENTER_API_BASE_URL'] ?? '';
const PHONE_PAIRING_API = process.env['PHONE_PAIRING_API_BASE_URL'] ?? '';

/**
 * Fetch the latest presenter session state for SSR.
 * Returns null if the session is not found or the service is unreachable.
 */
export async function fetchSessionForSsr(id: string): Promise<PresenterSessionState | null> {
  try {
    const res = await fetch(`${PRESENTER_API}/api/v1/presenter/sessions/${id}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PresenterSessionState;
  } catch {
    return null;
  }
}

/**
 * Fetch the pairing info for SSR. Returns an empty pairing descriptor
 * when the service is unreachable — the client will refetch on mount.
 */
export async function fetchPairingForSsr(id: string): Promise<PairingInfo> {
  try {
    const res = await fetch(`${PHONE_PAIRING_API}/api/v1/presenter/sessions/${id}/pairing`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) return (await res.json()) as PairingInfo;
  } catch {
    /* fall through to placeholder */
  }
  return {
    token: '',
    deep_link: 'domio://pair?token=…',
    epoch: 0,
    expires_at_ms: Date.now() + 60_000,
    paired_devices: 0,
  };
}
