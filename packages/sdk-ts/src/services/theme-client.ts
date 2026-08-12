/**
 * ThemeServiceClient — typed client for the theme-svc HTTP surface.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Maps directly to the `services/theme/src/handlers.ts` endpoints.
 * The interface is the public API; the HTTP-backed implementation
 * lives in `HttpThemeServiceClient`. Tests use the in-memory
 * `InMemoryThemeServiceClient`.
 */

export interface ThemeRecord {
  readonly themeId: string;
  readonly orgId: string;
  readonly name: string;
  readonly kind: 'light' | 'dark';
  readonly tokens: Readonly<Record<string, string>>;
  readonly createdAt: number;
  readonly createdBy: string;
}

export interface BrandKitRecord {
  readonly brandKitId: string;
  readonly orgId: string;
  readonly name: string;
  readonly primaryHex: string;
  readonly accentHex: string;
  readonly createdAt: number;
}

export interface A11yAuditFindingDTO {
  readonly severity: 'INFO' | 'WARN' | 'ERROR';
  readonly tokenId: string;
  readonly issue: string;
  readonly suggestion: string;
}

export interface ThemeServiceClient {
  /** GET /v1/orgs/{orgId}/themes */
  listThemes(orgId: string): Promise<readonly ThemeRecord[]>;
  /** GET /v1/orgs/{orgId}/themes/{themeId} */
  getTheme(orgId: string, themeId: string): Promise<ThemeRecord>;
  /** POST /v1/orgs/{orgId}/brand-kits */
  createBrandKit(input: {
    orgId: string;
    name: string;
    primaryHex: string;
    accentHex: string;
  }): Promise<BrandKitRecord>;
  /** GET /v1/orgs/{orgId}/brand-kits */
  listBrandKits(orgId: string): Promise<readonly BrandKitRecord[]>;
  /** POST /v1/orgs/{orgId}/brand-kits/{brandKitId}/audit-a11y */
  auditA11y(input: {
    orgId: string;
    brandKitId: string;
    tokens: Readonly<Record<string, string>>;
  }): Promise<readonly A11yAuditFindingDTO[]>;
}

/**
 * Error returned by the theme service. Maps to the `HttpResponse`
 * shape used by services/theme.
 */
export interface ThemeServiceError {
  readonly code:
    | 'NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'INVALID_INPUT'
    | 'NETWORK';
  readonly message: string;
  readonly details?: unknown;
}
