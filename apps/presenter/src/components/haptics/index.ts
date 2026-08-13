/**
 * apps/presenter — haptics barrel.
 *
 * Re-exports the haptic feedback components (pattern editor, pacing
 * checkpoint list) and the supporting service types so consumers can do:
 *
 *   import {
 *     HapticPatternEditor,
 *     PacingCheckpointList,
 *     type VibrationPattern,
 *   } from '@domio/presenter/components/haptics';
 */

export { HapticPatternEditor } from '../HapticPatternEditor';
export type { HapticPatternEditorProps } from '../HapticPatternEditor';

export { PacingCheckpointList } from '../PacingCheckpointList';
export type { PacingCheckpointListProps } from '../PacingCheckpointList';

export {
  BUILTIN_PATTERNS,
  LONG_PATTERN,
  MEDIUM_PATTERN,
  PRESET_PATTERN_IDS,
  SHORT_PATTERN,
  blankCheckpoint,
  blankPattern,
  deletePattern,
  getPattern,
  listPacingCheckpoints,
  listPatterns,
  patternToVibrateSequence,
  savePacingCheckpoints,
  savePattern,
  triggerAdvanceVibrate,
  triggerVibrate,
} from '../../lib/haptics-service';
export type {
  PacingCheckpoint,
  VibrationPattern,
  VibrationPulse,
} from '../../lib/haptics-service';
