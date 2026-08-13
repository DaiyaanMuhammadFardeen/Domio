/**
 * HttpThemeServiceClient — HTTP-backed implementation of the
 * ThemeServiceClient interface.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Endpoints:
 *   GET    /v1/orgs/{orgId}/themes
 *   GET    /v1/orgs/{orgId}/themes/{themeId}
 *   POST   /v1/orgs/{orgId}/brand-kits
 *   GET    /v1/orgs/{orgId}/brand-kits
 *   POST   /v1/orgs/{orgId}/brand-kits/{brandKitId}/audit-a11y
 */

import type {
  ThemeServiceClient,
  ThemeRecord,
  BrandKitRecord,
  A11yAuditFindingDTO,
  ThemeServiceError,
} from './theme-client.js';
import type { HttpLikeTransport } from '../loader.js';

export class HttpThemeServiceClient implements ThemeServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: HttpLikeTransport,
  ) {}

  async listThemes(orgId: string): Promise<readonly ThemeRecord[]> {
    const res = await this.transport.get(
      `${this.baseUrl}/v1/orgs/${encodeURIComponent(orgId)}/themes`,
    );
    this.throwIfError(res);
    return (res.body as { themes: ThemeRecord[] }).themes ?? [];
  }

  async getTheme(orgId: string, themeId: string): Promise<ThemeRecord> {
    const res = await this.transport.get(
      `${this.baseUrl}/v1/orgs/${encodeURIComponent(orgId)}/themes/${encodeURIComponent(themeId)}`,
    );
    this.throwIfError(res);
    return res.body as ThemeRecord;
  }

  async createBrandKit(input: {
    orgId: string;
    name: string;
    primaryHex: string;
    accentHex: string;
  }): Promise<BrandKitRecord> {
    const res = await this.transport.post(
      `${this.baseUrl}/v1/orgs/${encodeURIComponent(input.orgId)}/brand-kits`,
      { name: input.name, primaryHex: input.primaryHex, accentHex: input.accentHex },
    );
    this.throwIfError(res);
    return res.body as BrandKitRecord;
  }

  async listBrandKits(orgId: string): Promise<readonly BrandKitRecord[]> {
    const res = await this.transport.get(
      `${this.baseUrl}/v1/orgs/${encodeURIComponent(orgId)}/brand-kits`,
    );
    this.throwIfError(res);
    return (res.body as { brandKits: BrandKitRecord[] }).brandKits ?? [];
  }

  async auditA11y(input: {
    orgId: string;
    brandKitId: string;
    tokens: Readonly<Record<string, string>>;
  }): Promise<readonly A11yAuditFindingDTO[]> {
    const res = await this.transport.post(
      `${this.baseUrl}/v1/orgs/${encodeURIComponent(input.orgId)}/brand-kits/${encodeURIComponent(input.brandKitId)}/audit-a11y`,
      { tokens: input.tokens },
    );
    this.throwIfError(res);
    return (res.body as { findings: A11yAuditFindingDTO[] }).findings ?? [];
  }

  private throwIfError(res: { ok: boolean; status: number; body: unknown }): void {
    if (res.ok) return;
    const body = res.body as { code?: string; error?: string } | null;
    const statusCode = this.codeFromStatus(res.status);
    const codeFromBody = body?.code as ThemeServiceError['code'] | undefined;
    const code: ThemeServiceError['code'] = codeFromBody ?? statusCode;
    const message = body?.error ?? `Theme service error (status ${res.status}).`;
    const err: ThemeServiceError = { code, message };
    throw err;
  }

  private codeFromStatus(status: number): ThemeServiceError['code'] {
    if (status === 404) return 'NOT_FOUND';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 400 || status === 422) return 'INVALID_INPUT';
    return 'NETWORK';
  }
}
