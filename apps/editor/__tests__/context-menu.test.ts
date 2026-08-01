import { describe, it, expect } from 'vitest';
import { contextMenuFor } from '../src/panels/ContextMenu.js';

describe('contextMenuFor', () => {
  it('returns base items for a selection', () => {
    const items = contextMenuFor('selection');
    expect(items.find((i) => i.id === 'cut')).toBeDefined();
    expect(items.find((i) => i.id === 'copy')).toBeDefined();
    expect(items.find((i) => i.id === 'paste')).toBeDefined();
    expect(items.find((i) => i.id === 'duplicate')).toBeDefined();
    expect(items.find((i) => i.id === 'delete')).toBeDefined();
  });

  it('adds frame-clip for frames', () => {
    const items = contextMenuFor('frame');
    expect(items.find((i) => i.id === 'frame-clip')).toBeDefined();
  });

  it('adds edit-text for text', () => {
    const items = contextMenuFor('text');
    expect(items.find((i) => i.id === 'edit-text')).toBeDefined();
  });

  it('flags delete as destructive', () => {
    const items = contextMenuFor('frame');
    const del = items.find((i) => i.id === 'delete');
    expect(del?.destructive).toBe(true);
  });
});