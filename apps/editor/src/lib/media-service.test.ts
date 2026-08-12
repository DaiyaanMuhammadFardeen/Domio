/**
 * Media service — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateArPreview,
  pollCadJob,
  renderLatex,
  submitCadJob,
  submitSandboxRun,
  uploadAudio,
} from './media-service';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('media-service', () => {
  it('submitCadJob returns a complete job when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const job = await submitCadJob('step', '');
    expect(job.status).toBe('complete');
    expect(job.progress).toBe(1);
  });

  it('pollCadJob returns a complete job when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const job = await pollCadJob('cad-1');
    expect(job.status).toBe('complete');
  });

  it('submitSandboxRun executes JS locally when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await submitSandboxRun({
      language: 'js',
      source: 'console.log("hi"); 42',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hi');
  });

  it('submitSandboxRun reports errors when JS throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await submitSandboxRun({
      language: 'js',
      source: 'throw new Error("boom")',
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('boom');
  });

  it('submitSandboxRun returns a placeholder for non-JS when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await submitSandboxRun({
      language: 'python',
      source: 'print("hi")',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('bootstrap');
  });

  it('renderLatex returns an SVG placeholder when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await renderLatex({ source: 'x^2', displayMode: true });
    expect(r.ok).toBe(true);
    expect(r.svg).toContain('<svg');
  });

  it('uploadAudio returns a synthetic id when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await uploadAudio({
      mimeType: 'audio/webm',
      data: 'AAAA',
      durationMs: 1234,
    });
    expect(r.id).toMatch(/^audio-/);
    expect(r.durationMs).toBe(1234);
  });

  it('generateArPreview returns a QR + URL when offline', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const r = await generateArPreview('slide-1');
    expect(r.url).toContain('slide=slide-1');
    expect(r.qrUrl).toMatch(/^data:/);
  });
});