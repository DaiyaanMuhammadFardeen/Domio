/**
 * @domio/animation-runtime — Public API.
 */

// Types
export type {
  Keyframe,
  EasingFn,
  Track,
  TriggerKind,
  Trigger,
  Timeline,
  InterpolatedValue,
  TimelineListener,
  PersistEvent,
  WorkerAdapter,
} from './types.js';

// Interpolation
export { interpolate } from './interpolate.js';

// Engine
export { TimelineEngine } from './TimelineEngine.js';

// Trigger resolver
export { TriggerResolver } from './TriggerResolver.js';

// Stagger
export { applyStagger, type StaggerDirection, type StaggerOptions } from './Stagger.js';

// Reduced motion
export { ReducedMotion, type ReducedMotionMode } from './ReducedMotion.js';

// Scroll-linked
export { ScrollLinked, type ScrollLinkedBinding } from './ScrollLinked.js';
