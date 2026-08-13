/**
 * Barrel for the presenter PiP / overlay components.
 *
 * Per Wave 4 §S4.6 (PiPBubble, VirtualBackground) and Wave 11 §S11.3
 * (gaze-guided highlighting).
 */

export { GazeHighlight, type GazeHighlightProps } from './GazeHighlight';
export { GazePrivacyNotice, type GazePrivacyNoticeProps } from './GazePrivacyNotice';
export { GazeCalibration, type GazeCalibrationProps } from './GazeCalibration';
export { PiPBubble, type PiPBubbleProps } from './PiPBubble';
export { VirtualBackgroundSelector, type VirtualBackgroundSelectorProps } from './VirtualBackgroundSelector';
export { PipPanel } from './PipPanel';
