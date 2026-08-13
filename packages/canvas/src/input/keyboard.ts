/**
 * Keyboard — platform-aware (Cmd vs Ctrl). Translates raw DOM KeyboardEvents
 * into a normalized `KeyboardCommand` for the editor. See
 * docs/development_phases/phase-03 §C.1: focus-aware so text-input doesn't
 * steal `B` for bold.
 */

export type KeyboardKey =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | 'Escape'
  | 'Enter'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Backspace'
  | 'Delete'
  | 'Space'
  | 'Tab'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2';

export interface NormalizedKeyboardEvent {
  key: KeyboardKey;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  /** When true, the event originated inside an editable text element. */
  inEditable?: boolean;
  /** Timestamp in ms. */
  timestamp: number;
}

export type Platform = 'mac' | 'win' | 'linux' | 'other';

export function detectPlatform(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): Platform {
  if (/Mac|iPhone|iPad/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'win';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

export function platformMeta(platform: Platform): boolean {
  return platform === 'mac';
}

/**
 * Build the chord string for a normalized keyboard event.
 *   "Cmd+Z", "Cmd+Shift+Z", "Cmd+Alt+C", "Escape"
 *
 * The chord always reflects the raw modifier flags (Ctrl stays Ctrl, Meta
 * stays Cmd). This lets shortcut-conflict detection distinguish "real
 * Ctrl" from "Meta-as-Cmd", which Mac users emit when bridging hotkeys.
 */
export function chordString(event: NormalizedKeyboardEvent, _platform: Platform): string {
  const parts: string[] = [];
  if (event.meta) parts.push('Cmd');
  if (event.ctrl) parts.push('Ctrl');
  if (event.alt) parts.push('Alt');
  if (event.shift) parts.push('Shift');
  parts.push(event.key);
  return parts.join('+');
}

export function shouldIgnoreInEditable(event: NormalizedKeyboardEvent): boolean {
  if (!event.inEditable) return false;
  // Escape/Enter and arrow keys still navigate while editing.
  if (
    event.key === 'Escape' ||
    event.key === 'Enter' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight'
  ) {
    return false;
  }
  return true;
}
