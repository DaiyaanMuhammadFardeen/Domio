import { describe, it, expect } from 'vitest';
import {
  chordString,
  detectPlatform,
  platformMeta,
  shouldIgnoreInEditable,
} from '../src/input/keyboard.js';

describe('keyboard', () => {
  it('detects Mac via navigator user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh)')).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('win');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux)')).toBe('linux');
  });

  it('platformMeta returns true on Mac', () => {
    expect(platformMeta('mac')).toBe(true);
    expect(platformMeta('win')).toBe(false);
  });

  it('chordString maps Cmd on Mac, Ctrl elsewhere', () => {
    expect(chordString({ key: 'Z', meta: true, timestamp: 0 }, 'mac')).toBe('Cmd+Z');
    expect(chordString({ key: 'Z', meta: true, ctrl: true, timestamp: 0 }, 'win')).toBe(
      'Cmd+Ctrl+Z',
    );
  });

  it('chordString adds Alt / Shift in order', () => {
    expect(chordString({ key: 'C', meta: true, alt: true, shift: true, timestamp: 0 }, 'mac')).toBe(
      'Cmd+Alt+Shift+C',
    );
  });

  it('shouldIgnoreInEditable ignores letters but allows navigation keys', () => {
    expect(shouldIgnoreInEditable({ key: 'B', inEditable: true, timestamp: 0 })).toBe(true);
    expect(shouldIgnoreInEditable({ key: 'Escape', inEditable: true, timestamp: 0 })).toBe(false);
    expect(shouldIgnoreInEditable({ key: 'Enter', inEditable: true, timestamp: 0 })).toBe(false);
    expect(shouldIgnoreInEditable({ key: 'ArrowUp', inEditable: true, timestamp: 0 })).toBe(false);
    expect(shouldIgnoreInEditable({ key: 'B', inEditable: false, timestamp: 0 })).toBe(false);
  });
});
