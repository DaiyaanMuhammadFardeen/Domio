import type { RegistryStore } from './store/interface.js';

export interface ServiceLimits {
  maxPackageBytes: number;
  maxPropsPerSchema: number;
  signedUrlTtlMs: number;
  offlineGraceMs: number;
  minPayoutCents: number;
  feeBps: number;
  maxIconsPerQuery: number;
  gifBudgetKb: number;
}

export interface ServiceDeps {
  store: RegistryStore;
  now?: () => number;
  licenseSecret: string;
  signUrlSecret: string;
  bundleBaseUrl: string;
  limits: ServiceLimits;
  http?: typeof fetch;
  ulid?: () => string;
}

export const DEFAULT_LIMITS: ServiceLimits = {
  maxPackageBytes: 32 * 1024 * 1024,
  maxPropsPerSchema: 40,
  signedUrlTtlMs: 5 * 60 * 1000,
  offlineGraceMs: 30 * 24 * 60 * 60 * 1000,
  minPayoutCents: 1000,
  feeBps: 300, // 3% marketplace fee
  maxIconsPerQuery: 200,
  gifBudgetKb: 5000,
};

export function defaultDeps(store: RegistryStore, overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return {
    store,
    licenseSecret: overrides.licenseSecret ?? 'test-license-secret',
    signUrlSecret: overrides.signUrlSecret ?? 'test-sign-url-secret',
    bundleBaseUrl: overrides.bundleBaseUrl ?? 'https://bundles.domio.test',
    limits: { ...DEFAULT_LIMITS, ...overrides.limits },
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.http ? { http: overrides.http } : {}),
    ...(overrides.ulid ? { ulid: overrides.ulid } : {}),
  };
}

export function nowMs(deps: ServiceDeps): number {
  return deps.now ? deps.now() : Date.now();
}
