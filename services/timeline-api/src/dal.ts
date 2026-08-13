/**
 * Timeline API — persistence layer (Phase 09).
 *
 * Repository interfaces + in-memory implementations for:
 *   - Timelines (per-element animation definitions)
 *   - Tracks (per-property keyframe sequences)
 *   - Keyframes (individual animation poses)
 *   - Triggers (event-based animation launchers)
 *   - Easing curves (named interpolation definitions)
 *   - Animation presets (reusable animation bundles)
 *   - Transitions (slide-to-slide effects)
 *   - Reduced-motion settings (per-deck a11y config)
 *
 * All repositories are tenant-scoped (workspace or org id).
 */

// ---------------------------------------------------------------------------
// Domain records
// ---------------------------------------------------------------------------

export interface Timeline {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly slideId: string;
  readonly elementId: string;
  readonly durationMs: number;
  readonly loop: boolean;
  readonly playCount: number;
  readonly startOffsetMs: number;
  readonly tracks: readonly Track[];
  readonly triggers: readonly Trigger[];
  readonly version: number;
  readonly updatedAt: Date;
}

export interface Track {
  readonly id: string;
  readonly timelineId: string;
  readonly property: string;
  readonly keyframes: readonly Keyframe[];
  readonly startOffsetMs: number;
  readonly easing: string;
}

export interface Keyframe {
  readonly id: string;
  readonly trackId: string;
  readonly timeMs: number;
  readonly value: unknown;
  readonly easing?: string;
}

export type TriggerKind = 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';

export interface Trigger {
  readonly id: string;
  readonly timelineId: string;
  readonly kind: TriggerKind;
  readonly sourceId?: string;
  readonly fieldPath?: string;
  readonly offsetMs?: number;
  readonly debounceMs?: number;
}

export type EasingCurveType = 'linear' | 'cubic_bezier' | 'spring' | 'physics' | 'step';

export interface EasingCurveParams {
  /** For cubic_bezier: [x1, y1, x2, y2] */
  readonly bezier?: readonly [number, number, number, number];
  /** For spring: { mass, stiffness, damping } */
  readonly spring?: { readonly mass: number; readonly stiffness: number; readonly damping: number };
  /** For physics: { friction, strength } */
  readonly physics?: { readonly friction: number; readonly strength: number };
  /** For step: number of steps */
  readonly steps?: number;
}

export interface EasingCurve {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly type: EasingCurveType;
  readonly params: EasingCurveParams;
  readonly lutVersion: number;
  readonly builtIn: boolean;
}

export type AnimationPresetCategory = 'entrance' | 'exit' | 'emphasis';

export interface AnimationPresetDefinition {
  readonly durationMs: number;
  readonly tracks: ReadonlyArray<{
    readonly property: string;
    readonly keyframes: ReadonlyArray<{
      readonly timeMs: number;
      readonly value: unknown;
      readonly easing?: string;
    }>;
    readonly easing: string;
  }>;
  readonly triggers?: ReadonlyArray<{
    readonly kind: TriggerKind;
    readonly offsetMs?: number;
  }>;
  readonly requiredProperties?: readonly string[];
}

export interface AnimationPreset {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly category: AnimationPresetCategory;
  readonly tags: readonly string[];
  readonly definition: AnimationPresetDefinition;
  readonly builtIn: boolean;
}

export type TransitionType = 'fade' | 'slide' | 'zoom' | 'dissolve' | 'push' | 'wipe' | 'morph';

export interface TransitionOptions {
  readonly durationMs?: number;
  readonly easing?: string;
  readonly direction?: 'left' | 'right' | 'up' | 'down';
}

export interface Transition {
  readonly id: string;
  readonly deckId: string;
  readonly fromSlideId: string;
  readonly toSlideId: string;
  readonly type: TransitionType;
  readonly magicMoveEnabled: boolean;
  readonly options: TransitionOptions;
}

export type ReducedMotionMode = 'follow_os' | 'always_reduced' | 'always_full';

export interface ReducedMotionSettings {
  readonly deckId: string;
  readonly mode: ReducedMotionMode;
  readonly maxTransitionMs: number;
  readonly disableParticles: boolean;
  readonly collapseScrollLinked: boolean;
  readonly instantTickers: boolean;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface TimelineRepository {
  insert(record: Timeline): Promise<void>;
  update(
    id: string,
    tenantId: string,
    patch: Partial<Omit<Timeline, 'id' | 'tenantId' | 'createdAt'>>,
    version: number,
  ): Promise<Timeline>;
  findById(id: string, tenantId: string): Promise<Timeline | null>;
  listByDeck(deckId: string, tenantId: string): Promise<Timeline[]>;
  delete(id: string, tenantId: string): Promise<void>;
  nextVersion(id: string, tenantId: string): Promise<number>;
}

export interface TrackRepository {
  insert(record: Track): Promise<void>;
  findById(id: string): Promise<Track | null>;
  listByTimeline(timelineId: string): Promise<Track[]>;
  delete(id: string): Promise<void>;
}

export interface KeyframeRepository {
  insert(record: Keyframe): Promise<void>;
  findById(id: string): Promise<Keyframe | null>;
  listByTrack(trackId: string): Promise<Keyframe[]>;
  delete(id: string): Promise<void>;
}

export interface TriggerRepository {
  insert(record: Trigger): Promise<void>;
  findById(id: string): Promise<Trigger | null>;
  listByTimeline(timelineId: string): Promise<Trigger[]>;
  delete(id: string): Promise<void>;
}

export interface EasingCurveRepository {
  insert(record: EasingCurve): Promise<void>;
  update(
    id: string,
    workspaceId: string,
    patch: Partial<Omit<EasingCurve, 'id' | 'workspaceId'>>,
  ): Promise<EasingCurve>;
  findById(id: string, workspaceId: string): Promise<EasingCurve | null>;
  listByWorkspace(workspaceId: string): Promise<EasingCurve[]>;
  delete(id: string, workspaceId: string): Promise<void>;
}

export interface AnimationPresetRepository {
  insert(record: AnimationPreset): Promise<void>;
  findById(id: string, workspaceId: string): Promise<AnimationPreset | null>;
  listByWorkspace(
    workspaceId: string,
    filters?: { category?: AnimationPresetCategory; tag?: string },
  ): Promise<AnimationPreset[]>;
  delete(id: string, workspaceId: string): Promise<void>;
}

export interface TransitionRepository {
  insert(record: Transition): Promise<void>;
  update(id: string, patch: Partial<Omit<Transition, 'id'>>): Promise<Transition>;
  findById(id: string): Promise<Transition | null>;
  listByDeck(deckId: string): Promise<Transition[]>;
  delete(id: string): Promise<void>;
}

export interface ReducedMotionRepository {
  upsert(record: ReducedMotionSettings): Promise<ReducedMotionSettings>;
  findByDeck(deckId: string): Promise<ReducedMotionSettings | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryTimelineRepository implements TimelineRepository {
  private store = new Map<string, Timeline>();
  private k(r: Timeline): string {
    return `${r.tenantId}::${r.id}`;
  }

  async insert(record: Timeline): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async update(
    id: string,
    tenantId: string,
    patch: Partial<Omit<Timeline, 'id' | 'tenantId' | 'createdAt'>>,
    version: number,
  ): Promise<Timeline> {
    const existing = await this.findById(id, tenantId);
    if (!existing) throw new TimelineNotFoundError(id);
    if (existing.version !== version) {
      throw new VersionConflictError(id, existing.version);
    }
    const updated: Timeline = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: new Date(),
    };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async findById(id: string, tenantId: string): Promise<Timeline | null> {
    return this.store.get(`${tenantId}::${id}`) ?? null;
  }

  async listByDeck(deckId: string, tenantId: string): Promise<Timeline[]> {
    const out: Timeline[] = [];
    for (const r of this.store.values()) {
      if (r.tenantId === tenantId && r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store.delete(`${tenantId}::${id}`);
  }

  async nextVersion(id: string, tenantId: string): Promise<number> {
    const existing = await this.findById(id, tenantId);
    return existing ? existing.version + 1 : 1;
  }
}

export class InMemoryTrackRepository implements TrackRepository {
  private store = new Map<string, Track>();
  async insert(record: Track): Promise<void> {
    this.store.set(record.id, record);
  }
  async findById(id: string): Promise<Track | null> {
    return this.store.get(id) ?? null;
  }
  async listByTimeline(timelineId: string): Promise<Track[]> {
    const out: Track[] = [];
    for (const r of this.store.values()) {
      if (r.timelineId === timelineId) out.push(r);
    }
    return out;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryKeyframeRepository implements KeyframeRepository {
  private store = new Map<string, Keyframe>();
  async insert(record: Keyframe): Promise<void> {
    this.store.set(record.id, record);
  }
  async findById(id: string): Promise<Keyframe | null> {
    return this.store.get(id) ?? null;
  }
  async listByTrack(trackId: string): Promise<Keyframe[]> {
    const out: Keyframe[] = [];
    for (const r of this.store.values()) {
      if (r.trackId === trackId) out.push(r);
    }
    return out;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryTriggerRepository implements TriggerRepository {
  private store = new Map<string, Trigger>();
  async insert(record: Trigger): Promise<void> {
    this.store.set(record.id, record);
  }
  async findById(id: string): Promise<Trigger | null> {
    return this.store.get(id) ?? null;
  }
  async listByTimeline(timelineId: string): Promise<Trigger[]> {
    const out: Trigger[] = [];
    for (const r of this.store.values()) {
      if (r.timelineId === timelineId) out.push(r);
    }
    return out;
  }
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryEasingCurveRepository implements EasingCurveRepository {
  private store = new Map<string, EasingCurve>();
  private k(r: EasingCurve): string {
    return `${r.workspaceId}::${r.id}`;
  }

  async insert(record: EasingCurve): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: Partial<Omit<EasingCurve, 'id' | 'workspaceId'>>,
  ): Promise<EasingCurve> {
    const existing = await this.findById(id, workspaceId);
    if (!existing) throw new EasingCurveNotFoundError(id);
    const updated: EasingCurve = { ...existing, ...patch };
    this.store.set(this.k(updated), updated);
    return updated;
  }

  async findById(id: string, workspaceId: string): Promise<EasingCurve | null> {
    return this.store.get(`${workspaceId}::${id}`) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<EasingCurve[]> {
    const out: EasingCurve[] = [];
    for (const r of this.store.values()) {
      if (r.workspaceId === workspaceId) out.push(r);
    }
    return out;
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    this.store.delete(`${workspaceId}::${id}`);
  }
}

export class InMemoryAnimationPresetRepository implements AnimationPresetRepository {
  private store = new Map<string, AnimationPreset>();
  private k(r: AnimationPreset): string {
    return `${r.workspaceId}::${r.id}`;
  }

  async insert(record: AnimationPreset): Promise<void> {
    this.store.set(this.k(record), record);
  }

  async findById(id: string, workspaceId: string): Promise<AnimationPreset | null> {
    return this.store.get(`${workspaceId}::${id}`) ?? null;
  }

  async listByWorkspace(
    workspaceId: string,
    filters?: { category?: AnimationPresetCategory; tag?: string },
  ): Promise<AnimationPreset[]> {
    const out: AnimationPreset[] = [];
    for (const r of this.store.values()) {
      if (r.workspaceId !== workspaceId) continue;
      if (filters?.category && r.category !== filters.category) continue;
      if (filters?.tag && !r.tags.includes(filters.tag)) continue;
      out.push(r);
    }
    return out;
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    this.store.delete(`${workspaceId}::${id}`);
  }
}

export class InMemoryTransitionRepository implements TransitionRepository {
  private store = new Map<string, Transition>();

  async insert(record: Transition): Promise<void> {
    this.store.set(record.id, record);
  }

  async update(id: string, patch: Partial<Omit<Transition, 'id'>>): Promise<Transition> {
    const existing = await this.findById(id);
    if (!existing) throw new TransitionNotFoundError(id);
    const updated: Transition = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<Transition | null> {
    return this.store.get(id) ?? null;
  }

  async listByDeck(deckId: string): Promise<Transition[]> {
    const out: Transition[] = [];
    for (const r of this.store.values()) {
      if (r.deckId === deckId) out.push(r);
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryReducedMotionRepository implements ReducedMotionRepository {
  private store = new Map<string, ReducedMotionSettings>();

  async upsert(record: ReducedMotionSettings): Promise<ReducedMotionSettings> {
    this.store.set(record.deckId, record);
    return record;
  }

  async findByDeck(deckId: string): Promise<ReducedMotionSettings | null> {
    return this.store.get(deckId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class TimelineNotFoundError extends Error {
  readonly code = 'TIMELINE_NOT_FOUND' as const;
  constructor(public readonly timelineId: string) {
    super(`Timeline ${timelineId} not found`);
    this.name = 'TimelineNotFoundError';
  }
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT' as const;
  constructor(
    public readonly resourceId: string,
    public readonly currentVersion: number,
  ) {
    super(
      `Version conflict on ${resourceId}: expected different version, current is ${currentVersion}`,
    );
    this.name = 'VersionConflictError';
  }
}

export class TrackNotFoundError extends Error {
  readonly code = 'TRACK_NOT_FOUND' as const;
  constructor(public readonly trackId: string) {
    super(`Track ${trackId} not found`);
    this.name = 'TrackNotFoundError';
  }
}

export class KeyframeNotFoundError extends Error {
  readonly code = 'KEYFRAME_NOT_FOUND' as const;
  constructor(public readonly keyframeId: string) {
    super(`Keyframe ${keyframeId} not found`);
    this.name = 'KeyframeNotFoundError';
  }
}

export class TriggerNotFoundError extends Error {
  readonly code = 'TRIGGER_NOT_FOUND' as const;
  constructor(public readonly triggerId: string) {
    super(`Trigger ${triggerId} not found`);
    this.name = 'TriggerNotFoundError';
  }
}

export class EasingCurveNotFoundError extends Error {
  readonly code = 'EASING_CURVE_NOT_FOUND' as const;
  constructor(public readonly curveId: string) {
    super(`Easing curve ${curveId} not found`);
    this.name = 'EasingCurveNotFoundError';
  }
}

export class AnimationPresetNotFoundError extends Error {
  readonly code = 'ANIMATION_PRESET_NOT_FOUND' as const;
  constructor(public readonly presetId: string) {
    super(`Animation preset ${presetId} not found`);
    this.name = 'AnimationPresetNotFoundError';
  }
}

export class TransitionNotFoundError extends Error {
  readonly code = 'TRANSITION_NOT_FOUND' as const;
  constructor(public readonly transitionId: string) {
    super(`Transition ${transitionId} not found`);
    this.name = 'TransitionNotFoundError';
  }
}
