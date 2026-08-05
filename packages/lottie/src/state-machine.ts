/**
 * Rive state-machine descriptor and trigger management.
 *
 * Owns the data-layer configuration for Rive state machines — parsing
 * descriptors, resolving inputs, and firing triggers as pure events.
 * No runtime dependency on @rive-app/canvas.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported Rive input types. */
export type RiveInputType = 'number' | 'boolean' | 'trigger';

/** A single input defined in a state-machine descriptor. */
export interface RiveInput {
  name: string;
  type: RiveInputType;
}

/** A state-machine descriptor (mirrors the `state_machine` JSONB column). */
export interface RiveStateMachineDescriptor {
  /** Unique name for this state machine. */
  name: string;
  /** Input definitions. */
  inputs: RiveInput[];
}

/** Result of firing a trigger. */
export interface TriggerResult {
  ok: true;
  /** The name of the trigger that was fired. */
  trigger: string;
}

/** Error when a trigger operation fails. */
export interface TriggerError {
  ok: false;
  /** Human-readable error message. */
  error: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all inputs declared in a state-machine descriptor.
 */
export function listInputs(
  descriptor: RiveStateMachineDescriptor,
): RiveInput[] {
  return descriptor.inputs ?? [];
}

/**
 * Get an input by name. Returns `undefined` if not found.
 */
export function getInput(
  descriptor: RiveStateMachineDescriptor,
  name: string,
): RiveInput | undefined {
  return listInputs(descriptor).find(i => i.name === name);
}

/**
 * Get a trigger input by name. Returns a trigger handle (the input itself)
 * or `undefined` if the input doesn't exist or isn't a trigger.
 */
export function getTrigger(
  descriptor: RiveStateMachineDescriptor,
  name: string,
): RiveInput | undefined {
  const input = getInput(descriptor, name);
  if (!input || input.type !== 'trigger') return undefined;
  return input;
}

/**
 * Fire a trigger on a state-machine descriptor.
 *
 * This is a **pure event** — it returns ok/error without side effects.
 * The caller is responsible for actually sending the trigger to the
 * Rive runtime.
 *
 * @returns TriggerResult on success, TriggerError on failure.
 */
export function fireTrigger(
  descriptor: RiveStateMachineDescriptor,
  name: string,
): TriggerResult | TriggerError {
  const input = getInput(descriptor, name);

  if (!input) {
    return { ok: false, error: `Unknown input "${name}"` };
  }

  if (input.type !== 'trigger') {
    return {
      ok: false,
      error: `Input "${name}" is type "${input.type}", not "trigger"`,
    };
  }

  return { ok: true, trigger: name };
}
