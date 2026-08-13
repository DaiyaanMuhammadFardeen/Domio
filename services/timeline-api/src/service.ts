/**
 * Timeline API — service layer (Phase 09).
 *
 * Core business logic for the animation & transition data plane:
 *   - Timeline CRUD with optimistic locking
 *   - Track / Keyframe / Trigger CRUD
 *   - Easing-curve CRUD with monotonicity + spring bounds validation
 *   - Animation-preset CRUD + application logic
 *   - Transition CRUD
 *   - Reduced-motion settings
 */

import type {
  Timeline,
  Track,
  Keyframe,
  Trigger,
  TriggerKind,
  EasingCurve,
  EasingCurveParams,
  EasingCurveType,
  AnimationPreset,
  AnimationPresetCategory,
  AnimationPresetDefinition,
  Transition,
  TransitionType,
  TransitionOptions,
  ReducedMotionSettings,
  ReducedMotionMode,
  TimelineRepository,
  TrackRepository,
  KeyframeRepository,
  TriggerRepository,
  EasingCurveRepository,
  AnimationPresetRepository,
  TransitionRepository,
  ReducedMotionRepository,
} from './dal.js';
import {
  TimelineNotFoundError,
  VersionConflictError,
  TrackNotFoundError,
  EasingCurveNotFoundError,
  AnimationPresetNotFoundError,
} from './dal.js';
import { validateEasingCurveRules, type EasingValidationError } from './schemas.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EasingValidationRejectedError extends Error {
  readonly code = 'EASING_VALIDATION_REJECTED' as const;
  constructor(public readonly errors: readonly EasingValidationError[]) {
    super(`Easing curve validation failed: ${errors.map((e) => e.message).join('; ')}`);
    this.name = 'EasingValidationRejectedError';
  }
}

export class PresetMissingPropertyError extends Error {
  readonly code = 'PRESET_MISSING_PROPERTY' as const;
  constructor(
    public readonly presetId: string,
    public readonly missingProperty: string,
  ) {
    super(
      `Preset ${presetId} requires property "${missingProperty}" which is missing from the element`,
    );
    this.name = 'PresetMissingPropertyError';
  }
}

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface TimelineServiceOptions {
  readonly timelines: TimelineRepository;
  readonly tracks: TrackRepository;
  readonly keyframes: KeyframeRepository;
  readonly triggers: TriggerRepository;
  readonly easingCurves: EasingCurveRepository;
  readonly presets: AnimationPresetRepository;
  readonly transitions: TransitionRepository;
  readonly reducedMotion: ReducedMotionRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

const defaultId = (): string => {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 16)]!;
  return out;
};

const defaultClock = (): Date => new Date();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TimelineService {
  private readonly timelines: TimelineRepository;
  private readonly tracks: TrackRepository;
  private readonly keyframes: KeyframeRepository;
  private readonly triggers: TriggerRepository;
  private readonly easingCurves: EasingCurveRepository;
  private readonly presets: AnimationPresetRepository;
  private readonly transitions: TransitionRepository;
  private readonly reducedMotion: ReducedMotionRepository;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: TimelineServiceOptions) {
    this.timelines = opts.timelines;
    this.tracks = opts.tracks;
    this.keyframes = opts.keyframes;
    this.triggers = opts.triggers;
    this.easingCurves = opts.easingCurves;
    this.presets = opts.presets;
    this.transitions = opts.transitions;
    this.reducedMotion = opts.reducedMotion;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
  }

  // -------------------------------------------------------------------------
  // Timeline CRUD
  // -------------------------------------------------------------------------

  async createTimeline(input: {
    tenantId: string;
    deckId: string;
    slideId: string;
    elementId: string;
    durationMs: number;
    loop?: boolean;
    playCount?: number;
    startOffsetMs?: number;
    tracks?: ReadonlyArray<{
      property: string;
      keyframes: ReadonlyArray<{ timeMs: number; value: unknown; easing?: string }>;
      startOffsetMs?: number;
      easing: string;
    }>;
    triggers?: ReadonlyArray<{
      kind: TriggerKind;
      sourceId?: string;
      fieldPath?: string;
      offsetMs?: number;
      debounceMs?: number;
    }>;
  }): Promise<Timeline> {
    const now = this.clock();
    const id = this.idGen();

    const tracks: Track[] = [];
    if (input.tracks) {
      for (const t of input.tracks) {
        const trackId = this.idGen();
        const keyframes: Keyframe[] = t.keyframes.map((k) => ({
          id: this.idGen(),
          trackId,
          timeMs: k.timeMs,
          value: k.value,
          ...(k.easing !== undefined ? { easing: k.easing } : {}),
        }));
        tracks.push({
          id: trackId,
          timelineId: id,
          property: t.property,
          keyframes,
          startOffsetMs: t.startOffsetMs ?? 0,
          easing: t.easing,
        });
      }
    }

    const triggers: Trigger[] = [];
    if (input.triggers) {
      for (const t of input.triggers) {
        triggers.push({
          id: this.idGen(),
          timelineId: id,
          kind: t.kind,
          ...(t.sourceId !== undefined ? { sourceId: t.sourceId } : {}),
          ...(t.fieldPath !== undefined ? { fieldPath: t.fieldPath } : {}),
          ...(t.offsetMs !== undefined ? { offsetMs: t.offsetMs } : {}),
          ...(t.debounceMs !== undefined ? { debounceMs: t.debounceMs } : {}),
        });
      }
    }

    const record: Timeline = {
      id,
      tenantId: input.tenantId,
      deckId: input.deckId,
      slideId: input.slideId,
      elementId: input.elementId,
      durationMs: input.durationMs,
      loop: input.loop ?? false,
      playCount: input.playCount ?? 1,
      startOffsetMs: input.startOffsetMs ?? 0,
      tracks,
      triggers,
      version: 1,
      updatedAt: now,
    };

    await this.timelines.insert(record);

    // Persist sub-entities
    for (const track of tracks) {
      await this.tracks.insert(track);
      for (const kf of track.keyframes) {
        await this.keyframes.insert(kf);
      }
    }
    for (const trigger of triggers) {
      await this.triggers.insert(trigger);
    }

    return record;
  }

  async getTimeline(id: string, tenantId: string): Promise<Timeline> {
    const t = await this.timelines.findById(id, tenantId);
    if (!t) throw new TimelineNotFoundError(id);
    return t;
  }

  async listTimelines(deckId: string, tenantId: string): Promise<Timeline[]> {
    return this.timelines.listByDeck(deckId, tenantId);
  }

  async patchTimeline(
    id: string,
    tenantId: string,
    patch: {
      durationMs?: number;
      loop?: boolean;
      playCount?: number;
      startOffsetMs?: number;
      version: number;
      tracks?: ReadonlyArray<{
        property: string;
        keyframes: ReadonlyArray<{ timeMs: number; value: unknown; easing?: string }>;
        startOffsetMs?: number;
        easing: string;
      }>;
      triggers?: ReadonlyArray<{
        kind: TriggerKind;
        sourceId?: string;
        fieldPath?: string;
        offsetMs?: number;
        debounceMs?: number;
      }>;
    },
  ): Promise<Timeline> {
    const updatePatch: Record<string, unknown> = {};
    if (patch.durationMs !== undefined) updatePatch.durationMs = patch.durationMs;
    if (patch.loop !== undefined) updatePatch.loop = patch.loop;
    if (patch.playCount !== undefined) updatePatch.playCount = patch.playCount;
    if (patch.startOffsetMs !== undefined) updatePatch.startOffsetMs = patch.startOffsetMs;

    // Resolve tracks + triggers if provided
    if (patch.tracks !== undefined) {
      const tracks: Track[] = [];
      for (const t of patch.tracks) {
        const trackId = this.idGen();
        const keyframes: Keyframe[] = t.keyframes.map((k) => ({
          id: this.idGen(),
          trackId,
          timeMs: k.timeMs,
          value: k.value,
          ...(k.easing !== undefined ? { easing: k.easing } : {}),
        }));
        tracks.push({
          id: trackId,
          timelineId: id,
          property: t.property,
          keyframes,
          startOffsetMs: t.startOffsetMs ?? 0,
          easing: t.easing,
        });
      }
      updatePatch.tracks = tracks;
    }

    if (patch.triggers !== undefined) {
      const triggers: Trigger[] = [];
      for (const t of patch.triggers) {
        triggers.push({
          id: this.idGen(),
          timelineId: id,
          kind: t.kind,
          ...(t.sourceId !== undefined ? { sourceId: t.sourceId } : {}),
          ...(t.fieldPath !== undefined ? { fieldPath: t.fieldPath } : {}),
          ...(t.offsetMs !== undefined ? { offsetMs: t.offsetMs } : {}),
          ...(t.debounceMs !== undefined ? { debounceMs: t.debounceMs } : {}),
        });
      }
      updatePatch.triggers = triggers;
    }

    try {
      return await this.timelines.update(id, tenantId, updatePatch, patch.version);
    } catch (e) {
      if (e instanceof VersionConflictError) throw e;
      if (e instanceof TimelineNotFoundError) throw e;
      throw e;
    }
  }

  async deleteTimeline(id: string, tenantId: string): Promise<void> {
    await this.timelines.delete(id, tenantId);
  }

  // -------------------------------------------------------------------------
  // Track CRUD
  // -------------------------------------------------------------------------

  async createTrack(
    timelineId: string,
    tenantId: string,
    input: {
      property: string;
      keyframes: ReadonlyArray<{ timeMs: number; value: unknown; easing?: string }>;
      startOffsetMs?: number;
      easing: string;
    },
  ): Promise<Track> {
    // Verify timeline exists
    await this.getTimeline(timelineId, tenantId);

    const trackId = this.idGen();
    const keyframes: Keyframe[] = input.keyframes.map((k) => ({
      id: this.idGen(),
      trackId,
      timeMs: k.timeMs,
      value: k.value,
      ...(k.easing !== undefined ? { easing: k.easing } : {}),
    }));

    const record: Track = {
      id: trackId,
      timelineId,
      property: input.property,
      keyframes,
      startOffsetMs: input.startOffsetMs ?? 0,
      easing: input.easing,
    };

    await this.tracks.insert(record);
    for (const kf of keyframes) {
      await this.keyframes.insert(kf);
    }
    return record;
  }

  // -------------------------------------------------------------------------
  // Keyframe CRUD
  // -------------------------------------------------------------------------

  async createKeyframe(
    trackId: string,
    input: { timeMs: number; value: unknown; easing?: string },
  ): Promise<Keyframe> {
    const track = await this.tracks.findById(trackId);
    if (!track) throw new TrackNotFoundError(trackId);

    const record: Keyframe = {
      id: this.idGen(),
      trackId,
      timeMs: input.timeMs,
      value: input.value,
      ...(input.easing !== undefined ? { easing: input.easing } : {}),
    };

    await this.keyframes.insert(record);
    return record;
  }

  // -------------------------------------------------------------------------
  // Trigger CRUD
  // -------------------------------------------------------------------------

  async createTrigger(
    timelineId: string,
    tenantId: string,
    input: {
      kind: TriggerKind;
      sourceId?: string;
      fieldPath?: string;
      offsetMs?: number;
      debounceMs?: number;
    },
  ): Promise<Trigger> {
    // Verify timeline exists
    await this.getTimeline(timelineId, tenantId);

    const record: Trigger = {
      id: this.idGen(),
      timelineId,
      kind: input.kind,
      ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
      ...(input.fieldPath !== undefined ? { fieldPath: input.fieldPath } : {}),
      ...(input.offsetMs !== undefined ? { offsetMs: input.offsetMs } : {}),
      ...(input.debounceMs !== undefined ? { debounceMs: input.debounceMs } : {}),
    };

    await this.triggers.insert(record);
    return record;
  }

  // -------------------------------------------------------------------------
  // Easing-curve CRUD
  // -------------------------------------------------------------------------

  async createEasingCurve(
    workspaceId: string,
    input: { name: string; type: EasingCurveType; params: EasingCurveParams },
  ): Promise<EasingCurve> {
    // Business-rule validation
    const validationErrors = validateEasingCurveRules(input.type, input.params);
    if (validationErrors.length > 0) {
      throw new EasingValidationRejectedError(validationErrors);
    }

    const record: EasingCurve = {
      id: this.idGen(),
      workspaceId,
      name: input.name,
      type: input.type,
      params: input.params,
      lutVersion: 1,
      builtIn: false,
    };

    await this.easingCurves.insert(record);
    return record;
  }

  async getEasingCurve(id: string, workspaceId: string): Promise<EasingCurve> {
    const curve = await this.easingCurves.findById(id, workspaceId);
    if (!curve) throw new EasingCurveNotFoundError(id);
    return curve;
  }

  async listEasingCurves(workspaceId: string): Promise<EasingCurve[]> {
    return this.easingCurves.listByWorkspace(workspaceId);
  }

  async patchEasingCurve(
    id: string,
    workspaceId: string,
    patch: { name?: string; type?: EasingCurveType; params?: EasingCurveParams },
  ): Promise<EasingCurve> {
    // Business-rule validation on updated type/params
    const effectiveType = patch.type;
    const effectiveParams = patch.params;
    if (effectiveType && effectiveParams) {
      const validationErrors = validateEasingCurveRules(effectiveType, effectiveParams);
      if (validationErrors.length > 0) {
        throw new EasingValidationRejectedError(validationErrors);
      }
    }

    return this.easingCurves.update(id, workspaceId, patch);
  }

  async deleteEasingCurve(id: string, workspaceId: string): Promise<void> {
    await this.easingCurves.delete(id, workspaceId);
  }

  // -------------------------------------------------------------------------
  // Animation-preset CRUD
  // -------------------------------------------------------------------------

  async createAnimationPreset(
    workspaceId: string,
    input: {
      name: string;
      category: AnimationPresetCategory;
      tags?: readonly string[];
      definition: AnimationPresetDefinition;
    },
  ): Promise<AnimationPreset> {
    const record: AnimationPreset = {
      id: this.idGen(),
      workspaceId,
      name: input.name,
      category: input.category,
      tags: input.tags ?? [],
      definition: input.definition,
      builtIn: false,
    };

    await this.presets.insert(record);
    return record;
  }

  async getAnimationPreset(id: string, workspaceId: string): Promise<AnimationPreset> {
    const preset = await this.presets.findById(id, workspaceId);
    if (!preset) throw new AnimationPresetNotFoundError(id);
    return preset;
  }

  async listAnimationPresets(
    workspaceId: string,
    filters?: { category?: AnimationPresetCategory; tag?: string },
  ): Promise<AnimationPreset[]> {
    return this.presets.listByWorkspace(workspaceId, filters);
  }

  /**
   * Apply an animation preset to an element.
   *
   * Business rules:
   * - If the preset defines `requiredProperties` and the element is missing
   *   any of them, throw `PresetMissingPropertyError` with the missing property name.
   * - If applied to the last slide's `on_enter` trigger, silently convert to `on_click`.
   */
  async applyPreset(input: {
    presetId: string;
    workspaceId: string;
    tenantId: string;
    deckId: string;
    slideId: string;
    elementId: string;
    elementProperties: readonly string[];
    slideIds: readonly string[];
    isLastSlide: boolean;
  }): Promise<{ timeline: Timeline; convertedTrigger: boolean }> {
    const preset = await this.getAnimationPreset(input.presetId, input.workspaceId);

    // Check required properties
    if (preset.definition.requiredProperties) {
      for (const prop of preset.definition.requiredProperties) {
        if (!input.elementProperties.includes(prop)) {
          throw new PresetMissingPropertyError(input.presetId, prop);
        }
      }
    }

    // Build timeline from preset definition
    const now = this.clock();
    const timelineId = this.idGen();
    const tracks: Track[] = [];
    for (const t of preset.definition.tracks) {
      const trackId = this.idGen();
      const keyframes: Keyframe[] = t.keyframes.map((k) => ({
        id: this.idGen(),
        trackId,
        timeMs: k.timeMs,
        value: k.value,
        ...(k.easing !== undefined ? { easing: k.easing } : {}),
      }));
      tracks.push({
        id: trackId,
        timelineId,
        property: t.property,
        keyframes,
        startOffsetMs: 0,
        easing: t.easing,
      });
    }

    // Handle trigger conversion: last slide on_enter → on_click
    let convertedTrigger = false;
    const triggers: Trigger[] = [];
    if (preset.definition.triggers) {
      for (const t of preset.definition.triggers) {
        let kind: TriggerKind = t.kind;
        if (input.isLastSlide && kind === 'on_enter') {
          kind = 'on_click';
          convertedTrigger = true;
        }
        triggers.push({
          id: this.idGen(),
          timelineId,
          kind,
          ...(t.offsetMs !== undefined ? { offsetMs: t.offsetMs } : {}),
        });
      }
    }

    const timeline: Timeline = {
      id: timelineId,
      tenantId: input.tenantId,
      deckId: input.deckId,
      slideId: input.slideId,
      elementId: input.elementId,
      durationMs: preset.definition.durationMs,
      loop: false,
      playCount: 1,
      startOffsetMs: 0,
      tracks,
      triggers,
      version: 1,
      updatedAt: now,
    };

    await this.timelines.insert(timeline);
    for (const track of tracks) {
      await this.tracks.insert(track);
      for (const kf of track.keyframes) {
        await this.keyframes.insert(kf);
      }
    }
    for (const trigger of triggers) {
      await this.triggers.insert(trigger);
    }

    return { timeline, convertedTrigger };
  }

  // -------------------------------------------------------------------------
  // Transition CRUD
  // -------------------------------------------------------------------------

  async createTransition(
    deckId: string,
    input: {
      fromSlideId: string;
      toSlideId: string;
      type: TransitionType;
      magicMoveEnabled?: boolean;
      options?: TransitionOptions;
    },
  ): Promise<Transition> {
    const record: Transition = {
      id: this.idGen(),
      deckId,
      fromSlideId: input.fromSlideId,
      toSlideId: input.toSlideId,
      type: input.type,
      magicMoveEnabled: input.magicMoveEnabled ?? false,
      options: input.options ?? {},
    };

    await this.transitions.insert(record);
    return record;
  }

  async listTransitions(deckId: string): Promise<Transition[]> {
    return this.transitions.listByDeck(deckId);
  }

  // -------------------------------------------------------------------------
  // Reduced-motion settings
  // -------------------------------------------------------------------------

  async getReducedMotion(deckId: string): Promise<ReducedMotionSettings> {
    const existing = await this.reducedMotion.findByDeck(deckId);
    if (existing) return existing;
    // Default settings
    return {
      deckId,
      mode: 'follow_os',
      maxTransitionMs: 5000,
      disableParticles: false,
      collapseScrollLinked: false,
      instantTickers: false,
    };
  }

  async putReducedMotion(
    deckId: string,
    input: {
      mode: ReducedMotionMode;
      maxTransitionMs?: number;
      disableParticles?: boolean;
      collapseScrollLinked?: boolean;
      instantTickers?: boolean;
    },
  ): Promise<ReducedMotionSettings> {
    const current = await this.getReducedMotion(deckId);
    const record: ReducedMotionSettings = {
      deckId,
      mode: input.mode,
      maxTransitionMs: input.maxTransitionMs ?? current.maxTransitionMs,
      disableParticles: input.disableParticles ?? current.disableParticles,
      collapseScrollLinked: input.collapseScrollLinked ?? current.collapseScrollLinked,
      instantTickers: input.instantTickers ?? current.instantTickers,
    };

    return this.reducedMotion.upsert(record);
  }
}
