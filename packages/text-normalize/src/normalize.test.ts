import { describe, expect, it } from 'vitest';
import {
  bucketKey,
  getCombinedStopwords,
  normalize,
  tokenize,
} from './index.js';

describe('text-normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Hello   World  ')).toBe('hello world');
  });

  it('NFKC-normalises compatibility forms', () => {
    expect(normalize('ﬁre')).toBe('fire');
    expect(normalize('café')).toBe('café');
  });

  it('strips zero-width and bidi-control codepoints', () => {
    expect(normalize('hi\u200Bthere\u202E')).toBe('hithere');
  });

  it('trims leading/trailing punctuation', () => {
    expect(normalize('  ??What is this??? ')).toBe('what is this');
  });

  it('preserves internal punctuation that carries meaning', () => {
    // Trailing "!" is trimmed — that's by design for word-cloud bucket keys
    expect(normalize("don't stop!")).toBe("don't stop");
    expect(normalize("don't stop?")).toBe("don't stop");
    expect(normalize("don't—stop")).toBe("don't—stop"); // em-dash preserved
  });

  it('caps to maxLength', () => {
    expect(normalize('a'.repeat(500), { maxLength: 100 })).toHaveLength(100);
  });

  it('skips case folding when disabled', () => {
    expect(normalize('Hello', { caseFold: false })).toBe('Hello');
  });

  it('tokenises Latin words and splits CJK per character', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
    // Bengali is alphabetic — it accumulates like Latin.
    expect(tokenize('হ্যালো বিশ্ব')).toEqual(['হ্যালো', 'বিশ্ব']);
    // CJK ideographs have no word boundary; we split per character.
    expect(tokenize('你好世界')).toEqual(['你', '好', '世', '界']);
    expect(tokenize('foo bar baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('returns identical bucket keys for equivalent input', () => {
    expect(bucketKey(normalize('  Hello World!  '))).toBe('HelloWorld');
    expect(bucketKey(normalize('hello world'))).toBe('HelloWorld');
  });

  it('returns empty bucket key for whitespace-only input', () => {
    expect(bucketKey(normalize('   '))).toBe('');
  });

  it('exposes stopwords for the three target locales', () => {
    expect(getCombinedStopwords(['en']).has('the')).toBe(true);
    expect(getCombinedStopwords(['es']).has('pero')).toBe(true);
    expect(getCombinedStopwords(['bn']).has('এবং')).toBe(true);
  });

  it('combines multiple locales', () => {
    const set = getCombinedStopwords(['en', 'es']);
    expect(set.has('the')).toBe(true);
    expect(set.has('pero')).toBe(true);
    expect(set.has('এবং')).toBe(false);
  });

  it('returns empty string for non-string input', () => {
    expect(normalize(undefined as unknown as string)).toBe('');
    expect(normalize(null as unknown as string)).toBe('');
    expect(normalize(42 as unknown as string)).toBe('');
  });
});