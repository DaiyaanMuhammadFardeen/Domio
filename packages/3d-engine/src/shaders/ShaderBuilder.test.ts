import { describe, it, expect } from 'vitest';
import { buildShader, reportCompileError } from './ShaderBuilder.js';
import type { ShaderDescriptor, CompileError } from './ShaderBuilder.js';

describe('buildShader — valid builds', () => {
  it('produces WGSL source from a descriptor', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: { time: 'f32', resolution: 'vec2f' },
      fragmentBody: '  return vec4f(uniforms.time, 0.0, 0.0, 1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(true);
    expect(result.source).toContain('@fragment fn main()');
    expect(result.source).toContain('uniforms: Uniforms');
    expect(result.source).toContain('var<uniform> uniforms');
  });

  it('produces GLSL source from a descriptor', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'glsl',
      uniforms: { time: 'f32' },
      fragmentBody: '  fragColor = vec4(uniforms.time, 0.0, 0.0, 1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(true);
    expect(result.source).toContain('#version 300 es');
    expect(result.source).toContain('uniform float time;');
  });

  it('builds without uniforms', () => {
    const desc: ShaderDescriptor = {
      kind: 'post',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  return vec4f(1.0, 1.0, 1.0, 1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(true);
    expect(result.source).not.toContain('Uniforms');
  });
});

describe('buildShader — compile error fallback', () => {
  it('falls back to safe-default shader on compile error', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  // trigger compile error\n  return error;',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(false);
    expect(result.source).toContain('@fragment fn main()');
    expect(result.source).toContain('vec4f(0.5, 0.5, 0.5, 1.0)');
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Simulated compile error');
  });

  it('error includes line and column', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  return error;',
    };
    const result = buildShader(desc);
    expect(result.error!.line).toBe(3);
    expect(result.error!.column).toBe(1);
  });
});

describe('buildShader — extension detection', () => {
  it('returns banner for unsupported extension', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  return vec4f(1.0);',
      extensions: ['EXT_foo'],
    };
    const result = buildShader(desc, []);
    expect(result.ok).toBe(false);
    expect(result.extensionBanner).toBeDefined();
    expect(result.extensionBanner!.message).toBe(
      'This shader requires EXT_foo, not available here',
    );
    expect(result.extensionBanner!.extension).toBe('EXT_foo');
  });

  it('passes when all extensions are available', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  return vec4f(1.0);',
      extensions: ['EXT_foo'],
    };
    const result = buildShader(desc, ['EXT_foo', 'EXT_bar']);
    expect(result.ok).toBe(true);
    expect(result.extensionBanner).toBeUndefined();
  });

  it('passes when no extensions required', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  return vec4f(1.0);',
    };
    const result = buildShader(desc, []);
    expect(result.ok).toBe(true);
  });
});

describe('buildShader — host-access sanitisation', () => {
  it('rejects fetch() calls', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  fetch("https://evil.example");\n  return vec4f(1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(false);
    expect(result.error!.message).toContain('fetch');
    expect(result.source).toContain('@fragment fn main()');
  });

  it('rejects XMLHttpRequest', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'wgsl',
      uniforms: {},
      fragmentBody: '  new XMLHttpRequest();\n  return vec4f(1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(false);
    expect(result.error!.message).toContain('XMLHttpRequest');
  });

  it('rejects importScripts', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'glsl',
      uniforms: {},
      fragmentBody: '  importScripts("evil.js");\n  fragColor = vec4(1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(false);
    expect(result.error!.message).toContain('importScripts');
  });

  it('rejects process. access', () => {
    const desc: ShaderDescriptor = {
      kind: 'background',
      language: 'glsl',
      uniforms: {},
      fragmentBody: '  process.env.X;\n  fragColor = vec4(1.0);',
    };
    const result = buildShader(desc);
    expect(result.ok).toBe(false);
    expect(result.error!.message).toContain('process');
  });
});

describe('reportCompileError', () => {
  it('formats error with location', () => {
    const error: CompileError = { message: 'Syntax error', line: 5, column: 12 };
    const reported = reportCompileError(error);
    expect(reported.message).toBe('Syntax error');
    expect(reported.inline).toContain('line 5:12');
    expect(reported.inline).toContain('Syntax error');
  });

  it('formats error without location', () => {
    const error: CompileError = { message: 'Unknown error' };
    const reported = reportCompileError(error);
    expect(reported.inline).toBe('/* COMPILE ERROR: Unknown error */');
  });
});
