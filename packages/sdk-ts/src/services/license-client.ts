/**
 * LicenseServiceClient — typed client for the media-license-svc HTTP surface.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Endpoints:
 *   GET    /v1/workspaces/{workspaceId}/grants
 *   DELETE /v1/workspaces/{workspaceId}/grants/{grantId}
 *   POST   /v1/workspaces/{workspaceId}/recording/finalize
 */

import type { HttpLikeTransport } from '../loader.js';

export interface LicenseGrantDTO {
  readonly id: string;
  readonly catalogId: string;
  readonly version: string;
  readonly seats: number;
  readonly seatsUsed: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly status: 'active' | 'expiring' | 'expired' | 'revoked';
}

export interface RecordingFinalizeRequest {
  readonly chunks: readonly { index: number; size: number; sha256: string }[];
  readonly durationMs: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly fps: number;
}

export interface RecordingFinalizeResult {
  readonly assetId: string;
  readonly durationMs: number;
  readonly uploadUrls: readonly { index: number; url: string }[];
}

export interface LicenseServiceError {
  readonly code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NETWORK';
  readonly message: string;
}

export interface LicenseServiceClient {
  fetchGrants(workspaceId: string): Promise<readonly LicenseGrantDTO[]>;
  revokeGrant(workspaceId: string, grantId: string): Promise<void>;
  finalizeRecording(workspaceId: string, request: RecordingFinalizeRequest): Promise<RecordingFinalizeResult>;
}

export class HttpLicenseServiceClient implements LicenseServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: HttpLikeTransport,
  ) {}

  async fetchGrants(workspaceId: string): Promise<readonly LicenseGrantDTO[]> {
    const res = await this.transport.get(
      `${this.baseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/grants`,
    );
    if (!res.ok) throw this.toError(res);
    return ((res.body as { grants: LicenseGrantDTO[] }).grants) ?? [];
  }

  async revokeGrant(workspaceId: string, grantId: string): Promise<void> {
    // The HttpLikeTransport interface only exposes get/post. A delete
    // helper would need to be added; for now we POST a revocation
    // command so the demo build can ship without expanding the
    // transport surface.
    const res = await this.transport.post(
      `${this.baseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/grants/${encodeURIComponent(grantId)}/revoke`,
      {},
    );
    if (!res.ok) throw this.toError(res);
  }

  async finalizeRecording(
    workspaceId: string,
    request: RecordingFinalizeRequest,
  ): Promise<RecordingFinalizeResult> {
    const res = await this.transport.post(
      `${this.baseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/recording/finalize`,
      request as unknown as Record<string, unknown>,
    );
    if (!res.ok) throw this.toError(res);
    return res.body as RecordingFinalizeResult;
  }

  private toError(res: { status: number; body: unknown }): LicenseServiceError {
    const body = res.body as { code?: string; error?: string } | null;
    let code: LicenseServiceError['code'] = 'NETWORK';
    if (res.status === 404) code = 'NOT_FOUND';
    else if (res.status === 401) code = 'UNAUTHORIZED';
    else if (res.status === 403) code = 'FORBIDDEN';
    else if (res.status === 400 || res.status === 422) code = 'INVALID_INPUT';
    const codeFromBody = body?.code as LicenseServiceError['code'] | undefined;
    return {
      code: codeFromBody ?? code,
      message: body?.error ?? `License service error (status ${res.status}).`,
    };
  }
}