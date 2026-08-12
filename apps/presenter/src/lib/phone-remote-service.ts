/**
 * Phone-remote service — list paired devices for a session.
 *
 * Per Wave 4 §S4.2 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Today: thin wrapper over `fetch` for the GET endpoint. Will be
 * replaced by the typed SDK client once it lands.
 */

export interface PairedDevice {
  readonly device_id: string;
  readonly display_name: string;
  readonly connected_at_ms: number;
  readonly supports_haptics: boolean;
}

export class PhoneRemoteServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PhoneRemoteServiceError';
  }
}

export interface PhoneRemoteServiceOptions {
  readonly apiBaseUrl?: string;
}

export class PhoneRemoteService {
  private readonly apiBaseUrl: string;

  constructor(opts: PhoneRemoteServiceOptions = {}) {
    this.apiBaseUrl = opts.apiBaseUrl ?? '';
  }

  async listDevices(token: string): Promise<readonly PairedDevice[]> {
    const url = `${this.apiBaseUrl}/api/presenter/sessions/pairing/${encodeURIComponent(token)}/devices`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new PhoneRemoteServiceError(
        e instanceof Error ? e.message : 'Network error',
        0,
      );
    }
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new PhoneRemoteServiceError(`HTTP ${res.status}`, res.status);
    }
    const data = (await res.json()) as { devices?: PairedDevice[] };
    return data.devices ?? [];
  }
}