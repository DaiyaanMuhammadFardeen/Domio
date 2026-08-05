import type {
  BooleanShapeLayer,
  ComponentLayer,
  Element,
  FrameLayer,
  GroupLayer,
  AutoLayoutLayer,
  TextLayer,
  ImageLayer,
  VectorLayer,
  Model3DLayer,
  VideoLayer,
  AudioLayer,
  LottieLayer,
  EmbedLayer,
  CodeBlockLayer,
  LatexLayer,
  MapLayer,
  DeckDocument,
  ULID,
} from './generated/scene-graph.js';
import type {
  DeckSchemaValidator,
  SchemaValidateResult,
  ValidationWarning,
} from './registry.js';
import { DECK_SCHEMA_VERSION } from './version.js';

const LAYER_TYPES = [
  'frame',
  'group',
  'autoLayout',
  'text',
  'image',
  'vector',
  'boolean',
  'component',
  'model3d',
  'video',
  'audio',
  'lottie',
  'embed',
  'codeBlock',
  'latex',
  'map',
] as const;
export type StructuralLayerType = (typeof LAYER_TYPES)[number];

export function isLayerType(value: string): value is StructuralLayerType {
  return (LAYER_TYPES as readonly string[]).includes(value);
}

export interface ValidatorOptions {
  /**
   * When true, the validator accepts documents whose `schemaVersion` differs
   * from the current `DECK_SCHEMA_VERSION` as long as they pass the
   * structural checks. This is what the loader uses to support lazy schema
   * migration; CI runs with this off.
   */
  ignoreVersion?: boolean;
}

export class StructuralValidator implements DeckSchemaValidator {
  constructor(private readonly options: ValidatorOptions = {}) {}

  validate(doc: DeckDocument): SchemaValidateResult {
    const errors: ValidationWarning[] = [];

    if (!doc || typeof doc !== 'object') {
      errors.push({
        code: 'invalid_argument',
        path: '',
        message: 'DeckDocument must be an object.',
      });
      return { valid: false, errors };
    }

    if (!this.options.ignoreVersion) {
      if (doc.schemaVersion !== DECK_SCHEMA_VERSION) {
        errors.push({
          code: 'schema_version_mismatch',
          path: 'schemaVersion',
          message: `Deck schemaVersion ${doc.schemaVersion ?? '(missing)'} does not match ${DECK_SCHEMA_VERSION}.`,
        });
      }
    }

    if (!isULID(doc.id)) {
      errors.push({
        code: 'invalid_argument',
        path: 'id',
        message: 'Deck.id must be a 26-character Crockford-base32 ULID.',
      });
    }

    if (!doc.tenantId || typeof doc.tenantId !== 'string') {
      errors.push({
        code: 'required',
        path: 'tenantId',
        message: 'Deck.tenantId is required.',
      });
    }

    if (!isULID(doc.workspaceId)) {
      errors.push({
        code: 'invalid_argument',
        path: 'workspaceId',
        message: 'Deck.workspaceId must be a ULID.',
      });
    }

    if (!Array.isArray(doc.slides) || doc.slides.length === 0) {
      errors.push({
        code: 'required',
        path: 'slides',
        message: 'Deck.slides must contain at least one slide.',
      });
      return { valid: errors.length === 0, errors };
    }

    const seenSlideIds = new Set<string>();
    const seenSemanticSlide = new Set<string>();
    doc.slides.forEach((slide, slideIndex) => {
      if (!isULID(slide.id)) {
        errors.push({
          code: 'invalid_argument',
          path: `slides[${slideIndex}].id`,
          message: 'Slide.id must be a ULID.',
        });
      }
      if (seenSlideIds.has(slide.id)) {
        errors.push({
          code: 'duplicate_id',
          path: `slides[${slideIndex}].id`,
          message: `Duplicate Slide.id ${slide.id}.`,
        });
      }
      seenSlideIds.add(slide.id);
      const slideKey = `${doc.id}/${slide.semanticId}`;
      if (seenSemanticSlide.has(slideKey)) {
        errors.push({
          code: 'semantic_address_collision',
          path: `slides[${slideIndex}].semanticId`,
          message: `Duplicate slide semanticId "${slide.semanticId}".`,
        });
      }
      seenSemanticSlide.add(slideKey);

      if (!Array.isArray(slide.elements)) {
        errors.push({
          code: 'invalid_argument',
          path: `slides[${slideIndex}].elements`,
          message: 'Slide.elements must be an array.',
        });
        return;
      }

      const seenElementIds = new Set<string>();
      const seenSemanticElement = new Set<string>();
      slide.elements.forEach((element, elementIndex) => {
        this.validateElement(element, `slides[${slideIndex}].elements[${elementIndex}]`, errors);
        if (seenElementIds.has(element.id)) {
          errors.push({
            code: 'duplicate_id',
            path: `slides[${slideIndex}].elements[${elementIndex}].id`,
            message: `Duplicate element.id ${element.id}.`,
          });
        }
        seenElementIds.add(element.id);
        const elementKey = `${slideKey}/${element.semanticId}`;
        if (seenSemanticElement.has(elementKey)) {
          errors.push({
            code: 'semantic_address_collision',
            path: `slides[${slideIndex}].elements[${elementIndex}].semanticId`,
            message: `Duplicate element semanticId "${element.semanticId}" on slide "${slide.semanticId}".`,
          });
        }
        seenSemanticElement.add(elementKey);
      });
    });

    return { valid: errors.length === 0, errors };
  }

  private validateElement(
    element: Element,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!isULID(element.id)) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.id`,
        message: 'Element.id must be a ULID.',
      });
    }
    if (!isLayerType(element.type)) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.type`,
        message: `Element.type must be one of ${LAYER_TYPES.join(', ')}.`,
      });
      return;
    }
    switch (element.type) {
      case 'frame':
        this.validateFrame(element, basePath, errors);
        return;
      case 'group':
        this.validateGroup(element, basePath, errors);
        return;
      case 'autoLayout':
        this.validateAutoLayout(element, basePath, errors);
        return;
      case 'text':
        this.validateText(element, basePath, errors);
        return;
      case 'image':
        this.validateImage(element, basePath, errors);
        return;
      case 'vector':
        this.validateVector(element, basePath, errors);
        return;
      case 'boolean':
        this.validateBoolean(element, basePath, errors);
        return;
      case 'component':
        this.validateComponent(element, basePath, errors);
        return;
      case 'model3d':
        this.validateModel3D(element, basePath, errors);
        return;
      case 'video':
        this.validateVideo(element, basePath, errors);
        return;
      case 'audio':
        this.validateAudio(element, basePath, errors);
        return;
      case 'lottie':
        this.validateLottie(element, basePath, errors);
        return;
      case 'embed':
        this.validateEmbed(element, basePath, errors);
        return;
      case 'codeBlock':
        this.validateCodeBlock(element, basePath, errors);
        return;
      case 'latex':
        this.validateLatex(element, basePath, errors);
        return;
      case 'map':
        this.validateMap(element, basePath, errors);
        return;
      default:
        return;
    }
  }

  private validateFrame(layer: FrameLayer, basePath: string, errors: ValidationWarning[]): void {
    if (!layer.aspect || layer.aspect.ratioW <= 0 || layer.aspect.ratioH <= 0) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.aspect`,
        message: 'FrameLayer.aspect must have positive ratioW and ratioH.',
      });
    }
  }

  private validateGroup(_layer: GroupLayer, _basePath: string, _errors: ValidationWarning[]): void {
    /* no extra structural checks beyond ElementBase */
  }

  private validateAutoLayout(
    layer: AutoLayoutLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!['horizontal', 'vertical', 'grid'].includes(layer.autoLayout.direction)) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.autoLayout.direction`,
        message: 'AutoLayout.direction must be one of horizontal, vertical, grid.',
      });
    }
  }

  private validateText(layer: TextLayer, basePath: string, errors: ValidationWarning[]): void {
    if (typeof layer.text?.content !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.text.content`,
        message: 'TextLayer.text.content must be a string.',
      });
    }
  }

  private validateImage(layer: ImageLayer, basePath: string, errors: ValidationWarning[]): void {
    if (!layer.assetId || typeof layer.assetId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.assetId`,
        message: 'ImageLayer.assetId is required.',
      });
    }
  }

  private validateVector(layer: VectorLayer, basePath: string, errors: ValidationWarning[]): void {
    if (!Array.isArray(layer.paths) || layer.paths.length === 0) {
      errors.push({
        code: 'required',
        path: `${basePath}.paths`,
        message: 'VectorLayer.paths must contain at least one path string.',
      });
    }
  }

  private validateBoolean(
    layer: BooleanShapeLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!Array.isArray(layer.operands) || layer.operands.length < 2) {
      errors.push({
        code: 'required',
        path: `${basePath}.operands`,
        message: 'BooleanShapeLayer.operands must contain at least two element ids.',
      });
    }
  }

  private validateComponent(
    layer: ComponentLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    const component = layer.component;
    if (!component || typeof component !== 'object') {
      errors.push({
        code: 'required',
        path: `${basePath}.component`,
        message: 'ComponentLayer.component is required.',
      });
      return;
    }
    if (typeof component.catalogId !== 'string' || component.catalogId.length === 0) {
      errors.push({
        code: 'required',
        path: `${basePath}.component.catalogId`,
        message: 'ComponentRef.catalogId must be a non-empty string.',
      });
    }
    if (typeof component.version !== 'string' || !SEMVER_PATTERN.test(component.version)) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.component.version`,
        message: 'ComponentRef.version must be a semver string (X.Y.Z).',
      });
    }
    if (
      component.props !== undefined &&
      (typeof component.props !== 'object' ||
        component.props === null ||
        Array.isArray(component.props))
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.component.props`,
        message: 'ComponentRef.props must be an object.',
      });
    }
  }

  private validateModel3D(
    layer: Model3DLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.modelAssetId || typeof layer.modelAssetId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.modelAssetId`,
        message: 'Model3DLayer.modelAssetId is required.',
      });
    }
    if (
      layer.upAxis !== undefined &&
      layer.upAxis !== 'y-up' &&
      layer.upAxis !== 'z-up'
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.upAxis`,
        message: 'Model3DLayer.upAxis must be one of y-up, z-up.',
      });
    }
  }

  private validateVideo(
    layer: VideoLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.assetId || typeof layer.assetId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.assetId`,
        message: 'VideoLayer.assetId is required.',
      });
    }
    if (
      layer.trimInMs !== undefined &&
      (typeof layer.trimInMs !== 'number' || layer.trimInMs < 0)
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.trimInMs`,
        message: 'VideoLayer.trimInMs must be a non-negative number.',
      });
    }
    if (
      layer.trimOutMs !== undefined &&
      layer.trimInMs !== undefined &&
      layer.trimOutMs < layer.trimInMs
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.trimOutMs`,
        message: 'VideoLayer.trimOutMs must be >= trimInMs.',
      });
    }
    if (
      layer.speed !== undefined &&
      (layer.speed < 0.25 || layer.speed > 4)
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.speed`,
        message: 'VideoLayer.speed must be within 0.25x and 4x.',
      });
    }
  }

  private validateAudio(
    layer: AudioLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.assetId || typeof layer.assetId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.assetId`,
        message: 'AudioLayer.assetId is required.',
      });
    }
    if (
      layer.volume !== undefined &&
      (layer.volume < 0 || layer.volume > 1)
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.volume`,
        message: 'AudioLayer.volume must be within 0 and 1.',
      });
    }
    if (layer.pan !== undefined && (layer.pan < -1 || layer.pan > 1)) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.pan`,
        message: 'AudioLayer.pan must be within -1 and 1.',
      });
    }
  }

  private validateLottie(
    layer: LottieLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.assetId || typeof layer.assetId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.assetId`,
        message: 'LottieLayer.assetId is required.',
      });
    }
  }

  private validateEmbed(
    layer: EmbedLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.url || typeof layer.url !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.url`,
        message: 'EmbedLayer.url is required.',
      });
    }
  }

  private validateCodeBlock(
    layer: CodeBlockLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (typeof layer.code !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.code`,
        message: 'CodeBlockLayer.code must be a string.',
      });
    }
  }

  private validateLatex(
    layer: LatexLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (typeof layer.source !== 'string' || layer.source.length === 0) {
      errors.push({
        code: 'required',
        path: `${basePath}.source`,
        message: 'LatexLayer.source must be a non-empty string.',
      });
    }
    if (
      layer.displayMode !== undefined &&
      layer.displayMode !== 'inline' &&
      layer.displayMode !== 'block'
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.displayMode`,
        message: 'LatexLayer.displayMode must be one of inline, block.',
      });
    }
  }

  private validateMap(
    layer: MapLayer,
    basePath: string,
    errors: ValidationWarning[],
  ): void {
    if (!layer.styleId || typeof layer.styleId !== 'string') {
      errors.push({
        code: 'required',
        path: `${basePath}.styleId`,
        message: 'MapLayer.styleId is required.',
      });
    }
    if (
      layer.center !== undefined &&
      (typeof layer.center.lng !== 'number' ||
        typeof layer.center.lat !== 'number')
    ) {
      errors.push({
        code: 'invalid_argument',
        path: `${basePath}.center`,
        message: 'MapLayer.center must have numeric lng and lat.',
      });
    }
  }
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function validate(document: unknown, options?: ValidatorOptions): SchemaValidateResult {
  return new StructuralValidator(options ?? {}).validate(document as DeckDocument);
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isULID(value: unknown): value is ULID {
  return typeof value === 'string' && ULID_REGEX.test(value);
}