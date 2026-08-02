import { validateProps } from '@domio/schema-prop';
import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { canonicalHash, sha256Hex } from '../crypto/index.js';
import { isSemver } from '../util/semver.js';
import type { ComponentPackage, ComponentVariant } from '../store/types.js';

const CATALOG_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export interface PublishPackageInput {
  catalogId: string;
  version: string;
  kind: 'component' | 'icon' | 'sticker' | 'animation';
  name: string;
  description?: string;
  category?: string;
  author?: string;
  licenseId?: string;
  propsSchema?: Record<string, unknown>;
  variants?: ComponentVariant[];
  /** logical file name -> sha256 of the blob stored in the bundle store */
  files?: Record<string, string>;
  packageHash?: string;
  signingKeyId?: string;
  signature?: string;
  sizeBudgetBytes?: number;
}

function validateCatalogId(catalogId: string): void {
  if (!CATALOG_ID_PATTERN.test(catalogId)) {
    throw Errors.validation(`Invalid catalogId "${catalogId}" (expected namespaced lowercase slug)`);
  }
}

/** Validate the props schema and return the smart-prop denormalization. */
export function validatePropsSchema(schema: Record<string, unknown> | undefined, maxProps: number): {
  schema: Record<string, unknown>;
  props: { propKey: string; propSchema: Record<string, unknown>; controlHint?: string; required: boolean; default?: unknown }[];
} {
  if (!schema || typeof schema !== 'object') return { schema: { type: 'object', properties: {} }, props: [] };
  const { valid, errors } = validateProps(schema as never, {});
  if (!valid) {
    throw Errors.validation('props_schema failed structural validation', errors.slice(0, 3));
  }
  const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const keys = Object.keys(properties);
  if (keys.length > maxProps) {
    throw Errors.validation(`props_schema exceeds ${maxProps} properties`);
  }
  const required = new Set<string>((schema.required as string[] | undefined) ?? []);
  const props = keys.map((key) => {
    const frag = properties[key]!;
    const x = frag['x-domio-prop'] as Record<string, unknown> | undefined;
    return {
      propKey: key,
      propSchema: frag,
      ...(typeof x?.control === 'string' ? { controlHint: x.control } : {}),
      required: required.has(key),
      ...(Object.prototype.hasOwnProperty.call(frag, 'default') ? { default: frag.default } : {}),
    };
  });
  return { schema, props };
}

export interface PublishResult {
  pkg: ComponentPackage;
  created: boolean;
}

/**
 * Publish a component package. Verifies:
 *  - manifest shape (catalogId, semver version, kind, props schema)
 *  - every referenced file blob exists in the bundle store and matches its
 *    sha256 (content-addressed integrity)
 *  - the declared packageHash matches the canonical body (tamper detection)
 */
export async function publishPackage(deps: ServiceDeps, input: PublishPackageInput): Promise<PublishResult> {
  const store = deps.store;
  validateCatalogId(input.catalogId);
  if (!isSemver(input.version)) {
    throw Errors.validation(`Invalid semver version "${input.version}"`);
  }
  const existing = await store.getPackage(input.catalogId, input.version);
  const id = existing?.id ?? (deps.ulid ? deps.ulid() : `${input.catalogId}:${input.version}`);

  // Content-addressed file verification: each file hash must exist as a blob.
  const files = input.files ?? {};
  for (const [name, hash] of Object.entries(files)) {
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      throw Errors.validation(`File "${name}" has an invalid sha256 hash`);
    }
    const blob = await store.getBlob(hash);
    if (!blob) throw Errors.validation(`Missing bundle blob for "${name}"`);
    const actual = sha256Hex(blob.bytes);
    if (actual !== hash) throw Errors.tampered(`Blob "${name}" failed hash verification`);
  }

  const body = {
    catalogId: input.catalogId,
    version: input.version,
    kind: input.kind,
    name: input.name,
    propsSchema: input.propsSchema,
    variants: input.variants,
    files,
  };
  const computedHash = canonicalHash(body);
  if (input.packageHash && input.packageHash !== computedHash) {
    throw Errors.tampered('packageHash does not match the package body');
  }

  const { schema, props } = validatePropsSchema(input.propsSchema, deps.limits.maxPropsPerSchema);

  const now = Date.now();
  const pkg: ComponentPackage = {
    id,
    catalogId: input.catalogId,
    version: input.version,
    kind: input.kind,
    name: input.name,
    description: input.description ?? '',
    ...(input.category ? { category: input.category } : {}),
    ...(input.author ? { author: input.author } : {}),
    ...(input.licenseId ? { licenseId: input.licenseId } : {}),
    propsSchema: schema,
    variants: input.variants ?? [],
    files,
    packageHash: input.packageHash ?? computedHash,
    ...(input.signingKeyId ? { signingKeyId: input.signingKeyId } : {}),
    ...(input.signature ? { signature: input.signature } : {}),
    deprecation: existing?.deprecation ?? null,
    sizeBudgetBytes: input.sizeBudgetBytes ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await store.putPackage(pkg);
  await store.putSmartProps(id, props);
  return { pkg, created: !existing };
}

export async function getPackage(
  deps: ServiceDeps,
  catalogId: string,
  version: string,
): Promise<ComponentPackage> {
  const pkg = await deps.store.getPackage(catalogId, version);
  if (!pkg) throw Errors.notFound(`component ${catalogId}@${version}`);
  return pkg;
}

export async function getPackageOrNull(
  deps: ServiceDeps,
  catalogId: string,
  version: string,
): Promise<ComponentPackage | undefined> {
  return deps.store.getPackage(catalogId, version);
}

export async function listVersions(deps: ServiceDeps, catalogId: string): Promise<ComponentPackage[]> {
  return deps.store.listVersions(catalogId);
}

export async function searchPackages(
  deps: ServiceDeps,
  query: string,
  opts?: { kind?: string; limit?: number },
): Promise<ComponentPackage[]> {
  return deps.store.searchPackages(query, {
    ...(opts?.kind ? { kind: opts.kind } : {}),
    ...(opts?.limit ? { limit: opts.limit } : {}),
  });
}

export interface DeprecateInput {
  catalogId: string;
  version?: string;
  reason: string;
  replaceWith?: string;
}

export async function deprecatePackage(deps: ServiceDeps, input: DeprecateInput): Promise<ComponentPackage> {
  const versions = await deps.store.listVersions(input.catalogId);
  if (!versions.length) throw Errors.notFound(`component ${input.catalogId}`);
  const targets = input.version ? versions.filter((v) => v.version === input.version) : versions;
  for (const target of targets) {
    target.deprecation = {
      reason: input.reason,
      ...(input.replaceWith ? { replaceWith: input.replaceWith } : {}),
      deprecatedAt: Date.now(),
    };
    target.updatedAt = Date.now();
    await deps.store.putPackage(target);
  }
  return targets[0]!;
}
