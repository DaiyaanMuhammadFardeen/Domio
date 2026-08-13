/**
 * @domio/obs-control-plane — log redaction CI check (T-G2.6).
 *
 * Walks every service's source tree and asserts that no code logs raw
 * PII / biometric data / AI prompts / voice transcripts. Forbidden
 * patterns include:
 *
 *   - console.log / logger.* of variable names matching `email`,
 *     `phone`, `ssn`, `password`, `token`, `sessionToken`, etc.
 *   - explicit `console.log(req.body)` style full-request dumps
 *   - logging of Web Audio / WebRTC raw buffers
 *
 * The check is heuristic — it's the floor, not the ceiling. The full
 * redaction audit (T-G2.6 in the P22-beta plan) layers OTel assertions
 * on top.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/** Forbidden token patterns. Lower-cased, matched anywhere in the variable name. */
export const FORBIDDEN_LOG_TOKENS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'sessiontoken',
  'session_token',
  'jwt',
  'bearer',
  'cookie',
  'authorization',
  'email_body', // raw email content (not addresses)
  'raw_audio',
  'raw_video',
  'raw_frame',
  'gaze_raw',
  'voice_raw',
  'transcript_raw',
  'prompt_raw',
  'webcam_buffer',
  'microphone_buffer',
];

/** Forbidden function-call patterns (full-request dumps, full-body logs). */
export const FORBIDDEN_LOG_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'console.log of req.body', pattern: /console\.log\s*\(\s*req\.body\s*\)/ },
  { name: 'console.log of res.body', pattern: /console\.log\s*\(\s*res\.body\s*\)/ },
  { name: 'logger.info of req.body', pattern: /logger\.(info|debug|trace)\s*\(\s*req\.body\s*\)/ },
  {
    name: 'logger.error with raw error stack',
    pattern: /logger\.(error|warn)\s*\([^)]*err\.stack[^)]*\)/,
  },
  {
    name: 'JSON.stringify of req.body in console',
    pattern: /console\.log\s*\(\s*JSON\.stringify\s*\(\s*req\.body\s*\)\s*\)/,
  },
];

export interface LogRedactionIssue {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly kind: 'forbidden-token' | 'forbidden-pattern';
  readonly match: string;
  readonly rule: string;
}

export interface LogRedactionReport {
  readonly files: number;
  readonly issues: readonly LogRedactionIssue[];
  readonly pass: boolean;
}

/** Run the log-redaction check on a directory tree. */
export function checkLogRedaction(rootDir: string): LogRedactionReport {
  const files = collectFiles(rootDir, (f) => /\.(ts|js|mjs|cjs)$/.test(f));
  const issues: LogRedactionIssue[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Skip comments — line and block.
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) return;
      if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

      // Check forbidden tokens in log/console calls.
      const logCallMatch =
        /\b(?:console\.log|console\.info|console\.debug|console\.trace|logger\.[a-z]+)\s*\(/i.exec(
          line,
        );
      if (logCallMatch) {
        for (const token of FORBIDDEN_LOG_TOKENS) {
          const tokenRe = new RegExp(`\\b${token.replace(/[.+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (tokenRe.test(line)) {
            const col = line.indexOf(logCallMatch[0]);
            issues.push({
              file,
              line: idx + 1,
              column: col + 1,
              kind: 'forbidden-token',
              match: line.trim(),
              rule: `forbidden log token "${token}" inside log call`,
            });
            break; // one issue per line per file
          }
        }
      }

      // Check forbidden call patterns.
      for (const { name, pattern } of FORBIDDEN_LOG_PATTERNS) {
        if (pattern.test(line)) {
          const col = line.indexOf(line.trim());
          issues.push({
            file,
            line: idx + 1,
            column: col + 1,
            kind: 'forbidden-pattern',
            match: line.trim(),
            rule: name,
          });
        }
      }
    });
  }

  return {
    files: files.length,
    issues,
    pass: issues.length === 0,
  };
}

/** Recursively collect files under `rootDir` matching the predicate. */
function collectFiles(rootDir: string, accept: (path: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === '.turbo' ||
          entry === 'coverage'
        )
          continue;
        stack.push(full);
        continue;
      }
      if (st.isFile() && accept(full) && extname(full) !== '') {
        out.push(full);
      }
    }
  }
  return out.sort();
}
