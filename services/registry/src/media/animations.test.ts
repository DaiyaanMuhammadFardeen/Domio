import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, DEFAULT_LIMITS, type ServiceDeps } from '../deps.js';
import {
  validateLottie,
  sanitizeLottie,
  recolorLottie,
  gifTranscodeRequest,
} from './animations.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

function makeValidLottie(): Record<string, unknown> {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 1920,
    h: 1080,
    layers: [
      {
        ty: 4,
        nm: 'Shape Layer',
        shapes: [
          {
            ty: 'fl',
            c: { k: [1, 0, 0, 1] },
          },
        ],
      },
    ],
  };
}

describe('animations', () => {
  describe('validateLottie', () => {
    it('accepts valid Lottie JSON', () => {
      const result = validateLottie(makeValidLottie());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object input', () => {
      expect(validateLottie(null).valid).toBe(false);
      expect(validateLottie('string').valid).toBe(false);
      expect(validateLottie(42).valid).toBe(false);
      expect(validateLottie([1, 2, 3]).valid).toBe(false);
    });

    it('rejects missing version field', () => {
      const json = makeValidLottie();
      delete json.v;
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"v"'))).toBe(true);
    });

    it('rejects missing layers field', () => {
      const json = makeValidLottie();
      delete json.layers;
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"layers"'))).toBe(true);
    });

    it('rejects layer count exceeding max', () => {
      const json = makeValidLottie();
      json.layers = Array.from({ length: 600 }, (_, i) => ({ ty: 4, nm: `layer-${i}` }));
      const result = validateLottie(json, { maxLayers: 500 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Layer count'))).toBe(true);
    });

    it('rejects expression key (dangerous script feature)', () => {
      const json = makeValidLottie();
      json.expression = 'this.value * 2';
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('expression'))).toBe(true);
    });

    it('rejects __proto__ key (prototype pollution)', () => {
      // Use JSON.parse to create an object that actually has __proto__ as an own property
      const json = JSON.parse(JSON.stringify(makeValidLottie()));
      Object.defineProperty(json, '__proto__', {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('__proto__'))).toBe(true);
    });

    it('rejects constructor key (prototype pollution)', () => {
      const json = JSON.parse(JSON.stringify(makeValidLottie()));
      Object.defineProperty(json, 'constructor', {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('constructor'))).toBe(true);
    });

    it('rejects frame rate > 120', () => {
      const json = makeValidLottie();
      json.fr = 240;
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Frame rate'))).toBe(true);
    });

    it('checks size budget', () => {
      const json = makeValidLottie();
      const result = validateLottie(json, { maxBytes: 10 }); // Very small budget
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('JSON size'))).toBe(true);
    });

    it('expression inside nested layers is detected', () => {
      const json = makeValidLottie();
      json.layers = [
        {
          ty: 4,
          nm: 'Layer',
          expression: 'this.value',
        },
      ];
      const result = validateLottie(json);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('expression'))).toBe(true);
    });
  });

  describe('sanitizeLottie', () => {
    it('strips expression keys', () => {
      const json = {
        v: '5.7.4',
        layers: [
          { ty: 4, nm: 'Shape', expression: 'this.value', keyframes: [1, 2, 3] },
        ],
      };
      const sanitized = sanitizeLottie(json);
      expect(sanitized.layers).toBeDefined();
      const layers = sanitized.layers as Array<Record<string, unknown>>;
      expect(layers[0]!.expression).toBeUndefined();
      expect(layers[0]!.keyframes).toEqual([1, 2, 3]);
    });

    it('renames __proto__ to _proto', () => {
      // Use JSON.parse so __proto__ becomes an actual own property
      const json = JSON.parse('{"v":"5.7.4","__proto__":{"polluted":true},"layers":[]}');
      const sanitized = sanitizeLottie(json);
      expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
      expect(sanitized._proto).toEqual({ polluted: true });
    });

    it('renames constructor to _proto', () => {
      // Use JSON.parse so constructor becomes an actual own property
      const json = JSON.parse('{"v":"5.7.4","constructor":{"polluted":true},"layers":[]}');
      const sanitized = sanitizeLottie(json);
      expect(Object.prototype.hasOwnProperty.call(sanitized, 'constructor')).toBe(false);
      expect(sanitized._proto).toEqual({ polluted: true });
    });

    it('drops ae metadata keys', () => {
      const json = { v: '5.7.4', ae: 'metadata', layers: [] };
      const sanitized = sanitizeLottie(json);
      expect(sanitized.ae).toBeUndefined();
    });

    it('keeps w/h overrides', () => {
      const json = { v: '5.7.4', w: 1920, h: 1080, layers: [] };
      const sanitized = sanitizeLottie(json);
      expect(sanitized.w).toBe(1920);
      expect(sanitized.h).toBe(1080);
    });

    it('deep copies — does not mutate original', () => {
      const json = { v: '5.7.4', layers: [{ expression: 'bad' }] };
      sanitizeLottie(json);
      const layers = json.layers as Array<Record<string, unknown>>;
      expect(layers[0]!.expression).toBe('bad');
    });
  });

  describe('recolorLottie', () => {
    it('replaces matching fill color array', () => {
      const json = makeValidLottie();
      const result = recolorLottie(json, {
        from: [1, 0, 0, 1],
        to: [0, 1, 0, 1],
      });
      const layers = result.layers as Array<Record<string, unknown>>;
      const shape = (layers[0]!.shapes as Array<Record<string, unknown>>)[0]!;
      const colorGroup = shape.c as Record<string, unknown>;
      expect(colorGroup.k).toEqual([0, 1, 0, 1]);
    });

    it('does not replace non-matching color', () => {
      const json = makeValidLottie();
      const result = recolorLottie(json, {
        from: [0, 0, 1, 1],
        to: [1, 1, 0, 1],
      });
      const layers = result.layers as Array<Record<string, unknown>>;
      const shape = (layers[0]!.shapes as Array<Record<string, unknown>>)[0]!;
      const colorGroup = shape.c as Record<string, unknown>;
      expect(colorGroup.k).toEqual([1, 0, 0, 1]); // unchanged
    });

    it('does not mutate original', () => {
      const json = makeValidLottie();
      recolorLottie(json, { from: [1, 0, 0, 1], to: [0, 1, 0, 1] });
      const layers = json.layers as Array<Record<string, unknown>>;
      const shape = (layers[0]!.shapes as Array<Record<string, unknown>>)[0]!;
      const colorGroup = shape.c as Record<string, unknown>;
      expect(colorGroup.k).toEqual([1, 0, 0, 1]);
    });

    it('skips non-shape layers (ty !== 4)', () => {
      const json = {
        v: '5.7.4',
        layers: [
          {
            ty: 1, // text layer
            nm: 'Text',
            shapes: [{ ty: 'fl', c: { k: [1, 0, 0, 1] } }],
          },
        ],
      };
      const result = recolorLottie(json, {
        from: [1, 0, 0, 1],
        to: [0, 1, 0, 1],
      });
      const layers = result.layers as Array<Record<string, unknown>>;
      const shape = (layers[0]!.shapes as Array<Record<string, unknown>>)[0]!;
      const colorGroup = shape.c as Record<string, unknown>;
      expect(colorGroup.k).toEqual([1, 0, 0, 1]); // unchanged
    });
  });

  describe('gifTranscodeRequest', () => {
    it('returns correct default shape', () => {
      const deps = makeDeps();
      const result = gifTranscodeRequest(deps, {
        gifUrl: 'https://example.com/animation.gif',
      });
      expect(result.inputUrl).toBe('https://example.com/animation.gif');
      expect(result.outputFormat).toBe('webm');
      expect(result.fps).toBe(30);
      expect(result.loop).toBe(true);
      expect(typeof result.estimatedSizeKb).toBe('number');
    });

    it('uses custom fps and loop', () => {
      const deps = makeDeps();
      const result = gifTranscodeRequest(deps, {
        gifUrl: 'https://example.com/animation.gif',
        fps: 15,
        loop: false,
      });
      expect(result.fps).toBe(15);
      expect(result.loop).toBe(false);
    });

    it('sets budgetWarning when estimated size exceeds budget', () => {
      const deps = makeDeps({ limits: { ...DEFAULT_LIMITS, gifBudgetKb: 1 } }); // Very small budget
      const result = gifTranscodeRequest(deps, {
        gifUrl: 'https://example.com/animation.gif',
      });
      expect(result.budgetWarning).toBe(true);
    });

    it('does not set budgetWarning when within budget', () => {
      const deps = makeDeps({ limits: { ...DEFAULT_LIMITS, gifBudgetKb: 100000 } });
      const result = gifTranscodeRequest(deps, {
        gifUrl: 'https://example.com/animation.gif',
      });
      expect(result.budgetWarning).toBeUndefined();
    });
  });
});
