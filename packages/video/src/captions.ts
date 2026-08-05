/**
 * WebVTT parser and generator (pure string math, no DOM).
 *
 * Parses "00:00:01.000 --> 00:00:03.500" cue blocks + text lines,
 * and generates WebVTT from cue arrays.
 */

export interface Cue {
  /** Start time in milliseconds. */
  startMs: number;
  /** End time in milliseconds. */
  endMs: number;
  /** Cue text (may span multiple lines). */
  text: string;
}

export interface ParseWarning {
  /** 1-based line number in the source where the issue was detected. */
  line: number;
  /** Human-readable description of the issue. */
  message: string;
}

export interface ParseResult {
  /** Successfully parsed cues. */
  cues: Cue[];
  /** Warnings for malformed lines (these were skipped). */
  warnings: ParseWarning[];
}

const TIMESTAMP_RE =
  /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/;

function parseTimestamp(ts: string): number | null {
  const match = ts.trim().match(
    /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/,
  );
  if (!match) return null;
  const [, hh, mm, ss, ms] = match;
  return (
    Number(hh) * 3_600_000 +
    Number(mm) * 60_000 +
    Number(ss) * 1_000 +
    Number(ms)
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad2(millis).padStart(3, '0')}`;
}

/**
 * Parse a WebVTT string into an array of Cue objects.
 *
 * Malformed cue lines are skipped with a warning collected in the result.
 */
export function parseVTT(vtt: string): ParseResult {
  const cues: Cue[] = [];
  const warnings: ParseWarning[] = [];
  const lines = vtt.split('\n');

  let i = 0;

  // Skip the optional "WEBVTT" header line
  if (lines.length > 0 && lines[0]!.trim().toUpperCase().startsWith('WEBVTT')) {
    i = 1;
    // Skip any header metadata lines (blank line ends the header)
    while (i < lines.length && lines[i]!.trim() !== '') {
      i++;
    }
    // Skip the blank line after header
    if (i < lines.length && lines[i]!.trim() === '') {
      i++;
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const lineNum = i + 1; // 1-based

    // Skip blank lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Try to match a timestamp line
    const timestampMatch = line.trim().match(TIMESTAMP_RE);
    if (!timestampMatch) {
      warnings.push({
        line: lineNum,
        message: `Expected timestamp line, got: "${line.trim()}"`,
      });
      i++;
      continue;
    }

    const startMs = parseTimestamp(timestampMatch[1] + ':' + timestampMatch[2] + ':' + timestampMatch[3] + '.' + timestampMatch[4]);
    const endMs = parseTimestamp(timestampMatch[5] + ':' + timestampMatch[6] + ':' + timestampMatch[7] + '.' + timestampMatch[8]);

    if (startMs === null || endMs === null) {
      warnings.push({
        line: lineNum,
        message: `Invalid timestamp: "${line.trim()}"`,
      });
      i++;
      continue;
    }

    if (startMs >= endMs) {
      warnings.push({
        line: lineNum,
        message: `Start time (${startMs}) >= end time (${endMs}), skipping cue`,
      });
      i++;
      continue;
    }

    i++; // move past timestamp line

    // Collect cue text lines (until blank line or EOF)
    const textLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '') {
      // Skip NOTE blocks
      if (lines[i]!.trim().toUpperCase().startsWith('NOTE')) {
        i++;
        while (i < lines.length && lines[i]!.trim() !== '') {
          i++;
        }
        break;
      }
      textLines.push(lines[i]!);
      i++;
    }

    const text = textLines.join('\n').trim();
    if (text.length === 0) {
      warnings.push({
        line: lineNum,
        message: 'Cue has no text content, skipping',
      });
      continue;
    }

    cues.push({ startMs, endMs, text });
  }

  return { cues, warnings };
}

/**
 * Generate a WebVTT string from an array of Cue objects.
 */
export function generateVTT(cues: Cue[]): string {
  const parts: string[] = ['WEBVTT', ''];

  for (const cue of cues) {
    const start = formatTimestamp(cue.startMs);
    const end = formatTimestamp(cue.endMs);
    parts.push(`${start} --> ${end}`);
    parts.push(cue.text);
    parts.push('');
  }

  return parts.join('\n');
}
