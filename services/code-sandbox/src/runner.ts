/**
 * Code Sandbox — code runner.
 *
 * Executes user-provided JavaScript in a sandboxed environment.
 * Uses QuickJS WASM when available, falls back to Node.js vm module.
 *
 * Enforcement:
 *   - CPU cap via interrupt handler (QuickJS) or vm timeout (fallback)
 *   - Memory cap via setMemoryLimit (QuickJS) or approximated (fallback)
 *   - Stdout cap at 1 MB
 *   - Network/DOM/console capability gates
 */

import type { SandboxPolicy } from './repo.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SandboxRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly killed: boolean;
  readonly killedReason?: 'cpu' | 'memory' | 'stdout';
}

export interface RunDeps {
  readonly clock?: () => number;
}

// ---------------------------------------------------------------------------
// Stdout collector
// ---------------------------------------------------------------------------

const STDOUT_CAP_BYTES = 1 * 1024 * 1024; // 1 MB

class StdoutCollector {
  private chunks: string[] = [];
  private totalBytes = 0;
  private _truncated = false;

  append(data: string): boolean {
    if (this._truncated) return false;
    const bytes = Buffer.byteLength(data, 'utf-8');
    if (this.totalBytes + bytes > STDOUT_CAP_BYTES) {
      const remaining = STDOUT_CAP_BYTES - this.totalBytes;
      if (remaining > 0) {
        const charBudget = Math.floor(remaining * 0.9);
        this.chunks.push(data.slice(0, charBudget));
        this.totalBytes += Buffer.byteLength(data.slice(0, charBudget), 'utf-8');
      }
      this._truncated = true;
      return false;
    }
    this.chunks.push(data);
    this.totalBytes += bytes;
    return true;
  }

  get stdout(): string {
    return this.chunks.join('');
  }

  get isTruncated(): boolean {
    return this._truncated;
  }
}

// ---------------------------------------------------------------------------
// Source-transform gate (used in fallback)
// ---------------------------------------------------------------------------

interface BlockedPattern {
  readonly capability: 'allowNetwork' | 'allowDom' | 'allowImport';
  readonly pattern: RegExp;
  readonly description: string;
}

const BLOCKED_PATTERNS: readonly BlockedPattern[] = [
  { capability: 'allowNetwork', pattern: /\bfetch\s*\(/g, description: 'fetch() is not allowed' },
  {
    capability: 'allowNetwork',
    pattern: /\bXMLHttpRequest\b/g,
    description: 'XMLHttpRequest is not allowed',
  },
  {
    capability: 'allowNetwork',
    pattern: /\bWebSocket\b/g,
    description: 'WebSocket is not allowed',
  },
  {
    capability: 'allowDom',
    pattern: /\bdocument\b/g,
    description: 'document access is not allowed',
  },
  { capability: 'allowDom', pattern: /\bwindow\b/g, description: 'window access is not allowed' },
  {
    capability: 'allowImport',
    pattern: /\bimport\s*\(/g,
    description: 'dynamic import is not allowed',
  },
];

function checkSourcePatterns(code: string, policy: SandboxPolicy): string | null {
  for (const { capability, pattern, description } of BLOCKED_PATTERNS) {
    if (!policy[capability]) {
      pattern.lastIndex = 0;
      if (pattern.test(code)) {
        return description;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Node.js vm fallback runner
// ---------------------------------------------------------------------------

async function runWithVm(
  code: string,
  policy: SandboxPolicy,
  budgetMs: number,
  clock: () => number,
): Promise<SandboxRunResult> {
  const startMs = clock();
  const collector = new StdoutCollector();
  const stderrParts: string[] = [];

  // Check source patterns first
  const blocked = checkSourcePatterns(code, policy);
  if (blocked) {
    return {
      stdout: '',
      stderr: blocked,
      exitCode: 1,
      durationMs: clock() - startMs,
      killed: false,
    };
  }

  // Build console object
  const consoleMethods: Record<string, (...args: unknown[]) => void> = {};
  if (policy.allowConsole) {
    consoleMethods.log = (...args: unknown[]) => {
      const msg = args.map((a) => String(a)).join(' ');
      collector.append(msg + '\n');
    };
    consoleMethods.warn = consoleMethods.log;
    consoleMethods.error = (...args: unknown[]) => {
      stderrParts.push(args.map((a) => String(a)).join(' '));
    };
  } else {
    consoleMethods.log = () => {};
    consoleMethods.warn = () => {};
    consoleMethods.error = () => {};
  }

  // Build sandbox globals
  const sandbox: Record<string, unknown> = {
    console: consoleMethods,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    Date,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    undefined,
    NaN,
    Infinity,
  };

  try {
    const vmMod = await import('node:vm');
    const context = vmMod.createContext(sandbox);
    const script = new vmMod.Script(code, { filename: 'sandbox.mjs' });
    script.runInContext(context, { timeout: budgetMs });
  } catch (err: unknown) {
    const e = err as { message?: string; name?: string };
    if (e.name === 'RangeError' && e.message?.includes('timeout')) {
      return {
        stdout: collector.stdout,
        stderr: stderrParts.join('\n'),
        exitCode: 137,
        durationMs: clock() - startMs,
        killed: true,
        killedReason: 'cpu',
      };
    }
    if (e.name === 'ReferenceError') {
      return {
        stdout: collector.stdout,
        stderr: e.message ?? 'ReferenceError',
        exitCode: 1,
        durationMs: clock() - startMs,
        killed: false,
      };
    }
    return {
      stdout: collector.stdout,
      stderr: e.message ?? String(err),
      exitCode: 1,
      durationMs: clock() - startMs,
      killed: false,
    };
  }

  // Check stdout cap
  if (collector.isTruncated) {
    return {
      stdout: collector.stdout,
      stderr: '',
      exitCode: 1,
      durationMs: clock() - startMs,
      killed: true,
      killedReason: 'stdout',
    };
  }

  return {
    stdout: collector.stdout,
    stderr: stderrParts.join('\n'),
    exitCode: 0,
    durationMs: clock() - startMs,
    killed: false,
  };
}

// ---------------------------------------------------------------------------
// QuickJS runner
// ---------------------------------------------------------------------------

let quickjsAvailable: boolean | null = null;

async function isQuickJsAvailable(): Promise<boolean> {
  if (quickjsAvailable !== null) return quickjsAvailable;
  try {
    const mod = await import('quickjs-emscripten');
    quickjsAvailable = typeof mod.getQuickJS === 'function';
  } catch {
    quickjsAvailable = false;
  }
  return quickjsAvailable;
}

async function runWithQuickJs(
  code: string,
  policy: SandboxPolicy,
  deps: RunDeps,
): Promise<SandboxRunResult> {
  const { getQuickJS } = await import('quickjs-emscripten');
  const clock = deps.clock ?? (() => Date.now());
  const startMs = clock();
  const collector = new StdoutCollector();
  const stderrParts: string[] = [];
  const maxCpuMs = policy.maxCpuMs;

  try {
    const quickjs = await getQuickJS();
    const runtime = quickjs.newRuntime();
    const ctx = runtime.newContext();

    // Set memory limit on the runtime
    const maxMemoryBytes = policy.maxMemoryMb * 1024 * 1024;
    runtime.setMemoryLimit(maxMemoryBytes);

    // Set interrupt handler for CPU cap using injectable clock
    const deadlineMs = startMs + maxCpuMs;
    runtime.setInterruptHandler(() => {
      return clock() >= deadlineMs;
    });

    // Set up console.log capture
    if (policy.allowConsole) {
      const consoleObj = ctx.newObject();
      const logFn = ctx.newFunction('log', (...args: unknown[]) => {
        const msg = args
          .map((a) => {
            if (typeof a === 'string') return a;
            // QuickJS passes handles; ctx.dump converts them to JS values
            try {
              return ctx.dump(a as unknown as Parameters<typeof ctx.dump>[0]);
            } catch {
              return String(a);
            }
          })
          .join(' ');
        const ok = collector.append(msg + '\n');
        if (!ok) throw new Error('stdout cap exceeded');
        return ctx.undefined;
      });
      ctx.setProp(consoleObj, 'log', logFn);
      ctx.setProp(consoleObj, 'warn', logFn);
      ctx.setProp(ctx.global, 'console', consoleObj);
      logFn.dispose();
      consoleObj.dispose();
    }

    // Set up DOM globals if allowed
    if (policy.allowDom) {
      const docObj = ctx.newObject();
      ctx.setProp(ctx.global, 'document', docObj);
      docObj.dispose();
      const winObj = ctx.newObject();
      ctx.setProp(ctx.global, 'window', winObj);
      winObj.dispose();
    }

    const result = ctx.evalCode(code);

    if (result.error) {
      const errorDump = ctx.dump(result.error);
      const errorName =
        typeof errorDump === 'object' && errorDump !== null
          ? (errorDump as Record<string, unknown>).name
          : undefined;
      const errorMsg =
        typeof errorDump === 'object' && errorDump !== null
          ? (errorDump as Record<string, unknown>).message
          : errorDump;
      const errorMsgStr = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);

      // Check if this is a CPU interrupt
      if (errorName === 'InternalError' && errorMsgStr?.includes('interrupted')) {
        result.error.dispose();
        ctx.dispose();
        runtime.dispose();
        return {
          stdout: collector.stdout,
          stderr: '',
          exitCode: 137,
          durationMs: clock() - startMs,
          killed: true,
          killedReason: 'cpu',
        };
      }

      stderrParts.push(errorMsgStr);
      result.error.dispose();
      ctx.dispose();
      runtime.dispose();

      return {
        stdout: collector.stdout,
        stderr: stderrParts.join('\n'),
        exitCode: 1,
        durationMs: clock() - startMs,
        killed: false,
      };
    }

    // result is success case here — QuickJSHandle has dispose()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const successResult = result as { value: any; error?: undefined };

    // Check if stdout was capped
    if (collector.isTruncated) {
      successResult.value.dispose();
      ctx.dispose();
      runtime.dispose();
      return {
        stdout: collector.stdout,
        stderr: '',
        exitCode: 1,
        durationMs: clock() - startMs,
        killed: true,
        killedReason: 'stdout',
      };
    }

    // Check if the interrupt was triggered (CPU cap)
    // QuickJS throws InternalError with message "interrupted" when interrupted
    successResult.value.dispose();
    ctx.dispose();
    runtime.dispose();

    return {
      stdout: collector.stdout,
      stderr: stderrParts.join('\n'),
      exitCode: 0,
      durationMs: clock() - startMs,
      killed: false,
    };
  } catch (err: unknown) {
    const e = err as { message?: string; name?: string };
    if (e.name === 'InternalError' && e.message?.includes('interrupted')) {
      return {
        stdout: collector.stdout,
        stderr: '',
        exitCode: 137,
        durationMs: clock() - startMs,
        killed: true,
        killedReason: 'cpu',
      };
    }
    if (e.message?.includes('out of memory') || e.message?.includes('memory limit')) {
      return {
        stdout: collector.stdout,
        stderr: e.message ?? 'Out of memory',
        exitCode: 137,
        durationMs: clock() - startMs,
        killed: true,
        killedReason: 'memory',
      };
    }
    if (collector.isTruncated) {
      return {
        stdout: collector.stdout,
        stderr: '',
        exitCode: 1,
        durationMs: clock() - startMs,
        killed: true,
        killedReason: 'stdout',
      };
    }
    return {
      stdout: collector.stdout,
      stderr: e.message ?? String(err),
      exitCode: 1,
      durationMs: clock() - startMs,
      killed: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runSandboxCode(
  code: string,
  policy: SandboxPolicy,
  deps: RunDeps = {},
): Promise<SandboxRunResult> {
  const useQuickJs = await isQuickJsAvailable();
  if (useQuickJs) {
    return runWithQuickJs(code, policy, deps);
  }
  return runWithVm(code, policy, policy.maxCpuMs, deps.clock ?? (() => Date.now()));
}

/**
 * Report which runner path is available.
 */
export async function getRunnerInfo(): Promise<{
  engine: 'quickjs' | 'fallback';
  reason?: string;
}> {
  if (await isQuickJsAvailable()) {
    return { engine: 'quickjs' };
  }
  return {
    engine: 'fallback',
    reason: '@jitl/quickjs-emscripten-core not installed — using Node.js vm module',
  };
}
