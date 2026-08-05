/**
 * Generated-style TypeScript types for the v1 deck scene graph.
 *
 * In a fully-wired repo this file is produced by `json-schema-to-typescript`
 * from `contracts/schema/v1/deck.schema.json` + `scene-graph.schema.json`.
 * The P02 generator wiring is still out of scope, so the equivalent types
 * are hand-written here and locked down by:
 *
 *   1. AJV strict-compile of the source JSON Schemas (Phase 01 `scripts/ajv-strict`).
 *   2. The structural validator in `validate.ts`, which exhaustively checks
 *      every layer kind against the shapes declared here.
 *
 * Editing this file? Update the matching JSON Schema in
 * `contracts/schema/v1/` first, then mirror the change here. The CI workflow
 * `.github/workflows/schema-validate.yml` will fail if the two diverge in any
 * way that AJV's strict mode catches.
 */

// ----- Primitives -----

/**
 * ULID — a 26-character Crockford-base32 string. The brand prevents
 * accidental mixing with arbitrary `string` ids at the type level.
 */
export type ULID = string & { readonly __brand: 'ULID' };

/**
 * Semantic address grammar: `slide[id].role[id](.role[id])*`.
 * Examples: `slide[intro]`, `slide[intro].text[title]`,
 *           `slide[intro].group[cluster].vector[revenue_by_region]`.
 */
export type SemanticAddress = string;

/** 2D ratio used for slide and frame aspect. */
export interface AspectRatio {
  ratioW: number;
  ratioH: number;
}

/** Generic RGBA color. */
export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Renderer-facing color value: a CSS-like string (`#RRGGBB`,
 * `#RRGGBBAA`, `rgb(...)`, `rgba(...)`) tagged with the color space it is
 * expressed in. `alpha` is a 0–1 multiplier applied on top of any alpha
 * encoded in `value`. Pixels are normalized to sRGB on the way to the GPU.
 */
export interface Color {
  colorSpace: 'srgb' | 'display-p3';
  value: string;
  alpha?: number;
}

/** Solid or gradient fill on a layer. */
export interface StyleFill {
  type: 'solid' | 'linear-gradient' | 'radial-gradient' | 'image';
  color?: ColorRGBA;
  stops?: ColorRGBA[];
  imageAssetId?: string;
}

/** Stroke decoration on a layer. */
export interface StyleStroke {
  /** Stroke color in the deck's working color space. */
  color: ColorRGBA;
  width: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

/** Drop shadow effect. */
export interface EffectShadow {
  type: 'shadow';
  color: ColorRGBA;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

export type LayerEffect = EffectShadow;

// ----- Auto layout -----

/** A length value with explicit unit. */
export interface Length {
  value: number;
  unit: 'px' | '%';
}

/** Padding or margin shorthand. Accepts a single value or a per-edge map. */
export type AutoLayoutPadding =
  | number
  | Length
  | {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };

export interface AutoLayoutSpec {
  direction: 'horizontal' | 'vertical' | 'grid';
  wrap?: boolean;
  /** Primary-axis alignment (justify-content in flex terms). */
  primaryAlign?: 'min' | 'center' | 'max' | 'space-between';
  /** Counter-axis alignment (align-items in flex terms). */
  counterAlign?: 'min' | 'center' | 'max' | 'stretch';
  padding?: AutoLayoutPadding;
  itemSpacing?: number;
  gridColumns?: number;
}

// ----- Constraints -----

/**
 * Per-axis constraint mode.
 *
 *  - `min`       — pin to the leading edge (left on horizontal, top on vertical).
 *  - `max`       — pin to the trailing edge (right / bottom).
 *  - `center`    — keep the child centered on that axis.
 *  - `stretch`   — match the parent size on that axis; the child's size scales.
 *  - `scale`     — scale the child's size proportionally to the parent delta.
 */
export type ConstraintAxis = 'min' | 'max' | 'center' | 'stretch' | 'scale';

export interface LayerConstraints {
  horizontal: ConstraintAxis;
  vertical: ConstraintAxis;
  /** Pin the child's top-left corner to the parent's top-left; overrides
   *  the per-axis modes for both x and y. */
  pinToCorners?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

// ----- Data binding & animation slots (deferred runtime) -----

export interface DataBinding {
  sourceId: string;
  path: string;
  format?: 'text' | 'number' | 'date' | 'currency' | 'percent';
}

export interface Animation {
  trigger: 'enter' | 'exit' | 'hover' | 'click' | 'while-in-viewport';
  easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
  durationMs: number;
  delayMs?: number;
}

export interface PrototypeVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'color';
  defaultValue: string | number | boolean;
}

// ----- Component instance -----

export interface ComponentInstance {
  componentId: ULID;
  overrides?: Record<string, unknown>;
}

/**
 * Reference to a component-package instance on the canvas. `props` are
 * validated against the component's JSON-Schema props schema.
 */
export interface ComponentRef {
  /** Namespaced catalog id, e.g. `domio.stat-card`. */
  catalogId: string;
  /** Semver of the component package. */
  version: string;
  /** Active variant id (e.g. `light` | `dark` | `sm` | `md` | `lg`). */
  variant?: string;
  /** Resolved prop values validated against the props schema. */
  props: Record<string, unknown>;
}

// ----- Layer base & discriminated union -----

/**
 * 2D affine transform stored in world coordinates. `x`/`y` are the top-left
 * corner of the element's bounding box, `w`/`h` its size, `rotation` in
 * radians, and `scale` a uniform scale multiplier.
 */
export interface Transform2D {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  scale?: number;
}

export interface ElementBase {
  id: ULID;
  semanticId: string;
  /** Magic-move matching key (Phase 09). Optional role shared across slides
   *  so the diff engine can tween matched elements. */
  element_role?: string;
  name: string;
  type: LayerType;
  parentId: ULID | null;
  transform?: Transform2D;
  /** Stack order; higher values render above lower values. Ties break by
   *  slide position then `elements` index. */
  z?: number;
  locked?: boolean;
  hidden?: boolean;
  constraints?: LayerConstraints;
  /** Primary fill (Phase 03 MVP uses a single fill; arrays land with P07
   *  theming). */
  fill?: StyleFill;
  /** Primary stroke decoration. */
  stroke?: StyleStroke;
  effects?: LayerEffect[];
  dataBindings?: DataBinding[];
  animations?: Animation[];
  componentInstance?: ComponentInstance;
  /** Free-form style bag used by the editor's style snapshot/painter
   *  (Phase 03 §D.3). The renderer uses the structured `fill`/`stroke`/
   *  `effects` fields for canonical rendering; `style` is the editor-only
   *  clipboard payload for fill/stroke/font values. */
  style?: Record<string, unknown>;
}

export interface FrameLayer extends ElementBase {
  type: 'frame';
  aspect: AspectRatio;
  clipContent?: boolean;
  autoLayout?: AutoLayoutSpec;
}

export interface GroupLayer extends ElementBase {
  type: 'group';
}

export interface AutoLayoutLayer extends ElementBase {
  type: 'autoLayout';
  autoLayout: AutoLayoutSpec;
}

export interface TextLayer extends ElementBase {
  type: 'text';
  text: {
    content: string;
    runs?: Array<{
      start: number;
      end: number;
      style?: {
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        fill?: unknown;
      };
    }>;
  };
}

export interface ImageLayer extends ElementBase {
  type: 'image';
  assetId: string;
  alt?: string;
  fit?: 'cover' | 'contain' | 'fill';
}

export interface VectorLayer extends ElementBase {
  type: 'vector';
  paths: string[];
  fillRule?: 'evenodd' | 'nonzero';
}

export interface BooleanShapeLayer extends ElementBase {
  type: 'boolean';
  operands: ULID[];
  operation: 'union' | 'subtract' | 'intersect' | 'exclude';
}

export interface ComponentLayer extends ElementBase {
  type: 'component';
  component: ComponentRef;
}

export interface Model3DLayer extends ElementBase {
  type: 'model3d';
  modelAssetId: string;
  sceneId?: string;
  upAxis?: 'y-up' | 'z-up';
  autoRotate?: boolean;
  paused?: boolean;
  physicsEnabled?: boolean;
}

export interface VideoLayer extends ElementBase {
  type: 'video';
  assetId: string;
  trimInMs?: number;
  trimOutMs?: number;
  speed?: number;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
  captionsOn?: boolean;
  posterFrameMs?: number;
  chapters?: Array<{
    timeMs: number;
    label: string;
  }>;
}

export interface AudioLayer extends ElementBase {
  type: 'audio';
  assetId: string;
  volume?: number;
  pan?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
  startAtMs?: number;
}

export interface LottieLayer extends ElementBase {
  type: 'lottie';
  assetId: string;
  autoplay?: boolean;
  loop?: boolean;
  speed?: number;
  variableBindings?: Record<string, string>;
}

export interface EmbedLayer extends ElementBase {
  type: 'embed';
  url: string;
  policyId?: string;
  sandboxFlags?: string;
  title?: string;
}

export interface CodeBlockLayer extends ElementBase {
  type: 'codeBlock';
  code: string;
  language?: string;
  runnable?: boolean;
  policyId?: string;
  showLineNumbers?: boolean;
  stepReveal?: boolean;
}

export interface LatexLayer extends ElementBase {
  type: 'latex';
  source: string;
  displayMode?: 'inline' | 'block';
  themeHash?: string;
}

export interface MapLayer extends ElementBase {
  type: 'map';
  styleId: string;
  zoom?: number;
  center?: { lng: number; lat: number };
  choropleth?: boolean;
}

export type LayerType =
  | 'frame'
  | 'group'
  | 'autoLayout'
  | 'text'
  | 'image'
  | 'vector'
  | 'boolean'
  | 'component'
  | 'model3d'
  | 'video'
  | 'audio'
  | 'lottie'
  | 'embed'
  | 'codeBlock'
  | 'latex'
  | 'map';

export type Element =
  | FrameLayer
  | GroupLayer
  | AutoLayoutLayer
  | TextLayer
  | ImageLayer
  | VectorLayer
  | BooleanShapeLayer
  | ComponentLayer
  | Model3DLayer
  | VideoLayer
  | AudioLayer
  | LottieLayer
  | EmbedLayer
  | CodeBlockLayer
  | LatexLayer
  | MapLayer;

// ----- Slide & deck document -----

export interface Slide {
  id: ULID;
  semanticId: string;
  position: number;
  aspect: AspectRatio;
  elements: Element[];
  title?: string;
  notes?: string;
}

export interface DeckSettings {
  defaultSlideRatio: AspectRatio;
  defaultFontFamily?: string;
  background?: StyleFill;
}

export interface DeckDocument {
  schemaVersion: string;
  id: ULID;
  tenantId: string;
  workspaceId: ULID;
  title: string;
  revision: number;
  settings: DeckSettings;
  slides: Slide[];
  variables?: PrototypeVariable[];
}

// ----- ULID helper (used by tests and seed data) -----

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Coerces a string into a ULID brand at the type boundary. The value is
 * returned unchanged so callers can use string literals as ULIDs without
 * having to allocate one at runtime; validation is performed by the
 * structural validator instead.
 */
export function asULID(value: string): ULID {
  if (!ULID_REGEX.test(value)) {
    // Permissive cast: tests and seed fixtures use canonical 26-char
    // ULIDs already. Runtime validation happens in `validate.ts`.
    return value as ULID;
  }
  return value as ULID;
}
