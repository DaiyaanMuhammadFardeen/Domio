import { describe, it, expect } from 'vitest';
import { validate } from './validate.js';
import type { DeckDocument, Element } from './generated/scene-graph.js';
import { asULID } from './generated/scene-graph.js';

const SLIDE_ID = asULID('01H00000000000000000000000');
const WORKSPACE_ID = asULID('01H00000000000000000000001');
const DECK_ID = asULID('01H00000000000000000000002');
const FRAME_ID = asULID('01H00000000000000000000003');
const TITLE_ID = asULID('01H00000000000000000000004');

function baseDeck(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 'tenant-1',
    workspaceId: WORKSPACE_ID,
    title: 'Example deck',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: FRAME_ID,
            semanticId: 'hero',
            type: 'frame',
            name: 'Hero',
            parentId: null,
            aspect: { ratioW: 16, ratioH: 9 },
          },
          {
            id: TITLE_ID,
            semanticId: 'title',
            type: 'text',
            name: 'Title',
            parentId: null,
            text: { content: 'Hello' },
          },
        ],
      },
    ],
  };
}

describe('validate', () => {
  it('accepts a well-formed v1 deck document', () => {
    const result = validate(baseDeck());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects malformed documents with descriptive errors', () => {
    const result = validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown layer types', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000099'),
      semanticId: 'bad',
      type: 'unknown' as 'frame',
      name: 'Bad',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.type'))).toBe(true);
  });

  it('rejects duplicate element ids on a slide', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: FRAME_ID,
      semanticId: 'another_frame',
      type: 'frame',
      name: 'Another frame',
      parentId: null,
      aspect: { ratioW: 4, ratioH: 3 },
    });
    const result = validate(doc);
    expect(result.errors.some((e) => e.code === 'duplicate_id')).toBe(true);
  });

  it('rejects duplicate element semantic ids on a slide', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000098'),
      semanticId: 'title',
      type: 'text',
      name: 'Other title',
      parentId: null,
      text: { content: 'Same id' },
    });
    const result = validate(doc);
    expect(result.errors.some((e) => e.code === 'semantic_address_collision')).toBe(true);
  });

  it('rejects empty slides array', () => {
    const doc = baseDeck();
    doc.slides = [];
    const result = validate(doc);
    expect(result.valid).toBe(false);
  });

  it('accepts a component element with a valid ComponentRef', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000097'),
      semanticId: 'stat_card',
      type: 'component',
      name: 'Stat card',
      parentId: null,
      transform: { x: 100, y: 100, w: 320, h: 160, rotation: 0 },
      component: {
        catalogId: 'domio.stat-card',
        version: '1.0.0',
        variant: 'light',
        props: { value: 42, label: 'Revenue' },
      },
    });
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('accepts an element carrying the optional element_role magic-move key', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000098'),
      semanticId: 'hero_title',
      element_role: 'deck-title',
      type: 'frame',
      name: 'Hero title',
      parentId: null,
      aspect: { ratioW: 16, ratioH: 9 },
      transform: { x: 100, y: 100, w: 320, h: 160, rotation: 0 },
    });
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects a component element with a missing or malformed ComponentRef', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H00000000000000000000096'),
      semanticId: 'broken_stat',
      type: 'component',
      name: 'Broken stat',
      parentId: null,
      component: {
        catalogId: '',
        version: 'not-a-version',
        props: [] as unknown as Record<string, unknown>,
      },
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.component.version'))).toBe(true);
    expect(result.errors.some((e) => e.path.endsWith('.component.props'))).toBe(true);
  });

  it('enforces the schemaVersion on the structural validator by default', () => {
    const doc = { ...baseDeck(), schemaVersion: '0.9.0' };
    const result = validate(doc);
    expect(result.errors.some((e) => e.code === 'schema_version_mismatch')).toBe(true);
  });

  it('can be relaxed with ignoreVersion: true (used by the loader)', () => {
    const doc = { ...baseDeck(), schemaVersion: '0.9.0' };
    const result = validate(doc, { ignoreVersion: true });
    expect(result.valid).toBe(true);
  });
});

describe('validate — Phase 11 rich-media layer kinds', () => {
  it('accepts a model3d element with a modelAssetId', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A0'),
      semanticId: 'product_model',
      type: 'model3d',
      name: 'Product model',
      parentId: null,
      modelAssetId: 'model_asset_01',
      upAxis: 'z-up',
      autoRotate: true,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects a model3d element missing modelAssetId', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A1'),
      semanticId: 'broken_model',
      type: 'model3d',
      name: 'Broken model',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.modelAssetId'))).toBe(true);
  });

  it('rejects a model3d element with an invalid upAxis', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A2'),
      semanticId: 'bad_axis_model',
      type: 'model3d',
      name: 'Bad axis',
      parentId: null,
      modelAssetId: 'model_asset_01',
      upAxis: 'x-up' as unknown as 'y-up' | 'z-up',
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.upAxis'))).toBe(true);
  });

  it('accepts a video element with trim metadata and chapters', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A3'),
      semanticId: 'promo_video',
      type: 'video',
      name: 'Promo video',
      parentId: null,
      assetId: 'video_asset_01',
      trimInMs: 0,
      trimOutMs: 30000,
      speed: 1.5,
      chapters: [
        { timeMs: 5000, label: 'Intro' },
        { timeMs: 20000, label: 'Outro' },
      ],
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects a video element with trimOutMs before trimInMs', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A4'),
      semanticId: 'bad_trim',
      type: 'video',
      name: 'Bad trim',
      parentId: null,
      assetId: 'video_asset_01',
      trimInMs: 30000,
      trimOutMs: 5000,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.trimOutMs'))).toBe(true);
  });

  it('rejects a video element with out-of-range speed', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000A5'),
      semanticId: 'fast_video',
      type: 'video',
      name: 'Too fast',
      parentId: null,
      assetId: 'video_asset_01',
      speed: 8,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.speed'))).toBe(true);
  });

  it('accepts audio / lottie / embed / codeBlock / latex / map elements', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push(
      {
        id: asULID('01H000000000000000000000A6'),
        semanticId: 'voiceover',
        type: 'audio',
        name: 'Voiceover',
        parentId: null,
        assetId: 'audio_track_01',
        volume: 0.8,
        pan: -0.3,
        fadeInMs: 200,
      } as Element,
      {
        id: asULID('01H000000000000000000000A7'),
        semanticId: 'loading_anim',
        type: 'lottie',
        name: 'Loading animation',
        parentId: null,
        assetId: 'lottie_asset_01',
        autoplay: true,
        variableBindings: { $progress: 'viewer.session.progress' },
      } as Element,
      {
        id: asULID('01H000000000000000000000A8'),
        semanticId: 'live_app',
        type: 'embed',
        name: 'Live app',
        parentId: null,
        url: 'https://app.example.com/dashboard',
        policyId: 'embed_policy_01',
      } as Element,
      {
        id: asULID('01H000000000000000000000A9'),
        semanticId: 'code_demo',
        type: 'codeBlock',
        name: 'Code demo',
        parentId: null,
        code: 'console.log(1 + 1)',
        language: 'javascript',
        runnable: true,
      } as Element,
      {
        id: asULID('01H000000000000000000000AA'),
        semanticId: 'maxwell_eq',
        type: 'latex',
        name: 'Maxwell equation',
        parentId: null,
        source: '$$\\nabla \\cdot E = \\rho / \\epsilon_0$$',
        displayMode: 'block',
      } as Element,
      {
        id: asULID('01H000000000000000000000AB'),
        semanticId: 'customer_map',
        type: 'map',
        name: 'Customer map',
        parentId: null,
        styleId: 'map_style_01',
        zoom: 4,
        center: { lng: -74, lat: 40.7 },
        choropleth: true,
      } as Element,
    );
    const result = validate(doc);
    expect(result.valid).toBe(true);
  });

  it('rejects an embed element missing url', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000AC'),
      semanticId: 'broken_embed',
      type: 'embed',
      name: 'Broken embed',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.url'))).toBe(true);
  });

  it('rejects a codeBlock element missing code', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000AD'),
      semanticId: 'empty_code',
      type: 'codeBlock',
      name: 'Empty code',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.code'))).toBe(true);
  });

  it('rejects a latex element with empty source', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000AE'),
      semanticId: 'empty_latex',
      type: 'latex',
      name: 'Empty latex',
      parentId: null,
      source: '',
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.source'))).toBe(true);
  });

  it('rejects a map element missing styleId', () => {
    const doc = baseDeck();
    doc.slides[0]!.elements.push({
      id: asULID('01H000000000000000000000AF'),
      semanticId: 'broken_map',
      type: 'map',
      name: 'Broken map',
      parentId: null,
    } as Element);
    const result = validate(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith('.styleId'))).toBe(true);
  });
});
