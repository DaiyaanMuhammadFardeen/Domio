/**
 * Sanity tests for the Plugin SDK portal data module.
 *
 * These guards catch regressions if the catalogue is ever trimmed
 * below the documented surface area or if a tutorial loses its
 * required metadata.
 */

import { describe, expect, it } from 'vitest';
import {
  PUBLISH_STEPS,
  QUICKSTART_SNIPPETS,
  SAMPLE_PLUGIN_REPO_URL,
  TUTORIALS,
  type PluginTutorial,
  type PublishStep,
} from './plugin-sdk-data';

describe('plugin-sdk-data', () => {
  it('exposes three tutorials covering canvas, connector, and export surfaces', () => {
    expect(TUTORIALS).toHaveLength(3);
    const slugs = TUTORIALS.map((t) => t.slug);
    expect(slugs).toContain('canvas-plugin');
    expect(slugs).toContain('data-connector');
    expect(slugs).toContain('export-format');
  });

  it('every tutorial has a positive time estimate and a known difficulty', () => {
    const allowed: ReadonlyArray<PluginTutorial['difficulty']> = [
      'beginner',
      'intermediate',
      'advanced',
    ];
    for (const tutorial of TUTORIALS) {
      expect(tutorial.title.length).toBeGreaterThan(0);
      expect(tutorial.description.length).toBeGreaterThan(0);
      expect(tutorial.time_estimate_min).toBeGreaterThan(0);
      expect(allowed).toContain(tutorial.difficulty);
    }
  });

  it('exposes five ordered publish steps covering the full lifecycle', () => {
    expect(PUBLISH_STEPS).toHaveLength(5);
    PUBLISH_STEPS.forEach((step, index) => {
      const expected: PublishStep = {
        step: index + 1,
        title: step.title,
        description: step.description,
      };
      expect(step).toEqual(expected);
    });
  });

  it('points the sample plugin repo at the public template', () => {
    expect(SAMPLE_PLUGIN_REPO_URL).toMatch(/^https:\/\/github\.com\/domio\/plugin-template$/);
  });

  it('ships quickstart snippets for every documented step', () => {
    expect(QUICKSTART_SNIPPETS.install.length).toBeGreaterThan(0);
    expect(QUICKSTART_SNIPPETS.scaffold.length).toBeGreaterThan(0);
    expect(QUICKSTART_SNIPPETS.implement.length).toBeGreaterThan(0);
    expect(QUICKSTART_SNIPPETS.test.length).toBeGreaterThan(0);
    expect(QUICKSTART_SNIPPETS.publish.length).toBeGreaterThan(0);
    expect(QUICKSTART_SNIPPETS.implement).toContain('definePlugin');
  });
});
