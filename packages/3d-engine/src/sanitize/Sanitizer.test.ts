import { describe, it, expect } from 'vitest';
import { Sanitizer } from './Sanitizer.js';

describe('Sanitizer', () => {
  describe('size cap', () => {
    it('rejects oversized file', () => {
      const sanitizer = new Sanitizer({ maxBytes: 100 });
      const result = sanitizer.sanitizeGLB(new ArrayBuffer(200));
      expect(result.rejected).toBe(true);
      expect(result.rejectReason).toContain('exceeds limit');
    });

    it('rejects GLB that is too small', () => {
      const sanitizer = new Sanitizer();
      const result = sanitizer.sanitizeGLB(new ArrayBuffer(4));
      expect(result.rejected).toBe(true);
    });

    it('rejects non-GLB buffer', () => {
      const sanitizer = new Sanitizer();
      const buf = new ArrayBuffer(20);
      new DataView(buf).setUint32(0, 0xDEADBEEF, true);
      const result = sanitizer.sanitizeGLB(buf);
      expect(result.rejected).toBe(true);
      expect(result.rejectReason).toContain('Not a valid GLB');
    });
  });

  describe('embedded script stripping', () => {
    it('warns about embedded <script> tags', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extras: { description: '<script>alert("xss")</script>' },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('<script>'))).toBe(true);
    });

    it('warns about JS expressions', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extras: { code: 'eval("malicious")' },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('JS expression'))).toBe(true);
    });

    it('passes clean JSON without script warnings', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings).toHaveLength(0);
      expect(result.ok).toBe(true);
    });
  });

  describe('KHR_xmp_json_ld external refs', () => {
    it('warns about external refs in KHR_xmp_json_ld', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensions: {
          KHR_xmp_json_ld: { externalUrl: 'https://evil.example.com/leak' },
        },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('KHR_xmp_json_ld'))).toBe(true);
    });

    it('warns about file:// URIs', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensions: {
          KHR_xmp_json_ld: { path: 'file:///etc/passwd' },
        },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('external references'))).toBe(true);
    });
  });

  describe('custom extensions', () => {
    it('rejects custom extensions without allowlist', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensions: {
          MY_CUSTOM_EXTENSION: { data: 'test' },
        },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('MY_CUSTOM_EXTENSION'))).toBe(true);
    });

    it('accepts custom extensions with allowlist', () => {
      const sanitizer = new Sanitizer({
        customExtensionAllowlist: ['MY_'],
      });
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensions: {
          MY_CUSTOM_EXTENSION: { data: 'test' },
        },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('MY_CUSTOM_EXTENSION'))).toBe(false);
    });

    it('does not flag known Khronos extensions', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensions: {
          KHR_lights_punctual: { lights: [] },
        },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('KHR_lights_punctual'))).toBe(false);
    });
  });

  describe('stego scan', () => {
    it('flags NUL-byte-heavy strings', () => {
      const sanitizer = new Sanitizer();
      // Create a string with many NUL bytes — must be >100 chars to trigger scan
      const nulHeavy = '\x00'.repeat(120) + 'normal text';
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extras: { hidden: nulHeavy },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('steganographic'))).toBe(true);
    });

    it('passes normal strings without stego flag', () => {
      const sanitizer = new Sanitizer();
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extras: { description: 'A perfectly normal description string with enough chars' },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('steganographic'))).toBe(false);
    });

    it('can skip stego scan', () => {
      const sanitizer = new Sanitizer({ skipStegoScan: true });
      const nulHeavy = '\x00'.repeat(60);
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extras: { hidden: nulHeavy },
        nodes: [],
        meshes: [],
        materials: [],
        animations: [],
      });
      const result = sanitizer.sanitizeGLTFJson(json);
      expect(result.warnings.some((w) => w.includes('steganographic'))).toBe(false);
    });
  });

  describe('malformed JSON', () => {
    it('rejects malformed JSON', () => {
      const sanitizer = new Sanitizer();
      const result = sanitizer.sanitizeGLTFJson('not valid json {{{');
      expect(result.rejected).toBe(true);
      expect(result.rejectReason).toContain('Malformed JSON');
    });
  });
});
