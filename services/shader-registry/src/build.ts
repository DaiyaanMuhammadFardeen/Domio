/**
 * Shader Registry — build chain (Phase 11).
 *
 * Models the compile + fallback chain for shaders. The real GPU compile
 * happens in the editor; this provides deterministic test infrastructure.
 *
 * Build results:
 *  - On success: `{ compiled: true, programKey }`
 *  - On failure: `{ compiled: false, error, fallback: SAFE_DEFAULT_SHADER }`
 */

import type { Shader } from './repo.js';

// ---------------------------------------------------------------------------
// Safe default shader — a minimal neutral fragment shader
// ---------------------------------------------------------------------------

export const SAFE_DEFAULT_SHADER =
  '// Safe fallback shader (Phase 11)\n' +
  '@group(0) @binding(0) var<uniform> resolution: vec2f;\n' +
  '@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {\n' +
  '  return vec4f(0.0, 0.0, 0.0, 1.0);\n' +
  '}\n';

// ---------------------------------------------------------------------------
// Compiler interface (injectable)
// ---------------------------------------------------------------------------

export interface CompileSuccess {
  readonly success: true;
  readonly programKey: string;
}

export interface CompileFailure {
  readonly success: false;
  readonly error: string;
}

export type CompileResult = CompileSuccess | CompileFailure;

export type ShaderCompiler = (shader: Shader) => CompileResult;

/**
 * Default mock compiler:
 *  - Fails when sourceWgsl contains `TODO_COMPILE_ERROR` marker
 *  - Otherwise succeeds with a deterministic programKey
 */
export function defaultCompiler(shader: Shader): CompileResult {
  if (shader.sourceWgsl.includes('TODO_COMPILE_ERROR')) {
    return { success: false, error: 'Compile error: TODO_COMPILE_ERROR marker found in WGSL source' };
  }
  const programKey = `prog-${shader.id}-${shader.kind}`;
  return { success: true, programKey };
}

// ---------------------------------------------------------------------------
// Build result
// ---------------------------------------------------------------------------

export interface BuildSuccess {
  readonly compiled: true;
  readonly programKey: string;
}

export interface BuildFailure {
  readonly compiled: false;
  readonly error: string;
  readonly fallback: string;
}

export type BuildResult = BuildSuccess | BuildFailure;

// ---------------------------------------------------------------------------
// Build chain
// ---------------------------------------------------------------------------

export interface BuildDeps {
  readonly compiler?: ShaderCompiler;
}

/**
 * Attempt to compile a shader through the injectable compiler.
 * Returns a deterministic build result for the chain + error reporting.
 */
export function buildShader(shader: Shader, deps?: BuildDeps): BuildResult {
  const compiler = deps?.compiler ?? defaultCompiler;
  const result = compiler(shader);

  if (result.success) {
    return { compiled: true, programKey: result.programKey };
  }

  return {
    compiled: false,
    error: result.error,
    fallback: SAFE_DEFAULT_SHADER,
  };
}
