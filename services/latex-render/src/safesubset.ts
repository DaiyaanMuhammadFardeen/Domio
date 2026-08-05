/**
 * Safe-subset gate for LaTeX input.
 *
 * Rejects sources containing dangerous TeX commands that could perform
 * I/O, file access, or shell execution. Case-insensitive matching.
 *
 * Forbidden commands:
 *   \input, \include, \href, \url, \write, \read, \newwrite,
 *   \openout, \closeout, \special, \immediate
 */

const FORBIDDEN_COMMANDS = [
  'input',
  'include',
  'href',
  'url',
  'write',
  'read',
  'newwrite',
  'openout',
  'closeout',
  'special',
  'immediate',
] as const;

/**
 * Check whether a LaTeX source string is within the safe subset.
 * Returns null if safe, or the name of the first forbidden command found.
 */
export function findForbiddenCommand(source: string): string | null {
  for (const cmd of FORBIDDEN_COMMANDS) {
    // Match \cmd as a whole command (followed by non-alphanumeric or end-of-string)
    const pattern = new RegExp(`\\\\${cmd}(?![a-zA-Z])`, 'i');
    if (pattern.test(source)) {
      return cmd;
    }
  }
  return null;
}

/**
 * Validate source against the safe subset.
 * Returns { ok: true } if safe, or { ok: false, command, message } if not.
 */
export function validateSafeSubset(
  source: string,
): { ok: true } | { ok: false; command: string; message: string } {
  const cmd = findForbiddenCommand(source);
  if (cmd) {
    return {
      ok: false,
      command: cmd,
      message: `Command not allowed in LaTeX subset: ${cmd}`,
    };
  }
  return { ok: true };
}
