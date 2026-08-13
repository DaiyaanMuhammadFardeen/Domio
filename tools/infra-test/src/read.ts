import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export function readText(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

export function listFiles(dir: string, ext?: string): string[] {
  const out: string[] = [];
  for (const path of walk(dir)) {
    if (!ext) {
      out.push(path);
      continue;
    }
    if (extname(path) === ext) out.push(path);
  }
  return out.sort();
}

export function assertContains(haystack: string, needle: string, label = ''): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected ${label || 'content'} to include: ${JSON.stringify(needle)}`);
  }
}

export function assertNotContains(haystack: string, needle: string, label = ''): void {
  if (haystack.includes(needle)) {
    throw new Error(`Did not expect ${label || 'content'} to include: ${JSON.stringify(needle)}`);
  }
}

export function assertMatch(haystack: string, regex: RegExp, label = ''): void {
  if (!regex.test(haystack)) {
    throw new Error(
      `Expected ${label || 'content'} to match ${regex} — first 240 chars: ${haystack.slice(0, 240)}`,
    );
  }
}
