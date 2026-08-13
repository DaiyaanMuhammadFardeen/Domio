/**
 * MtClient tests — S5.5.
 */

import { describe, expect, it } from 'vitest';
import { translate } from './MtClient';

describe('MtClient.translate', () => {
  it('returns a non-empty translation for en->fr', async () => {
    const out = await translate({ text: 'hello', from: 'en', to: 'fr' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes the target locale in the mock output', async () => {
    const out = await translate({ text: 'hello', from: 'en', to: 'es' });
    expect(out).toContain('es');
  });

  it('passes the text through unchanged when from === to', async () => {
    const out = await translate({ text: 'hello', from: 'en', to: 'en' });
    expect(out).toBe('hello');
  });

  it('returns empty string for empty input', async () => {
    const out = await translate({ text: '', from: 'en', to: 'fr' });
    expect(out).toBe('');
  });
});
