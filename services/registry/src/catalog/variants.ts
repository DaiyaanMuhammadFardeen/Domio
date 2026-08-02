import type { ComponentPackage, ComponentVariant } from '../store/types.js';
import type { ServiceDeps } from '../deps.js';
import { applyDefaults, type DomioPropsSchema } from '@domio/schema-prop';

/**
 * Variant resolution precedence (per P06 contract):
 *   1. instance override (requestedVariantId)
 *   2. variant matrix (variant whose `when` conditions match current props)
 *   3. master defaults (first declared variant)
 */

export interface ResolveVariantInput {
  pkg: ComponentPackage;
  requestedVariantId?: string;
  props?: Record<string, unknown>;
}

export interface ResolvedVariant {
  variantId: string;
  label: string;
  tokens: Record<string, string>;
  props: Record<string, unknown>;
}

export function resolveVariant(_deps: ServiceDeps, input: ResolveVariantInput): ResolvedVariant {
  const { pkg, requestedVariantId, props } = input;
  const variants = pkg.variants ?? [];
  const master = variants[0];
  const propsWithDefaults = applyDefaults(pkg.propsSchema as unknown as DomioPropsSchema, props ?? {});

  // 3. master defaults
  let chosen: ComponentVariant | undefined = master;
  let source = 'master';

  // 2. variant matrix — first variant whose `when` conditions match the props
  if (!requestedVariantId) {
    for (const v of variants) {
      const when = (v as ComponentVariant & { when?: Record<string, unknown> }).when;
      if (when && matchesWhen(when, propsWithDefaults)) {
        chosen = v;
        source = 'matrix';
        break;
      }
    }
  }

  // 1. instance override
  if (requestedVariantId) {
    const byId = variants.find((v) => v.id === requestedVariantId);
    if (byId) {
      chosen = byId;
      source = 'instance';
    }
  }

  return {
    variantId: chosen?.id ?? master?.id ?? 'default',
    label: chosen?.label ?? master?.label ?? 'Default',
    tokens: chosen?.tokens ?? {},
    props: propsWithDefaults,
    ...({ _source: source } as object),
  };
}

function matchesWhen(when: Record<string, unknown>, props: Record<string, unknown>): boolean {
  return Object.entries(when).every(([key, expected]) => props[key] === expected);
}

export function listVariantChoices(pkg: ComponentPackage): { id: string; label: string }[] {
  return (pkg.variants ?? []).map((v) => ({ id: v.id, label: v.label }));
}
