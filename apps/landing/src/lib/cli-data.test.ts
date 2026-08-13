/**
 * Sanity tests for the CLI data layer. Ensures every required field is
 * populated and the data covers every supported OS.
 */

import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  INSTALLS,
  EXAMPLES,
  type CliOs,
} from './cli-data';

describe('cli-data', () => {
  it('exports a non-empty COMMANDS list', () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
  });

  it('exports a non-empty EXAMPLES list', () => {
    expect(EXAMPLES.length).toBeGreaterThan(0);
  });

  it('exports a non-empty INSTALLS list', () => {
    expect(INSTALLS.length).toBeGreaterThan(0);
  });

  it.each(COMMANDS.map((c) => c.name))('command %s has required fields', (name) => {
    const cmd = COMMANDS.find((c) => c.name === name);
    expect(cmd, `command ${name} should exist`).toBeDefined();
    expect(cmd!.name).toBe(name);
    expect(cmd!.synopsis.length).toBeGreaterThan(0);
    expect(cmd!.description.length).toBeGreaterThan(0);
    expect(Array.isArray(cmd!.flags)).toBe(true);
    for (const flag of cmd!.flags) {
      expect(flag.flag.length).toBeGreaterThan(0);
      expect(flag.description.length).toBeGreaterThan(0);
    }
  });

  it.each(EXAMPLES.map((_, i) => i))('example index %i has required fields', (i) => {
    const ex = EXAMPLES[i]!;
    expect(ex.title.length).toBeGreaterThan(0);
    expect(ex.description.length).toBeGreaterThan(0);
    expect(ex.command.length).toBeGreaterThan(0);
  });

  it('INSTALLS covers all 3 OS targets (macos, linux, windows)', () => {
    const oss = new Set<CliOs>(INSTALLS.map((s) => s.os));
    expect(oss.has('macos')).toBe(true);
    expect(oss.has('linux')).toBe(true);
    expect(oss.has('windows')).toBe(true);
  });

  it('every install snippet has a non-empty command', () => {
    for (const inst of INSTALLS) {
      expect(inst.command.length).toBeGreaterThan(0);
    }
  });
});
