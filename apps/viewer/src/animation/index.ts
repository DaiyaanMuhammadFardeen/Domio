/**
 * @domio/viewer — Animation module barrel exports.
 */

export {
  resolveScrollBinding,
  ScrollLinkedError,
  type ScrollBinding,
  type ScrollProperty,
  type ScrollProgressCache,
} from './scroll-linked.js';

export {
  createReducedMotionGuard,
  type ReducedMotionGuard,
  type ReducedMotionGuardConfig,
  type ReducedMotionMode,
} from './reduced-motion.js';

export {
  createPlaybackEngine,
  PlaybackError,
  type PlaybackEngine,
  type PlaybackListener,
  type PlaybackOptions,
} from './playback.js';

export {
  transitionDuration,
  transitionProps,
  appliesReducedMotion,
  TransitionError,
  type TransitionKind,
  type TransitionProps,
} from './transitions.js';
