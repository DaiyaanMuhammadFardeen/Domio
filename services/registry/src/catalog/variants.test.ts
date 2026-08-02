import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { resolveVariant, listVariantChoices } from './variants.js';
import type { ComponentPackage, ComponentVariant } from '../store/types.js';

function makeDeps(): ServiceDeps {
  return defaultDeps(new InMemoryStore());
}

function makePkg(overrides: Partial<ComponentPackage> & { catalogId: string; version: string }): ComponentPackage {
  return {
    id: `${overrides.catalogId}:${overrides.version}`,
    kind: 'component',
    name: 'Test',
    description: '',
    propsSchema: { type: 'object', properties: {} },
    variants: [],
    files: {},
    packageHash: '',
    sizeBudgetBytes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('variants', () => {
  describe('resolveVariant', () => {
    it('returns master default when no variants', () => {
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants: [] });
      const result = resolveVariant(makeDeps(), { pkg });
      expect(result.variantId).toBe('default');
      expect(result.label).toBe('Default');
      expect(result.tokens).toEqual({});
    });

    it('returns first variant as master', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default Variant', tokens: { color: 'blue' } },
        { id: 'v2', label: 'Compact', tokens: { color: 'red' } },
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg });
      expect(result.variantId).toBe('v1');
      expect(result.label).toBe('Default Variant');
      expect(result.tokens).toEqual({ color: 'blue' });
    });

    it('instance override picks exact variant', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: { color: 'blue' } },
        { id: 'v2', label: 'Compact', tokens: { color: 'red' } },
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg, requestedVariantId: 'v2' });
      expect(result.variantId).toBe('v2');
      expect(result.label).toBe('Compact');
    });

    it('instance override falls back to master when variant not found', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: { color: 'blue' } },
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg, requestedVariantId: 'nonexistent' });
      expect(result.variantId).toBe('v1');
    });

    it('variant matrix matches when conditions', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: { color: 'blue' } } as ComponentVariant,
        { id: 'v2', label: 'Compact', tokens: { color: 'red' }, when: { size: 'compact' } } as ComponentVariant,
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg, props: { size: 'compact' } });
      expect(result.variantId).toBe('v2');
    });

    it('variant matrix ignores non-matching conditions', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: { color: 'blue' } } as ComponentVariant,
        { id: 'v2', label: 'Compact', tokens: { color: 'red' }, when: { size: 'compact' } } as ComponentVariant,
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg, props: { size: 'large' } });
      expect(result.variantId).toBe('v1');
    });

    it('variant matrix skipped when requestedVariantId is set', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: {} } as ComponentVariant,
        { id: 'v2', label: 'Compact', tokens: {}, when: { size: 'compact' } } as ComponentVariant,
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = resolveVariant(makeDeps(), { pkg, requestedVariantId: 'v1', props: { size: 'compact' } });
      expect(result.variantId).toBe('v1');
    });

    it('applies props defaults via applyDefaults', () => {
      const pkg = makePkg({
        catalogId: 'a.b',
        version: '1.0.0',
        variants: [],
        propsSchema: {
          type: 'object',
          properties: {
            label: { type: 'string', default: 'Hello' },
          },
        },
      });
      const result = resolveVariant(makeDeps(), { pkg, props: {} });
      expect(result.props).toHaveProperty('label', 'Hello');
    });

    it('returns empty tokens when no matching variant', () => {
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants: [{ id: 'v1', label: 'V1', tokens: {} }] });
      const result = resolveVariant(makeDeps(), { pkg });
      expect(result.tokens).toEqual({});
    });
  });

  describe('listVariantChoices', () => {
    it('returns empty for no variants', () => {
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants: [] });
      expect(listVariantChoices(pkg)).toEqual([]);
    });

    it('maps variants to id/label pairs', () => {
      const variants: ComponentVariant[] = [
        { id: 'v1', label: 'Default', tokens: {} },
        { id: 'v2', label: 'Compact', tokens: {} },
      ];
      const pkg = makePkg({ catalogId: 'a.b', version: '1.0.0', variants });
      const result = listVariantChoices(pkg);
      expect(result).toEqual([
        { id: 'v1', label: 'Default' },
        { id: 'v2', label: 'Compact' },
      ]);
    });
  });
});
