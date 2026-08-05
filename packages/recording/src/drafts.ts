/**
 * Resumable draft state machine for screen recording.
 *
 * State transitions:
 *   idle → recording → paused → recording → finalized
 *
 * Implements a pure reducer pattern. Each chunk (blob) is appended with a
 * timestamp. `resume()` continues from the last chunk. `finalize()` returns
 * the blob list and total duration. `recoverDraft()` reconstructs duration
 * from chunk timestamps for crash recovery.
 */

/** Represents a single recorded chunk with timing metadata. */
export interface RecordingChunk {
  /** The blob data. */
  readonly blob: Blob;
  /** Timestamp when this chunk was recorded (ms since epoch or monotonic). */
  readonly timestamp: number;
}

/** The possible states of the draft state machine. */
export type DraftState = "idle" | "recording" | "paused" | "finalized";

/** Action types for the reducer. */
export type DraftAction =
  | { readonly type: "start" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "finalize" };

/** Result of finalizing a draft. */
export interface FinalizedDraft {
  readonly chunks: readonly RecordingChunk[];
  readonly durationMs: number;
}

/** Full state of the draft machine. */
export interface DraftMachine {
  readonly state: DraftState;
  readonly chunks: readonly RecordingChunk[];
  readonly startedAt: number | null;
}

/** Error thrown on invalid state transitions. */
export class InvalidTransitionError extends Error {
  constructor(from: DraftState, action: DraftState) {
    super(`Invalid transition: cannot ${action} from state ${from}`);
    this.name = "InvalidTransitionError";
  }
}

const VALID_TRANSITIONS: Record<DraftState, DraftState[]> = {
  idle: ["recording"],
  recording: ["paused", "finalized"],
  paused: ["recording", "finalized"],
  finalized: [],
};

/**
 * Pure reducer — returns a new machine given the current state and action.
 * Throws `InvalidTransitionError` for illegal transitions.
 */
export function draftReducer(
  machine: DraftMachine,
  action: DraftAction,
  now: number,
): DraftMachine {
  const allowed = VALID_TRANSITIONS[machine.state];
  const nextTarget: DraftState =
    action.type === "start"
      ? "recording"
      : action.type === "pause"
        ? "paused"
        : action.type === "resume"
          ? "recording"
          : "finalized";
  if (!allowed.includes(nextTarget)) {
    throw new InvalidTransitionError(machine.state, nextTarget);
  }
  switch (action.type) {
    case "start":
      return { state: "recording", chunks: [], startedAt: now };
    case "pause":
      return { ...machine, state: "paused" };
    case "resume":
      return { ...machine, state: "recording" };
    case "finalize":
      return { ...machine, state: "finalized" };
  }
}

/**
 * Append a chunk to a recording machine. The machine must be in
 * `recording` state.
 */
export function appendChunk(
  machine: DraftMachine,
  chunk: RecordingChunk,
): DraftMachine {
  if (machine.state !== "recording") {
    throw new InvalidTransitionError(machine.state, "recording");
  }
  return { ...machine, chunks: [...machine.chunks, chunk] };
}

/**
 * Create a fresh idle machine.
 */
export function createDraft(): DraftMachine {
  return { state: "idle", chunks: [], startedAt: null };
}

/**
 * Resume a draft from a paused state. This is a convenience that
 * dispatches the `resume` action.
 */
export function resumeDraft(machine: DraftMachine, now: number): DraftMachine {
  return draftReducer(machine, { type: "resume" }, now);
}

/**
 * Finalize a draft and return the blob list plus total duration in ms.
 */
export function finalizeDraft(
  machine: DraftMachine,
  now: number,
): FinalizedDraft {
  const finalized = draftReducer(machine, { type: "finalize" }, now);
  return {
    chunks: finalized.chunks,
    durationMs: computeDuration(finalized),
  };
}

/**
 * Recover a draft from a list of chunks (crash recovery).
 * Reconstructs duration from chunk timestamps.
 */
export function recoverDraft(chunks: readonly RecordingChunk[]): FinalizedDraft {
  return {
    chunks,
    durationMs: computeDurationFromChunks(chunks),
  };
}

function computeDuration(machine: DraftMachine): number {
  if (machine.startedAt === null || machine.chunks.length === 0) return 0;
  const last = machine.chunks[machine.chunks.length - 1];
  if (last === undefined) return 0;
  return last.timestamp - machine.startedAt;
}

function computeDurationFromChunks(chunks: readonly RecordingChunk[]): number {
  if (chunks.length < 2) return 0;
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  if (first === undefined || last === undefined) return 0;
  return last.timestamp - first.timestamp;
}
