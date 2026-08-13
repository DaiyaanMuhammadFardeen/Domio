/**
 * Tests for Wave 9 §S9.4 — Statement service primitives.
 */

import { describe, expect, it } from 'vitest';
import {
  finalizeStatement,
  generateStatement,
  getStatement,
  listStatements,
} from './statement-service';

describe('statement-service (S9.4)', () => {
  it('listStatements returns 6 seeded statements', async () => {
    const statements = await listStatements('creator-test-1');
    expect(statements).toHaveLength(6);
    for (const s of statements) {
      expect(s.creator_id).toBe('creator-test-1');
      expect(s.period_month).toMatch(/^\d{4}-\d{2}$/);
      expect(['draft', 'finalized', 'paid', 'disputed']).toContain(s.status);
      expect(s.lines.length).toBeGreaterThan(0);
      expect(s.gross_cents).toBeGreaterThanOrEqual(0);
      expect(s.net_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it('generateStatement returns a draft statement for the requested month', async () => {
    const draft = await generateStatement('creator-test-2', '2025-03');
    expect(draft.status).toBe('draft');
    expect(draft.creator_id).toBe('creator-test-2');
    expect(draft.period_month).toBe('2025-03');
    expect(draft.id).toBe('stmt_creator-test-2_2025-03');
    expect(draft.generated_at_ms).toBeNull();
    expect(draft.finalized_at_ms).toBeNull();
    expect(draft.paid_at_ms).toBeNull();
    expect(draft.pdf_url).toBeNull();
    expect(draft.lines.length).toBeGreaterThan(0);
  });

  it('finalizeStatement sets status to finalized and stamps timestamps', async () => {
    const draft = await generateStatement('creator-test-3', '2025-04');
    expect(draft.status).toBe('draft');
    const finalized = await finalizeStatement(draft.id);
    expect(finalized.status).toBe('finalized');
    expect(finalized.finalized_at_ms).not.toBeNull();
    expect(finalized.generated_at_ms).not.toBeNull();
    expect(finalized.pdf_url).toMatch(/\.pdf$/);
  });

  it('getStatement returns the matching statement by id', async () => {
    await generateStatement('creator-test-4', '2025-05');
    const found = await getStatement('stmt_creator-test-4_2025-05');
    expect(found).not.toBeNull();
    expect(found?.creator_id).toBe('creator-test-4');
    expect(found?.period_month).toBe('2025-05');
  });

  it('getStatement returns null for an unknown id', async () => {
    const missing = await getStatement('nonsense-id');
    expect(missing).toBeNull();
  });
});
