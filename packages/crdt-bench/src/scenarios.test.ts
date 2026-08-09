import { describe, it, expect } from 'vitest';
import {
  ALL_SCENARIOS,
  SCENARIO_MIXED_1K,
  SCENARIO_TEXT_INSERT_SMOKE,
  SCENARIO_SHAPE_ADD_CI,
  SCENARIO_TEXT_INSERT_SOAK,
  getScenario,
} from './scenarios.js';

describe('ALL_SCENARIOS', () => {
  it('includes the four headline presets', () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThanOrEqual(4);
    const names = ALL_SCENARIOS.map((s) => s.name);
    expect(names).toContain('text-insert');
    expect(names).toContain('mixed');
    expect(names).toContain('shape-add');
  });

  it('every preset has non-zero editorCount and editsPerEditor', () => {
    for (const preset of ALL_SCENARIOS) {
      expect(preset.options.editorCount).toBeGreaterThan(0);
      expect(preset.options.editsPerEditor).toBeGreaterThan(0);
      expect(preset.options.editIntervalMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('SCENARIO_MIXED_1K hits the 1000-editor headline', () => {
    expect(SCENARIO_MIXED_1K.name).toBe('mixed');
    expect(SCENARIO_MIXED_1K.options.editorCount).toBe(1000);
    expect(SCENARIO_MIXED_1K.options.editIntervalMs).toBe(0);
  });

  it('SCENARIO_TEXT_INSERT_SOAK is a 100×1000 soak', () => {
    expect(SCENARIO_TEXT_INSERT_SOAK.options.editorCount).toBe(100);
    expect(SCENARIO_TEXT_INSERT_SOAK.options.editsPerEditor).toBe(1000);
  });

  it('SCENARIO_SHAPE_ADD_CI is the 500×100 CI preset', () => {
    expect(SCENARIO_SHAPE_ADD_CI.options.editorCount).toBe(500);
    expect(SCENARIO_SHAPE_ADD_CI.options.editsPerEditor).toBe(100);
  });

  it('SCENARIO_TEXT_INSERT_SMOKE is the 100×50 smoke preset', () => {
    expect(SCENARIO_TEXT_INSERT_SMOKE.options.editorCount).toBe(100);
    expect(SCENARIO_TEXT_INSERT_SMOKE.options.editsPerEditor).toBe(50);
  });
});

describe('getScenario', () => {
  it('returns headline mixed for mixed/headline', () => {
    expect(getScenario('mixed', 'headline')).toBe(SCENARIO_MIXED_1K);
  });
  it('returns soak preset for text-insert/soak', () => {
    expect(getScenario('text-insert', 'soak')).toBe(SCENARIO_TEXT_INSERT_SOAK);
  });
  it('returns CI preset for shape-add/ci', () => {
    expect(getScenario('shape-add', 'ci')).toBe(SCENARIO_SHAPE_ADD_CI);
  });
  it('falls back to smoke for unknown combinations', () => {
    expect(getScenario('slide-insert', 'ci')).toBe(SCENARIO_TEXT_INSERT_SMOKE);
  });
});
