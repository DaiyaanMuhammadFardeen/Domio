import { describe, it, expect } from 'vitest';
import { applyVariables, findVariableRefs } from './variables.js';

describe('variables', () => {
  describe('findVariableRefs', () => {
    it('finds no refs when no variables match', () => {
      const json = {
        layers: [{ ty: 4, nm: 'shape', p: { x: 100 } }],
      };
      const refs = findVariableRefs(json, ['progress']);
      expect(refs).toHaveLength(0);
    });

    it('finds refs matching ${varName} pattern', () => {
      const json = {
        layers: [
          {
            ty: 4,
            nm: 'shape',
            t: { k: ['${progress}', 'static'] },
          },
        ],
      };
      const refs = findVariableRefs(json, ['progress']);
      expect(refs).toHaveLength(1);
      expect(refs[0]!.variableName).toBe('progress');
      expect(refs[0]!.path).toBe('layers.0.t.k.0');
    });

    it('finds refs at multiple depths', () => {
      const json = {
        a: { b: { c: '${color}' } },
        d: ['${color}', '${size}'],
      };
      const refs = findVariableRefs(json, ['color', 'size']);
      // 3 refs: a.b.c→color, d.0→color, d.1→size
      expect(refs).toHaveLength(3);
      const paths = refs.map(r => r.path).sort();
      expect(paths).toEqual(['a.b.c', 'd.0', 'd.1']);
    });

    it('does not match partial references', () => {
      const json = {
        val: 'prefix-${progress}suffix',
        exact: '${progress}',
      };
      const refs = findVariableRefs(json, ['progress']);
      // Only "exact" matches — prefix/suffix is not a pure ${var} reference
      expect(refs).toHaveLength(1);
      expect(refs[0]!.path).toBe('exact');
    });
  });

  describe('applyVariables', () => {
    it('applies a single variable override', () => {
      const json: Record<string, unknown> = {
        layers: [
          {
            ty: 4,
            nm: 'shape',
            t: { k: '${progress}' },
          },
        ],
      };

      const vars = new Map([['progress', 0.5]]);
      const overrides = applyVariables(json, vars);

      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.variableName).toBe('progress');
      expect(overrides[0]!.value).toBe(0.5);
      const first = (json.layers as Array<Record<string, unknown>>)[0];
      const tObj = first?.['t'] as Record<string, unknown>;
      expect(tObj?.['k']).toBe(0.5);
    });

    it('applies multiple variables in one call', () => {
      const json: Record<string, unknown> = {
        r: '${rotation}',
        s: '${scale}',
      };

      const vars = new Map([
        ['rotation', 45],
        ['scale', 1.5],
      ]);

      const overrides = applyVariables(json, vars);
      expect(overrides).toHaveLength(2);
      expect(json.r).toBe(45);
      expect(json.s).toBe(1.5);
    });

    it('returns empty when no matching variables', () => {
      const json: Record<string, unknown> = {
        layers: [{ ty: 4, nm: 'shape' }],
      };
      const vars = new Map([['unrelated', 42]]);
      const overrides = applyVariables(json, vars);
      expect(overrides).toHaveLength(0);
      // Original unchanged
      expect(json.layers).toEqual([{ ty: 4, nm: 'shape' }]);
    });

    it('handles nested array variable refs', () => {
      const json: Record<string, unknown> = {
        keyframes: ['${t1}', 100, '${t2}'],
      };
      const vars = new Map([
        ['t1', 0],
        ['t2', 1],
      ]);

      applyVariables(json, vars);
      expect(json.keyframes).toEqual([0, 100, 1]);
    });

    it('does not crash on complex deeply nested structures', () => {
      const json: Record<string, unknown> = {
        a: { b: { c: { d: { e: '${deep}' } } } },
      };
      const vars = new Map([['deep', 999]]);
      const overrides = applyVariables(json, vars);
      expect(overrides).toHaveLength(1);
      const a = json['a'] as Record<string, unknown>;
      const b = a?.['b'] as Record<string, unknown>;
      const c = b?.['c'] as Record<string, unknown>;
      const d = c?.['d'] as Record<string, unknown>;
      expect(d?.['e']).toBe(999);
    });
  });
});
