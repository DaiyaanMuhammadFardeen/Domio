/**
 * @domio/join-web — captions/TtsClient.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Mock text-to-speech client. The real implementation will invoke
 * `services/tts-provider` and start playback; this mock is a no-op
 * but tracks every call so tests can verify the captions pipeline
 * fed the audio channel.
 */

export interface TtsSpeakInput {
  readonly text: string;
  readonly locale: string;
}

export interface TtsClient {
  /** Play the text aloud in the supplied locale. */
  readonly speak: (input: TtsSpeakInput) => void;
  /** Best-effort cancellation of the current utterance. */
  readonly cancel: () => void;
  /** Total number of `speak` calls since creation. */
  readonly callCount: () => number;
  /** History of speak inputs (latest at the end). */
  readonly history: () => readonly TtsSpeakInput[];
}

/**
 * Create a no-op TTS client. Replace this with a real implementation
 * that talks to `services/tts-provider` for production deployments.
 */
export function createTtsClient(): TtsClient {
  let count = 0;
  const log: TtsSpeakInput[] = [];
  return {
    speak: (input) => {
      count += 1;
      log.push(input);
    },
    cancel: () => {
      // No-op for the mock.
    },
    callCount: () => count,
    history: () => log.slice(),
  };
}

/**
 * Convenience singleton for the common case. Tests construct their
 * own client to avoid sharing state.
 */
export const defaultTtsClient: TtsClient = createTtsClient();

/**
 * Top-level `speak` shortcut for callers that don't need to manage
 * their own client. Wraps the default client.
 */
export function speak(text: string, locale: string): void {
  defaultTtsClient.speak({ text, locale });
}
