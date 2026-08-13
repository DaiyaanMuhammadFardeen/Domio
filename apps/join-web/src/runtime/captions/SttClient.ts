/**
 * @domio/join-web — captions/SttClient.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Mock speech-to-text client. The real implementation will stream
 * audio chunks to the `services/stt-provider` WebSocket; this mock
 * periodically emits rotating sample phrases on `onResult` so the
 * captions pipeline is observable in tests and demos.
 */

export interface SttResult {
  readonly text: string;
  readonly isFinal: boolean;
  /** Confidence in [0,1] — surfaced for the partial-stability indicator. */
  readonly confidence: number;
}

export interface SttSession {
  /** Push a raw audio chunk (ignored by the mock). */
  readonly feed: (chunk: ArrayBuffer | Uint8Array | string) => void;
  /** Tear down timers and detach. */
  readonly close: () => void;
}

export interface SttConnectInput {
  readonly url: string;
  readonly onResult: (result: SttResult) => void;
  /** Override the emission cadence (ms). Defaults to 2000. */
  readonly intervalMs?: number;
  /** Override the rotating sample phrases (test injection point). */
  readonly samples?: readonly string[];
}

const DEFAULT_SAMPLES: readonly string[] = [
  'Welcome to the session.',
  'Today we are talking about captions.',
  'Live translation makes this accessible.',
  'Please open your handouts now.',
  'We will begin the demo shortly.',
  'Thank you for joining today.',
];

const DEFAULT_INTERVAL_MS = 2000;

/**
 * Connect to the mock STT provider. Returns a controller exposing
 * `feed` (for raw audio chunks) and `close`. The mock fires `onResult`
 * with `{ text, isFinal: true }` every 2 seconds.
 */
export function connect(input: SttConnectInput): SttSession {
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  const samples = input.samples ?? DEFAULT_SAMPLES;
  let cursor = 0;
  const timer = setInterval(() => {
    const text = samples[cursor % samples.length] ?? '';
    cursor += 1;
    input.onResult({ text, isFinal: true, confidence: 0.95 });
  }, intervalMs);
  return {
    feed: () => {
      // The mock ignores audio data. A real implementation would
      // forward chunks over the wire.
    },
    close: () => {
      clearInterval(timer);
    },
  };
}
