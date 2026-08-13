/**
 * Sanity tests for the demo gallery data module (Wave 12 §S12.6).
 *
 * Guards against regressions if the catalogue is ever trimmed below the
 * documented surface area (12+ demos), if a demo loses a required URL,
 * or if the tag set drifts away from the filter chips the page renders.
 */

import { describe, expect, it } from 'vitest';
import { DEMOS, DEMO_TAGS, type DemoEntry } from './demo-data';

describe('demo-data', () => {
  it('exposes at least 12 demo entries covering every documented feature', () => {
    expect(DEMOS.length).toBeGreaterThanOrEqual(12);

    const requiredFeatures: ReadonlyArray<string> = [
      'editor-canvas',
      'scenario-toggle',
      'ai-copilot',
      'presenter-live',
      'polls',
      'two-way-slider',
      'voice-trigger',
      'gaze-highlight',
      'gesture-control',
      'kiosk',
      'marketplace',
      'knowledge-graph',
    ];
    const ids = new Set(DEMOS.map((d) => d.id));
    for (const required of requiredFeatures) {
      expect(ids.has(required), `demo ${required} must exist`).toBe(true);
    }
  });

  it('every demo has a non-empty viewer URL, editor URL, and thumbnail alt text', () => {
    for (const demo of DEMOS) {
      expect(demo.title.length, `${demo.id} title`).toBeGreaterThan(0);
      expect(demo.description.length, `${demo.id} description`).toBeGreaterThan(0);
      expect(demo.feature_slug.length, `${demo.id} feature_slug`).toBeGreaterThan(0);
      expect(demo.thumbnail_alt.length, `${demo.id} thumbnail_alt`).toBeGreaterThan(0);
      expect(demo.viewer_url.length, `${demo.id} viewer_url`).toBeGreaterThan(0);
      expect(demo.editor_url.length, `${demo.id} editor_url`).toBeGreaterThan(0);
    }
  });

  it('every viewer URL points at the viewer dev host and every editor URL at the editor dev host', () => {
    for (const demo of DEMOS) {
      expect(demo.viewer_url).toMatch(/^http:\/\/localhost:3200\//);
      expect(demo.editor_url).toMatch(/^http:\/\/localhost:3100\//);
    }
  });

  it('every demo has at least one tag and only uses known tags', () => {
    const knownTags = new Set<string>(DEMO_TAGS);
    for (const demo of DEMOS) {
      expect(demo.tags.length, `${demo.id} tags`).toBeGreaterThan(0);
      for (const tag of demo.tags) {
        expect(knownTags.has(tag), `${demo.id} tag ${tag} must be in DEMO_TAGS`).toBe(true);
      }
    }
  });

  it('every demo id is unique', () => {
    const ids = DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every demo shares its editor deck id with its viewer deck id', () => {
    for (const demo of DEMOS) {
      const editorPath = new URL(demo.editor_url).pathname.replace(/^\//, '');
      const viewerPath = new URL(demo.viewer_url).pathname.replace(/^\//, '');
      expect(editorPath).toBe(viewerPath);
    }
  });

  it('honours the typed shape — readonly arrays, readonly strings', () => {
    for (const demo of DEMOS as ReadonlyArray<DemoEntry>) {
      // Sanity: ids/titles are plain strings, tags is a tuple-typed array.
      expect(typeof demo.id).toBe('string');
      expect(Array.isArray(demo.tags)).toBe(true);
    }
  });
});