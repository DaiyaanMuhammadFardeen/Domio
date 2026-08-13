/**
 * @domio/animation-runtime — Core type definitions.
 */

export interface Keyframe {
  /** Absolute time in milliseconds within the track. */
  readonly timeMs: number;
  /** The value at this keyframe (number, color string, or CSS-like string). */
  readonly value: number | string;
  /** Optional easing override for the segment starting at this keyframe. */
  readonly easing?: EasingFn;
}

/** Easing function: takes t in [0,1], returns eased value. */
export type EasingFn = (t: number) => number;

export interface Track {
  readonly id: string;
  /** The CSS property or logical property this track animates. */
  readonly property: string;
  readonly keyframes: Keyframe[];
  /** Offset in ms added to the track's start within the timeline. */
  readonly startOffsetMs: number;
  /** Optional easing applied to the whole track (overridden by per-keyframe easing). */
  readonly easing?: EasingFn;
}

export type TriggerKind = 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';

export interface Trigger {
  readonly kind: TriggerKind;
  /** Source element/data ID for data-driven triggers. */
  readonly sourceId?: string;
  /** Field path for data-change triggers. */
  readonly fieldPath?: string;
  /** Offset in ms relative to the trigger fire. */
  readonly offsetMs?: number;
  /** Debounce window in ms (default 250). */
  readonly debounceMs?: number;
}

export interface Timeline {
  readonly id: string;
  /** The element this timeline targets. */
  readonly elementId: string;
  readonly durationMs: number;
  /** Whether to loop the timeline. */
  readonly loop: boolean;
  /** Number of times to play (Infinity for loop=true). */
  readonly playCount: number;
  /** Global offset before this timeline starts. */
  readonly startOffsetMs: number;
  readonly tracks: readonly Track[];
  /** Triggers that can start/play this timeline. */
  readonly triggers: readonly Trigger[];
}

/** Emitted value per interpolated property per element. */
export interface InterpolatedValue {
  readonly elementId: string;
  readonly property: string;
  readonly value: number | string;
}

export interface TimelineListener {
  (values: readonly InterpolatedValue[]): void;
}

export interface PersistEvent {
  readonly type: 'persist';
  readonly timelineId: string;
  readonly elementId: string;
}

/** Worker adapter interface for offloading large interpolations. */
export interface WorkerAdapter {
  interpolate(
    track: Track,
    startTimeMs: number,
    endTimeMs: number,
    durationMs: number,
  ): number | string;
}
