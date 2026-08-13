/**
 * Gestures — high-level recognition built on top of pointer + keyboard
 * intents. Recognizes drag, pinch, marquee, and chord (e.g. G then G).
 */

import type { Intent } from './pointer.js';

export interface GestureState {
  isDragging(): boolean;
  isMarquee(): boolean;
  isPinching(): boolean;
}

export function classifyIntent(
  intent: Intent,
): { kind: 'drag' | 'marquee' | 'pinch' | 'textEdit' | 'commit' | 'cancel' } | null {
  switch (intent.kind) {
    case 'beginDrag':
    case 'updateDrag':
    case 'endDrag':
      return { kind: 'drag' };
    case 'beginMarquee':
    case 'updateMarquee':
    case 'endMarquee':
      return { kind: 'marquee' };
    case 'beginPinch':
    case 'updatePinch':
    case 'endPinch':
      return { kind: 'pinch' };
    case 'beginTextEdit':
      return { kind: 'textEdit' };
    case 'commitOp':
      return { kind: 'commit' };
    case 'cancel':
      return { kind: 'cancel' };
  }
}
