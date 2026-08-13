/**
 * Tiny SQL tokenizer that yields semicolon-separated statements with their
 * preceding inline comments stripped and string literals blanked. This is
 * intentionally simple — it must never lie about destructive operations,
 * but it also doesn't need to be a full parser.
 *
 * Comments are blanked character-by-character (whitespace substituted) so
 * line numbers and column positions of the underlying code are preserved.
 */

export interface SqlStatement {
  sql: string;
  /** The 1-based line where the statement starts (after comments). */
  startLine: number;
}

export function parseStatements(source: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let buf = '';
  let bufStartLine = 1;
  let line = 1;
  let startLineLatched = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleString = false;
  let inDollarString = false;
  let dollarTag = '';
  let inDoubleString = false;

  const flush = () => {
    // Strip line comments entirely, then treat a string that's only
    // whitespace and semicolons as empty.
    const withoutComments = buf.replace(/--[^\n]*/g, '');
    const trimmed = withoutComments.replace(/[;\s]+/g, ' ').trim();
    if (trimmed.length > 0) {
      out.push({ sql: withoutComments.trim(), startLine: bufStartLine });
    }
    buf = '';
    bufStartLine = line + 1;
    startLineLatched = false;
  };

  const latchIfNeeded = () => {
    if (!startLineLatched) {
      bufStartLine = line;
      startLineLatched = true;
    }
  };

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    const next = source[i + 1];

    if (c === '\n') {
      line += 1;
      if (inLineComment) inLineComment = false;
      buf += c;
      continue;
    }

    if (inLineComment) {
      buf += c === '\n' ? c : ' ';
      continue;
    }

    if (inBlockComment) {
      if (c === '*' && next === '/') {
        buf += '  ';
        inBlockComment = false;
        i += 1;
        continue;
      }
      buf += c === '\n' ? c : ' ';
      continue;
    }

    if (inSingleString) {
      latchIfNeeded();
      buf += c;
      if (c === "'" && next === "'") {
        buf += "'";
        i += 1;
        continue;
      }
      if (c === "'") {
        inSingleString = false;
      }
      continue;
    }

    if (inDoubleString) {
      latchIfNeeded();
      buf += c;
      if (c === '"' && next === '"') {
        buf += '"';
        i += 1;
        continue;
      }
      if (c === '"') inDoubleString = false;
      continue;
    }

    if (inDollarString) {
      latchIfNeeded();
      buf += c;
      const tail = source.slice(i, i + dollarTag.length + 1);
      if (tail === dollarTag + '$') {
        inDollarString = false;
        dollarTag = '';
      }
      continue;
    }

    if (c === '-' && next === '-') {
      // Line comment is part of the buffer but doesn't latch startLine.
      buf += '  ';
      i += 1;
      inLineComment = true;
      continue;
    }

    if (c === '/' && next === '*') {
      // Block comment is part of the buffer but doesn't latch startLine.
      buf += '  ';
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (c === "'") {
      latchIfNeeded();
      buf += c;
      inSingleString = true;
      continue;
    }

    if (c === '"') {
      latchIfNeeded();
      buf += c;
      inDoubleString = true;
      continue;
    }

    if (c === '$') {
      const tagMatch = source.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (tagMatch) {
        latchIfNeeded();
        inDollarString = true;
        dollarTag = tagMatch[0];
        buf += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (c === ';') {
      buf += c;
      flush();
      continue;
    }

    // Whitespace (space, tab, etc.) — keep but don't latch.
    if (c === ' ' || c === '\t' || c === '\r') {
      buf += c;
      continue;
    }

    // Any other character is part of an actual SQL token.
    latchIfNeeded();
    buf += c;
  }

  flush();
  return out;
}

export function withoutStrings(s: string): string {
  return s
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, '""')
    .replace(/\$([A-Za-z0-9_]*)\$.*?\$\1\$/gs, '$$...$$');
}
