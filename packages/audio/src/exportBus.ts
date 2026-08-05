/**
 * Export-to-file bus abstraction.
 *
 * `createExportBus(ctx)` returns { destination, close, toWavUri }.
 * The injectable audio context avoids touching real Web Audio in tests.
 * In tests, `toWavUri` returns a data URI computed from captured samples.
 *
 * Includes a tiny deterministic WAV header writer: 44-byte RIFF header + PCM16 samples.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExportBusContext {
  createGain(): ExportGainNode;
  destination: ExportDestination;
}

export interface ExportGainNode {
  gain: { value: number };
  connect(dest: ExportAudioNode): void;
  disconnect(): void;
}

export interface ExportAudioNode {
  // Minimal — we don't read from nodes in tests.
  channelCount?: number;
}

export interface ExportDestination {
  channelCount: number;
}

export interface ExportBus {
  /** The gain node connected to the destination — mix into this */
  destination: ExportGainNode;
  /** Disconnect all nodes */
  close(): void;
  /** Capture the current mix as a WAV data URI */
  toWavUri(): string;
  /** Access captured samples (for test setup) */
  _capturedSamples: {
    get: () => Float32Array;
    set: (s: Float32Array) => void;
  };
}

// ─── WAV Writer ─────────────────────────────────────────────────────────────

const RIFF_HEADER_SIZE = 44;

/**
 * Write a minimal 44-byte RIFF/WAV header + PCM16 samples into a Uint8Array.
 *
 * Header layout (all little-endian):
 *   Offset  Size  Field
 *   0       4     "RIFF"
 *   4       4     file size - 8
 *   8       4     "WAVE"
 *   12      4     "fmt "
 *   16      4     16 (PCM format chunk size)
 *   20      2     1 (PCM format code)
 *   22      2     numChannels
 *   24      4     sampleRate
 *   28      4     byteRate (sampleRate * numChannels * bitsPerSample/8)
 *   32      2     blockAlign (numChannels * bitsPerSample/8)
 *   34      2     bitsPerSample (16)
 *   36      4     "data"
 *   40      4     dataSize (numSamples * numChannels * 2)
 *   44      ...   PCM16 samples (interleaved if stereo)
 */
export function writeWavHeader(
  numChannels: number,
  sampleRate: number,
  numFrames: number,
): Uint8Array {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = numFrames * numChannels * bytesPerSample;
  const fileSize = RIFF_HEADER_SIZE + dataSize - 8;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;

  const header = new Uint8Array(RIFF_HEADER_SIZE);
  const view = new DataView(header.buffer);

  // "RIFF"
  writeString(header, 0, 'RIFF');
  // File size - 8
  view.setUint32(4, fileSize, true);
  // "WAVE"
  writeString(header, 8, 'WAVE');
  // "fmt "
  writeString(header, 12, 'fmt ');
  // PCM chunk size
  view.setUint32(16, 16, true);
  // PCM format
  view.setUint16(20, 1, true);
  // Channels
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate
  view.setUint32(28, byteRate, true);
  // Block align
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // "data"
  writeString(header, 36, 'data');
  // Data size
  view.setUint32(40, dataSize, true);

  return header;
}

/**
 * Encode Float32 samples (range -1..1) as interleaved PCM16 bytes.
 * For stereo, samples are interleaved: [L0, R0, L1, R1, ...].
 */
export function encodePcm16(samples: Float32Array, numChannels: number): Uint8Array {
  const numFrames = samples.length / numChannels;
  const bytesPerSample = 2; // 16-bit
  const buffer = new ArrayBuffer(numFrames * numChannels * bytesPerSample);
  const view = new DataView(buffer);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    // Scale to int16 range [-32768, 32767]
    const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
    view.setInt16(i * bytesPerSample, int16, true);
  }

  return new Uint8Array(buffer);
}

// ─── Export Bus Factory ──────────────────────────────────────────────────────

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHANNELS = 2; // stereo

/**
 * Create an export bus backed by the injectable context.
 * In tests, supply a mock context that captures samples.
 */
export function createExportBus(
  _ctx: ExportBusContext,
  options?: { sampleRate?: number; channels?: number },
): ExportBus {
  const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels: number = options?.channels ?? DEFAULT_CHANNELS;
  const destination = _ctx.createGain();
  let closed = false;

  // Captured samples (in real Web Audio this would come from an AudioWorklet
  // or ScriptProcessorNode; in tests the mock context populates this).
  let capturedSamples: Float32Array = new Float32Array(0);

  return {
    destination,
    close() {
      closed = true;
      destination.disconnect();
    },
    toWavUri(): string {
      if (closed) throw new Error('ExportBus is closed');
      // In a real implementation, `capturedSamples` would be filled by the
      // audio graph processing. For test/mocking purposes, callers can set
      // this via the capturedSamples accessor exposed on the bus.
      const header = writeWavHeader(channels, sampleRate, capturedSamples.length / channels);
      const pcm = encodePcm16(capturedSamples, channels);
      const combined = new Uint8Array(header.length + pcm.length);
      combined.set(header, 0);
      combined.set(pcm, header.length);
      return uint8ArrayToDataUri(combined);
    },
    // Expose for test setup — allows injecting sample data.
    _capturedSamples: {
      get: () => capturedSamples,
      set: (s: Float32Array) => { capturedSamples = s; },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function writeString(arr: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    arr[offset + i] = str.charCodeAt(i);
  }
}

function uint8ArrayToDataUri(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // Use base64 encoding via btoa (available in Node 16+ and browsers)
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ExportBusWithSamples is now identical to ExportBus since _capturedSamples is part of the base type.
export type ExportBusWithSamples = ExportBus;
