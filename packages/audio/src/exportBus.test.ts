import { describe, expect, it } from 'vitest';
import {
  writeWavHeader,
  encodePcm16,
  createExportBus,
  type ExportBusContext,
  type ExportBusWithSamples,
} from './exportBus.js';

// ─── Mock Context ───────────────────────────────────────────────────────────

function mockContext(): ExportBusContext {
  return {
    createGain() {
      return {
        gain: { value: 1 },
        connect() {},
        disconnect() {},
      };
    },
    destination: { channelCount: 2 },
  };
}

// ─── writeWavHeader ─────────────────────────────────────────────────────────

describe('writeWavHeader', () => {
  it('returns exactly 44 bytes', () => {
    const header = writeWavHeader(2, 44100, 1000);
    expect(header.length).toBe(44);
  });

  it('starts with "RIFF"', () => {
    const header = writeWavHeader(2, 44100, 100);
    const riff = String.fromCharCode(header[0]!, header[1]!, header[2]!, header[3]!);
    expect(riff).toBe('RIFF');
  });

  it('has "WAVE" at offset 8', () => {
    const header = writeWavHeader(2, 44100, 100);
    const wave = String.fromCharCode(header[8]!, header[9]!, header[10]!, header[11]!);
    expect(wave).toBe('WAVE');
  });

  it('has "fmt " at offset 12', () => {
    const header = writeWavHeader(2, 44100, 100);
    const fmt = String.fromCharCode(header[12]!, header[13]!, header[14]!, header[15]!);
    expect(fmt).toBe('fmt ');
  });

  it('has "data" at offset 36', () => {
    const header = writeWavHeader(2, 44100, 100);
    const data = String.fromCharCode(header[36]!, header[37]!, header[38]!, header[39]!);
    expect(data).toBe('data');
  });

  it('PCM format code is 1', () => {
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint16(20, true)).toBe(1);
  });

  it('bits per sample is 16', () => {
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('correct channel count in header', () => {
    const header = writeWavHeader(1, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint16(22, true)).toBe(1);
  });

  it('correct sample rate in header', () => {
    const header = writeWavHeader(2, 48000, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint32(24, true)).toBe(48000);
  });

  it('correct data size for stereo 100 frames', () => {
    // 100 frames × 2 channels × 2 bytes = 400 bytes
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint32(40, true)).toBe(400);
  });

  it('correct file size in RIFF header', () => {
    // file_size = 44 + 400 - 8 = 436
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint32(4, true)).toBe(436);
  });

  it('correct byte rate for stereo 44100', () => {
    // 44100 × 2 × 2 = 176400
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint32(28, true)).toBe(176400);
  });

  it('correct block align for stereo', () => {
    // 2 × 2 = 4
    const header = writeWavHeader(2, 44100, 100);
    const view = new DataView(header.buffer);
    expect(view.getUint16(32, true)).toBe(4);
  });
});

// ─── encodePcm16 ────────────────────────────────────────────────────────────

describe('encodePcm16', () => {
  it('encodes silence as zeros', () => {
    const pcm = encodePcm16(new Float32Array([0, 0, 0, 0]), 2);
    expect(pcm.length).toBe(8); // 2 frames × 2 channels × 2 bytes
    expect(pcm.every((b) => b === 0)).toBe(true);
  });

  it('encodes +1.0 as 32767', () => {
    const pcm = encodePcm16(new Float32Array([1.0]), 1);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(32767);
  });

  it('encodes -1.0 as -32768', () => {
    const pcm = encodePcm16(new Float32Array([-1.0]), 1);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(-32768);
  });

  it('encodes 0.5 as ~16383', () => {
    const pcm = encodePcm16(new Float32Array([0.5]), 1);
    const view = new DataView(pcm.buffer);
    const val = view.getInt16(0, true);
    expect(val).toBeGreaterThanOrEqual(16382);
    expect(val).toBeLessThanOrEqual(16384);
  });

  it('encodes -0.5 as ~-16384', () => {
    const pcm = encodePcm16(new Float32Array([-0.5]), 1);
    const view = new DataView(pcm.buffer);
    const val = view.getInt16(0, true);
    expect(val).toBeGreaterThanOrEqual(-16384);
    expect(val).toBeLessThanOrEqual(-16382);
  });

  it('clamps values > 1.0 to 32767', () => {
    const pcm = encodePcm16(new Float32Array([2.0]), 1);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(32767);
  });

  it('clamps values < -1.0 to -32768', () => {
    const pcm = encodePcm16(new Float32Array([-2.0]), 1);
    const view = new DataView(pcm.buffer);
    expect(view.getInt16(0, true)).toBe(-32768);
  });

  it('handles stereo interleaving', () => {
    const pcm = encodePcm16(new Float32Array([0.5, -0.5]), 2);
    expect(pcm.length).toBe(4); // 1 frame × 2 channels × 2 bytes
    const view = new DataView(pcm.buffer);
    // L channel at offset 0
    expect(view.getInt16(0, true)).toBeGreaterThanOrEqual(16382);
    expect(view.getInt16(0, true)).toBeLessThanOrEqual(16384);
    // R channel at offset 2
    expect(view.getInt16(2, true)).toBeGreaterThanOrEqual(-16384);
    expect(view.getInt16(2, true)).toBeLessThanOrEqual(-16382);
  });
});

// ─── createExportBus ────────────────────────────────────────────────────────

describe('createExportBus', () => {
  it('creates a bus with destination node', () => {
    const bus = createExportBus(mockContext());
    expect(bus.destination).toBeDefined();
    expect(bus.destination.gain.value).toBe(1);
  });

  it('toWavUri returns data URI with no samples', () => {
    const bus = createExportBus(mockContext()) as ExportBusWithSamples;
    // Set empty samples (default)
    bus._capturedSamples.set(new Float32Array(0));
    const uri = bus.toWavUri();
    expect(uri).toMatch(/^data:audio\/wav;base64,/);
  });

  it('toWavUri with mono samples', () => {
    const bus = createExportBus(mockContext(), { channels: 1 }) as ExportBusWithSamples;
    bus._capturedSamples.set(new Float32Array([0, 0.5, -0.5]));
    const uri = bus.toWavUri();
    expect(uri).toMatch(/^data:audio\/wav;base64,/);
    // Decode and verify header
    const base64 = uri.replace('data:audio/wav;base64,', '');
    const binary = atob(base64);
    expect(binary.length).toBe(44 + 6); // header + 3 frames × 1 ch × 2 bytes
    expect(binary.slice(0, 4)).toBe('RIFF');
    expect(binary.slice(12, 16)).toBe('fmt ');
    expect(binary.slice(36, 40)).toBe('data');
  });

  it('toWavUri with stereo samples', () => {
    const bus = createExportBus(mockContext(), { channels: 2, sampleRate: 48000 }) as ExportBusWithSamples;
    bus._capturedSamples.set(new Float32Array([0.5, -0.5, 0, 0]));
    const uri = bus.toWavUri();
    const base64 = uri.replace('data:audio/wav;base64,', '');
    const binary = atob(base64);
    expect(binary.length).toBe(44 + 8); // header + 2 frames × 2 ch × 2 bytes
    // Check sample rate is 48000
    const view = new DataView(new Uint8Array(binary.split('').map((c) => c.charCodeAt(0))).buffer);
    expect(view.getUint32(24, true)).toBe(48000);
  });

  it('close() makes toWavUri throw', () => {
    const bus = createExportBus(mockContext());
    bus.close();
    expect(() => bus.toWavUri()).toThrow('ExportBus is closed');
  });

  it('close disconnects destination', () => {
    const bus = createExportBus(mockContext());
    // Should not throw
    bus.close();
  });
});
