/**
 * apps/presenter — gesture control surface barrel.
 *
 * Re-exports the gesture detector, the gesture map editor, the privacy
 * notice, and the supporting service types so consumers can do:
 *
 *   import { GestureDetector, GestureMapEditor, type GestureMap } from '@domio/presenter/components/gesture';
 */

export { GestureDetector } from './GestureDetector';
export type { GestureDetectorProps } from './GestureDetector';

export { GestureMapEditor } from './GestureMapEditor';
export type { GestureMapEditorProps } from './GestureMapEditor';

export { PrivacyNotice } from './PrivacyNotice';
export type { PrivacyNoticeProps } from './PrivacyNotice';

export {
  ALL_GESTURE_ACTIONS,
  ALL_GESTURE_KINDS,
  DEFAULT_GESTURE_MAP,
  defaultMappings,
  getGestureMap,
  listGestureEvents,
  recordGestureEvent,
  resolveAction,
  saveGestureMap,
} from '../../lib/gesture-service';
export type {
  GestureAction,
  GestureEvent,
  GestureKind,
  GestureMap,
} from '../../lib/gesture-service';
