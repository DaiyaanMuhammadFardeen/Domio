/**
 * apps/presenter — PhoneRemote top-level barrel.
 *
 * The PhoneRemote component is implemented at
 * `src/components/phone/PhoneRemote.tsx` (it was originally introduced
 * in Wave 4). This file re-exports it so callers that import from
 * `src/components/PhoneRemote` (e.g. S11.13 spec docs) keep working.
 *
 * Per Wave 11 §S11.13 of docs/frontend-roadmap/11-wave-novel-frontier.md,
 * the implementation now also handles haptic feedback: slide-advance
 * buzz, configurable advance patterns, and per-slide pacing
 * checkpoints via the Vibration API.
 */

export {
  PhoneRemote,
  type PhoneRemoteProps,
  type PairedDevice,
  type PacingCheckpoint,
  type VibrationPattern,
  type VibrationPulse,
} from './phone/PhoneRemote';
