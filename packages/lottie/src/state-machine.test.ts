import { describe, it, expect } from 'vitest';
import {
  listInputs,
  getInput,
  getTrigger,
  fireTrigger,
  type RiveStateMachineDescriptor,
} from './state-machine.js';

const descriptor: RiveStateMachineDescriptor = {
  name: 'MainStateMachine',
  inputs: [
    { name: 'speed', type: 'number' },
    { name: 'isPlaying', type: 'boolean' },
    { name: 'onClick', type: 'trigger' },
    { name: 'onHover', type: 'trigger' },
  ],
};

describe('state-machine', () => {
  describe('listInputs', () => {
    it('returns all inputs from a valid descriptor', () => {
      const inputs = listInputs(descriptor);
      expect(inputs).toHaveLength(4);
      expect(inputs.map(i => i.name)).toEqual([
        'speed',
        'isPlaying',
        'onClick',
        'onHover',
      ]);
    });

    it('returns empty array for descriptor with no inputs', () => {
      expect(listInputs({ name: 'empty', inputs: [] })).toHaveLength(0);
    });
  });

  describe('getInput', () => {
    it('returns an existing input by name', () => {
      const input = getInput(descriptor, 'speed');
      expect(input).toEqual({ name: 'speed', type: 'number' });
    });

    it('returns undefined for unknown input', () => {
      expect(getInput(descriptor, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getTrigger', () => {
    it('returns a trigger handle for a trigger input', () => {
      const trigger = getTrigger(descriptor, 'onClick');
      expect(trigger).toEqual({ name: 'onClick', type: 'trigger' });
    });

    it('returns undefined for a non-trigger input', () => {
      expect(getTrigger(descriptor, 'speed')).toBeUndefined();
      expect(getTrigger(descriptor, 'isPlaying')).toBeUndefined();
    });

    it('returns undefined for unknown input', () => {
      expect(getTrigger(descriptor, 'nonexistent')).toBeUndefined();
    });
  });

  describe('fireTrigger', () => {
    it('returns ok for a valid trigger', () => {
      const result = fireTrigger(descriptor, 'onClick');
      expect(result).toEqual({ ok: true, trigger: 'onClick' });
    });

    it('returns error for unknown trigger', () => {
      const result = fireTrigger(descriptor, 'nonexistent');
      expect(result).toEqual({
        ok: false,
        error: 'Unknown input "nonexistent"',
      });
    });

    it('returns error when input is not a trigger type', () => {
      const result = fireTrigger(descriptor, 'speed');
      expect(result).toEqual({
        ok: false,
        error: 'Input "speed" is type "number", not "trigger"',
      });
    });

    it('returns error for boolean input used as trigger', () => {
      const result = fireTrigger(descriptor, 'isPlaying');
      expect(result).toEqual({
        ok: false,
        error: 'Input "isPlaying" is type "boolean", not "trigger"',
      });
    });
  });
});
