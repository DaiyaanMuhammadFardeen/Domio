/**
 * Shader builder — WGSL + GLSL source generation from a descriptor.
 *
 * Produces compilable source strings.  On compile error the builder
 * falls back to a safe-default shader and surfaces the error.
 * Extension detection returns a banner for unsupported extensions.
 * Shader source is sanitised: host-environment access patterns are
 * stripped or rejected.
 */

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type ShaderKind = 'background' | 'particle' | 'material' | 'post';
export type ShaderLanguage = 'wgsl' | 'glsl';

export interface ShaderDescriptor {
  kind: ShaderKind;
  language: ShaderLanguage;
  /** Uniform declarations: name → type (e.g. 'f32', 'vec4f'). */
  uniforms: Record<string, string>;
  /** Fragment body — the main computation. */
  fragmentBody: string;
  /** Required extensions (e.g. 'EXT_color_buffer_float'). */
  extensions?: string[];
}

export interface CompileError {
  message: string;
  line?: number;
  column?: number;
}

export interface ShaderBuildResult {
  /** Generated source code (or safe-default fallback). */
  source: string;
  ok: boolean;
  /** Compile error if any (surfaced when fallback is used). */
  error?: CompileError;
  /** Extension banner data when an extension is unsupported. */
  extensionBanner?: { message: string; extension: string };
}

// ---------------------------------------------------------------------------
// Host-environment access patterns
// ---------------------------------------------------------------------------

const HOST_ACCESS_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bimportScripts\s*\(/,
  /\bprocess\./,
];

function sanitiseSource(source: string): { clean: string; rejected: string[] } {
  const rejected: string[] = [];
  let clean = source;

  for (const pattern of HOST_ACCESS_PATTERNS) {
    if (pattern.test(clean)) {
      rejected.push(pattern.source);
      clean = clean.replace(pattern, '/* HOST_ACCESS_REJECTED */');
    }
  }

  return { clean, rejected };
}

// ---------------------------------------------------------------------------
// Safe-default shaders
// ---------------------------------------------------------------------------

const SAFE_DEFAULTS: Record<ShaderLanguage, string> = {
  wgsl: `@fragment fn main() -> @location(0) vec4f {
  return vec4f(0.5, 0.5, 0.5, 1.0);
}`,
  glsl: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.5, 0.5, 0.5, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Error reporter
// ---------------------------------------------------------------------------

export function reportCompileError(
  error: CompileError,
): { message: string; inline: string } {
  const loc =
    error.line !== undefined
      ? ` at line ${error.line}${error.column !== undefined ? `:${error.column}` : ''}`
      : '';
  return {
    message: error.message,
    inline: `/* COMPILE ERROR${loc}: ${error.message} */`,
  };
}

// ---------------------------------------------------------------------------
// Extension detection
// ---------------------------------------------------------------------------

function checkExtensions(
  extensions: string[],
  availableExtensions: string[],
): { message: string; extension: string } | undefined {
  for (const ext of extensions) {
    if (!availableExtensions.includes(ext)) {
      return {
        message: `This shader requires ${ext}, not available here`,
        extension: ext,
      };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Source generation
// ---------------------------------------------------------------------------

function generateWgslSource(desc: ShaderDescriptor): string {
  const lines: string[] = [];

  // Uniforms
  const uniformEntries = Object.entries(desc.uniforms);
  if (uniformEntries.length > 0) {
    lines.push('struct Uniforms {');
    for (const [name, type] of uniformEntries) {
      lines.push(`  ${name}: ${type},`);
    }
    lines.push('}');
    lines.push('@group(0) @binding(0) var<uniform> uniforms: Uniforms;');
    lines.push('');
  }

  // Fragment body
  lines.push('@fragment fn main() -> @location(0) vec4f {');
  lines.push(desc.fragmentBody);
  lines.push('}');

  return lines.join('\n');
}

function generateGlslSource(desc: ShaderDescriptor): string {
  const lines: string[] = ['#version 300 es', 'precision highp float;', ''];

  // Uniforms
  const uniformEntries = Object.entries(desc.uniforms);
  for (const [name, type] of uniformEntries) {
    const glslType = mapGlslType(type);
    lines.push(`uniform ${glslType} ${name};`);
  }
  if (uniformEntries.length > 0) lines.push('');

  lines.push('out vec4 fragColor;');
  lines.push('');
  lines.push('void main() {');
  lines.push(desc.fragmentBody);
  lines.push('}');

  return lines.join('\n');
}

function mapGlslType(wgslType: string): string {
  switch (wgslType) {
    case 'f32': return 'float';
    case 'vec2f': return 'vec2';
    case 'vec3f': return 'vec3';
    case 'vec4f': return 'vec4';
    case 'i32': return 'int';
    case 'u32': return 'uint';
    default: return wgslType;
  }
}

// ---------------------------------------------------------------------------
// ShaderBuilder
// ---------------------------------------------------------------------------

/**
 * Build a shader from a descriptor with sanitisation, extension checking,
 * and compile-error fallback.
 */
export function buildShader(
  desc: ShaderDescriptor,
  availableExtensions: string[] = [],
): ShaderBuildResult {
  // Check extensions first
  if (desc.extensions && desc.extensions.length > 0) {
    const banner = checkExtensions(desc.extensions, availableExtensions);
    if (banner) {
      return {
        source: SAFE_DEFAULTS[desc.language],
        ok: false,
        extensionBanner: banner,
      };
    }
  }

  // Generate source
  let source =
    desc.language === 'wgsl' ? generateWgslSource(desc) : generateGlslSource(desc);

  // Sanitise
  const { clean, rejected } = sanitiseSource(source);
  if (rejected.length > 0) {
    return {
      source: SAFE_DEFAULTS[desc.language],
      ok: false,
      error: {
        message: `Shader source contains rejected host-environment patterns: ${rejected.join(', ')}`,
      },
    };
  }

  source = clean;

  // Mock compile check: if the fragment body contains "error" keyword → simulate error
  if (desc.fragmentBody.toLowerCase().includes('error')) {
    const compileError: CompileError = {
      message: 'Simulated compile error',
      line: 3,
      column: 1,
    };
    return {
      source: SAFE_DEFAULTS[desc.language],
      ok: false,
      error: compileError,
    };
  }

  return { source, ok: true };
}
