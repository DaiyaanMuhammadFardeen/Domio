/**
 * Wave 9 S9.1 — library-service tests.
 */
import { describe, expect, it } from 'vitest';
import { getMyLibrary } from './library-service';

describe('library-service', () => {
  it('getMyLibrary returns 6+ entries', async () => {
    const entries = await getMyLibrary('buyer_1');
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  it('at least 2 entries have update_available=true', async () => {
    const entries = await getMyLibrary('buyer_1');
    const updates = entries.filter((e) => e.update_available);
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });
});
