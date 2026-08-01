import { describe, it, expect } from 'vitest';
import { createPenTool, feedPenTool } from '../src/pen/pen-tool.js';
import { pathToSvg, appendAnchor, closePath, emptyPath } from '../src/pen/path.js';

describe('vector pen', () => {
  it('click adds an anchor', () => {
    let state = createPenTool();
    const result = feedPenTool(state, {
      type: 'pointer',
      pointer: { kind: 'down', pointerId: 1, x: 10, y: 10, timestamp: 0 },
    });
    state = result.state;
    expect(state.path.anchors).toHaveLength(1);
  });

  it('double-click closes the path', () => {
    let state = createPenTool();
    state = feedPenTool(state, {
      type: 'pointer',
      pointer: { kind: 'down', pointerId: 1, x: 0, y: 0, timestamp: 0 },
    }).state;
    state = feedPenTool(state, {
      type: 'pointer',
      pointer: { kind: 'down', pointerId: 1, x: 10, y: 0, timestamp: 0 },
    }).state;
    state = feedPenTool(state, {
      type: 'pointer',
      pointer: { kind: 'down', pointerId: 1, x: 10, y: 10, timestamp: 0 },
    }).state;
    const result = feedPenTool(state, { type: 'double-click' });
    expect(result.closed).toBe(true);
    expect(result.state.path.closed).toBe(true);
  });

  it('Escape ends an open path', () => {
    let state = createPenTool();
    state = feedPenTool(state, {
      type: 'pointer',
      pointer: { kind: 'down', pointerId: 1, x: 0, y: 0, timestamp: 0 },
    }).state;
    const result = feedPenTool(state, { type: 'escape' });
    expect(result.cancelled).toBe(true);
    expect(result.state.path.anchors).toHaveLength(0);
  });

  it('alt breaks handle symmetry', () => {
    let state = createPenTool();
    state = feedPenTool(state, {
      type: 'pointer',
      pointer: {
        kind: 'down',
        pointerId: 1,
        x: 0,
        y: 0,
        timestamp: 0,
        modifiers: { alt: true },
      },
    }).state;
    expect(state.path.anchors[0]!.inX).toBe(0);
    expect(state.path.anchors[0]!.outX).toBe(0);
  });

  it('pathToSvg emits a closed SVG path', () => {
    let path = emptyPath();
    path = appendAnchor(path, { x: 0, y: 0, inX: 0, inY: 0, outX: 10, outY: 0 });
    path = appendAnchor(path, { x: 100, y: 0, inX: -10, inY: 0, outX: 10, outY: 0 });
    path = appendAnchor(path, { x: 100, y: 100, inX: 0, inY: -10, outX: 0, outY: 10 });
    path = closePath(path);
    const svg = pathToSvg(path);
    expect(svg.startsWith('M0,0')).toBe(true);
    expect(svg.endsWith('Z')).toBe(true);
  });
});