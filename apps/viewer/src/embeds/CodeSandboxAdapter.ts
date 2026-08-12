/**
 * CodeSandbox adapter — local execution for `runnable` code blocks.
 *
 * Per Wave 3 §S3.12 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer defers to the `code-sandbox` service for real sandboxed
 * execution; this module exposes the synchronous surface so React
 * components can stay testable. In production it POSTs to
 * `/v1/sandbox/run` with the code + language; here we run the code
 * in-process via a `new Function('return ...')` shape and capture
 * console output.
 */

export interface CodeRunRequest {
  readonly code: string;
  readonly language: string;
  readonly policyId: string;
}

export interface CodeRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const MAX_OUTPUT_CHARS = 8_192;

export async function runCodeSandbox(request: CodeRunRequest): Promise<CodeRunResult> {
  if (request.language !== 'javascript') {
    return {
      stdout: '',
      stderr: `Language "${request.language}" is not yet runnable in the viewer.`,
      exitCode: 2,
    };
  }
  const logs: string[] = [];
  const errs: string[] = [];
  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push(args.map(format).join(' ')),
    error: (...args: unknown[]) => errs.push(args.map(format).join(' ')),
    warn: (...args: unknown[]) => logs.push(`warn: ${args.map(format).join(' ')}`),
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function('console', `"use strict";\n${request.code}\n`);
    fn(sandboxConsole);
    return {
      stdout: logs.join('\n').slice(0, MAX_OUTPUT_CHARS),
      stderr: errs.join('\n').slice(0, MAX_OUTPUT_CHARS),
      exitCode: 0,
    };
  } catch (err) {
    return {
      stdout: logs.join('\n').slice(0, MAX_OUTPUT_CHARS),
      stderr: (err instanceof Error ? err.message : String(err)).slice(0, MAX_OUTPUT_CHARS),
      exitCode: 1,
    };
  }
}

function format(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}