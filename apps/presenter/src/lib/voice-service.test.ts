/**
 * voice-service tests — Wave 11 §S11.5.
 *
 * Covers the matcher scoring, phrase persistence, and audit-log
 * record/list round trips. All network paths degrade gracefully so the
 * demo build runs offline.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acknowledgePrivacy,
  buildVoiceMatch,
  DEFAULT_VOICE_PHRASES,
  findBestMatch,
  hasAcknowledgedPrivacy,
  listVoiceMatches,
  listVoicePhrases,
  recordVoiceMatch,
  savePhraseRegistry,
  scoreMatch,
  updateVoiceMatchStatus,
  __peekVoicePhrases,
  __resetVoiceServiceState,
  type VoicePhrase,
} from './voice-service';

const TEST_PHRASE_KEY = 'test.voice.registry';
const TEST_PRIVACY_KEY = 'test.voice.privacy';
const opts = { storageKey: TEST_PHRASE_KEY };

beforeEach(() => {
  __resetVoiceServiceState({
    storageKey: TEST_PHRASE_KEY,
    privacyStorageKey: TEST_PRIVACY_KEY,
  });
});

afterEach(() => {
  __resetVoiceServiceState({
    storageKey: TEST_PHRASE_KEY,
    privacyStorageKey: TEST_PRIVACY_KEY,
  });
});

describe('scoreMatch', () => {
  it('returns 1.0 when the utterance contains all registered tokens', () => {
    expect(scoreMatch("let's look at the bear case", "let's look at the bear case")).toBe(1);
  });

  it('is case-insensitive and ignores punctuation', () => {
    expect(scoreMatch("Let's Look, at the Bear case!", "lets look at the bear case")).toBe(1);
  });

  it('returns a fractional score when only some tokens match', () => {
    const score = scoreMatch("look at the bear case", "let's look at the bear case");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 when nothing matches', () => {
    expect(scoreMatch('hello world', "let's look at the bear case")).toBe(0);
  });

  it('returns 0 when either side is empty', () => {
    expect(scoreMatch('', 'bear')).toBe(0);
    expect(scoreMatch('bear', '')).toBe(0);
  });
});

describe('findBestMatch', () => {
  const phrases: VoicePhrase[] = [
    { id: 'p1', phrase: 'bear case', action: 'scenario_toggle', target: 'bear', threshold: 0.5, enabled: true },
    { id: 'p2', phrase: 'bull case', action: 'scenario_toggle', target: 'bull', threshold: 0.5, enabled: true },
    { id: 'p3', phrase: 'disabled phrase', action: 'mute', target: '', threshold: 0.0, enabled: false },
  ];

  it('returns the highest-confidence enabled match', () => {
    const result = findBestMatch('lets look at the bear case', phrases);
    expect(result).not.toBeNull();
    expect(result?.phrase.id).toBe('p1');
    expect(result?.confidence).toBeGreaterThan(0.5);
  });

  it('skips disabled phrases', () => {
    const onlyDisabled: VoicePhrase[] = [
      { id: 'pd', phrase: 'bear case', action: 'scenario_toggle', target: 'bear', threshold: 0.5, enabled: false },
    ];
    expect(findBestMatch('bear case', onlyDisabled)).toBeNull();
  });

  it('returns null when nothing meets its threshold', () => {
    const strict: VoicePhrase[] = [
      { id: 'ps', phrase: 'bear case', action: 'scenario_toggle', target: 'bear', threshold: 0.99, enabled: true },
    ];
    expect(findBestMatch('something else', strict)).toBeNull();
  });

  it('returns null when the phrase list is empty', () => {
    expect(findBestMatch('bear case', [])).toBeNull();
  });
});

describe('listVoicePhrases', () => {
  it('returns the defaults on first load', async () => {
    const list = await listVoicePhrases(opts);
    expect(list.length).toBe(DEFAULT_VOICE_PHRASES.length);
    const ids = list.map((p) => p.id);
    expect(ids).toContain('vp_default_bear_case');
    expect(ids).toContain('vp_default_q3_results');
    expect(ids).toContain('vp_default_poll');
  });

  it('persists the default list so subsequent calls return them', async () => {
    const first = await listVoicePhrases(opts);
    const second = await listVoicePhrases(opts);
    expect(first.length).toBe(second.length);
  });
});

describe('savePhraseRegistry', () => {
  it('returns the canonical list with ids filled in', async () => {
    const draft: VoicePhrase[] = [
      { id: '', phrase: 'mute please', action: 'mute', target: '', threshold: 0.4, enabled: true },
      { id: 'existing', phrase: 'next slide', action: 'slide_jump', target: 's5', threshold: 0.7, enabled: false },
    ];
    const saved = await savePhraseRegistry(draft, opts);
    expect(saved).toHaveLength(2);
    expect(saved[0]!.id.length).toBeGreaterThan(0);
    expect(saved[1]!.id).toBe('existing');
  });

  it('clamps thresholds to 0..1', async () => {
    const draft: VoicePhrase[] = [
      { id: 'a', phrase: 'hi', action: 'mute', target: '', threshold: 5, enabled: true },
      { id: 'b', phrase: 'lo', action: 'mute', target: '', threshold: -0.5, enabled: true },
    ];
    const saved = await savePhraseRegistry(draft, opts);
    expect(saved[0]!.threshold).toBe(1);
    expect(saved[1]!.threshold).toBe(0);
  });

  it('persists so subsequent listVoicePhrases returns the saved set', async () => {
    const saved = await savePhraseRegistry(
      [
        { id: 'custom1', phrase: 'go to q3', action: 'goto_section', target: 'q3', threshold: 0.5, enabled: true },
      ],
      opts,
    );
    const list = await listVoicePhrases(opts);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(saved[0]!.id);
  });
});

describe('recordVoiceMatch + listVoiceMatches', () => {
  it('records a match and lists it back', async () => {
    const match = buildVoiceMatch({
      phrase: "let's look at the bear case",
      confidence: 0.9,
      action: 'scenario_toggle',
      target: 'bear-case',
    });
    await recordVoiceMatch(match, opts);
    const list = await listVoiceMatches('session-1', undefined, opts);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(match.id);
    expect(list[0]!.action).toBe('scenario_toggle');
    expect(list[0]!.status).toBe('pending');
  });

  it('appends matches in order', async () => {
    const a = buildVoiceMatch({ phrase: 'a', confidence: 0.9, action: 'mute', target: '' });
    const b = buildVoiceMatch({ phrase: 'b', confidence: 0.9, action: 'mute', target: '' });
    await recordVoiceMatch(a, opts);
    await recordVoiceMatch(b, opts);
    const list = await listVoiceMatches('session-1', undefined, opts);
    expect(list.map((m) => m.phrase)).toEqual(['a', 'b']);
  });

  it('filters by sinceMs when provided', async () => {
    const old = buildVoiceMatch({ phrase: 'old', confidence: 0.9, action: 'mute', target: '', timestamp_ms: 1000 });
    const recent = buildVoiceMatch({ phrase: 'new', confidence: 0.9, action: 'mute', target: '', timestamp_ms: 2000 });
    await recordVoiceMatch(old, opts);
    await recordVoiceMatch(recent, opts);
    const list = await listVoiceMatches('session-1', 1500, opts);
    expect(list).toHaveLength(1);
    expect(list[0]!.phrase).toBe('new');
  });
});

describe('updateVoiceMatchStatus', () => {
  it('flips the status of a recorded match', async () => {
    const match = buildVoiceMatch({ phrase: 'p', confidence: 0.9, action: 'mute', target: '' });
    await recordVoiceMatch(match, opts);
    await updateVoiceMatchStatus(match.id, 'accepted', opts);
    const list = await listVoiceMatches('session-1', undefined, opts);
    expect(list[0]!.status).toBe('accepted');
  });

  it('no-ops for unknown ids', async () => {
    await expect(updateVoiceMatchStatus('does-not-exist', 'rejected', opts)).resolves.toBeUndefined();
  });
});

describe('buildVoiceMatch', () => {
  it('fills in defaults for status and timestamp_ms', () => {
    const m = buildVoiceMatch({ phrase: 'p', confidence: 0.5, action: 'mute', target: '' });
    expect(m.status).toBe('pending');
    expect(typeof m.timestamp_ms).toBe('number');
    expect(m.id.length).toBeGreaterThan(0);
  });
});

describe('privacy acknowledgement', () => {
  it('reports unacknowledged by default', async () => {
    expect(await hasAcknowledgedPrivacy({ storageKey: TEST_PRIVACY_KEY })).toBe(false);
  });

  it('flips to true after acknowledgement', async () => {
    await acknowledgePrivacy({ storageKey: TEST_PRIVACY_KEY });
    expect(await hasAcknowledgedPrivacy({ storageKey: TEST_PRIVACY_KEY })).toBe(true);
  });
});

describe('__peekVoicePhrases', () => {
  it('mirrors the current state', async () => {
    const initial = __peekVoicePhrases();
    expect(initial.length).toBe(DEFAULT_VOICE_PHRASES.length);

    await savePhraseRegistry(
      [{ id: 'only', phrase: 'one', action: 'mute', target: '', threshold: 0.5, enabled: true }],
      opts,
    );

    const after = __peekVoicePhrases();
    expect(after).toHaveLength(1);
    expect(after[0]!.phrase).toBe('one');
  });
});