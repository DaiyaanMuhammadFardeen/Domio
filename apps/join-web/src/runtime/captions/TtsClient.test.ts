/**
 * TtsClient tests — S5.5.
 */

import { describe, expect, it } from 'vitest';
import { createTtsClient, speak, defaultTtsClient } from './TtsClient';

describe('TtsClient.createTtsClient', () => {
  it('increments call count on each speak', () => {
    const client = createTtsClient();
    expect(client.callCount()).toBe(0);
    client.speak({ text: 'hi', locale: 'en' });
    expect(client.callCount()).toBe(1);
    client.speak({ text: 'hi again', locale: 'en' });
    expect(client.callCount()).toBe(2);
  });

  it('records history in order', () => {
    const client = createTtsClient();
    client.speak({ text: 'one', locale: 'en' });
    client.speak({ text: 'two', locale: 'fr' });
    const history = client.history();
    expect(history[0]?.text).toBe('one');
    expect(history[1]?.text).toBe('two');
    expect(history[1]?.locale).toBe('fr');
  });

  it('cancel() is a no-op', () => {
    const client = createTtsClient();
    expect(() => client.cancel()).not.toThrow();
  });
});

describe('TtsClient.speak shortcut', () => {
  it('delegates to the default client', () => {
    const before = defaultTtsClient.callCount();
    speak('hi', 'en');
    const after = defaultTtsClient.callCount();
    expect(after).toBe(before + 1);
  });
});
