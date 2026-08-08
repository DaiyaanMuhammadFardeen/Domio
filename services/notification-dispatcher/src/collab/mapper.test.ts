import { describe, it, expect } from 'vitest';
import { mapCollabEvent } from './mapper.js';
import type { CollabEventEnvelope } from './types.js';

function env(event_type: string, payload: Record<string, unknown>, workspace_id = 'w-1'): CollabEventEnvelope {
  return { event_type, workspace_id, timestamp: 1700000000000, payload };
}

// ── comment.mentioned ────────────────────────────────────────────

describe('mapCollabEvent — comment.mentioned', () => {
  it('maps a user mention to in_app + slack notifications', () => {
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: '**Hello** world',
      mentioned_type: 'user',
      mentioned_id: 'u-1',
    }));
    expect(notifs).toHaveLength(2);
    expect(notifs.map((n) => n.channel).sort()).toEqual(['in_app', 'slack']);
    expect(notifs[0]?.rule_id).toBe('collab-comment.mentioned');
    expect(notifs[0]?.viewer_id_key).toBe('u-1');
    expect(notifs[0]?.recipient).toBe('u-1');
    expect(notifs[0]?.payload.title).toBe('You were mentioned in a comment');
    expect(notifs[0]?.payload.body).toBe('Hello world'); // markdown stripped
    expect(notifs[0]?.payload.link).toBe('/decks/d-1/comments/c-1');
  });

  it('returns [] for group mentions', () => {
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: 'hi',
      mentioned_type: 'group',
      mentioned_id: 'g-1',
    }));
    expect(notifs).toEqual([]);
  });

  it('returns [] for role mentions', () => {
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: 'hi',
      mentioned_type: 'role',
      mentioned_id: 'r-1',
    }));
    expect(notifs).toEqual([]);
  });

  it('returns [] when mentioned_id is missing', () => {
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: 'hi',
      mentioned_type: 'user',
      mentioned_id: '',
    }));
    expect(notifs).toEqual([]);
  });

  it('truncates body_md to 120 chars', () => {
    const long = 'a'.repeat(200);
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: long,
      mentioned_type: 'user',
      mentioned_id: 'u-1',
    }));
    expect(notifs[0]?.payload.body.length).toBeLessThanOrEqual(121); // 120 + ellipsis
    expect(notifs[0]?.payload.body).toContain('…');
  });

  it('strips markdown images and links', () => {
    const notifs = mapCollabEvent(env('comment.mentioned', {
      comment_id: 'c-1',
      deck_id: 'd-1',
      body_md: 'Check [this](https://example.com) and ![img](https://img.png)',
      mentioned_type: 'user',
      mentioned_id: 'u-1',
    }));
    expect(notifs[0]?.payload.body).toBe('Check this and');
  });
});

// ── approval.requested ───────────────────────────────────────────

describe('mapCollabEvent — approval.requested', () => {
  it('maps an approval request to in_app + slack', () => {
    const notifs = mapCollabEvent(env('approval.requested', {
      request_id: 'ar-1',
      deck_id: 'd-2',
      approver_id: 'u-2',
    }));
    expect(notifs).toHaveLength(2);
    expect(notifs.map((n) => n.channel).sort()).toEqual(['in_app', 'slack']);
    expect(notifs[0]?.rule_id).toBe('collab-approval.requested');
    expect(notifs[0]?.viewer_id_key).toBe('u-2');
    expect(notifs[0]?.payload.title).toBe('Approval requested');
    expect(notifs[0]?.payload.body).toBe('Approval request ar-1 for deck d-2');
    expect(notifs[0]?.payload.link).toBe('/decks/d-2/approvals/ar-1');
  });

  it('returns [] when approver_id is missing', () => {
    const notifs = mapCollabEvent(env('approval.requested', {
      request_id: 'ar-1',
      deck_id: 'd-2',
      approver_id: '',
    }));
    expect(notifs).toEqual([]);
  });

  it('returns [] when request_id is missing', () => {
    const notifs = mapCollabEvent(env('approval.requested', {
      request_id: '',
      deck_id: 'd-2',
      approver_id: 'u-2',
    }));
    expect(notifs).toEqual([]);
  });
});

// ── assignment.created ───────────────────────────────────────────

describe('mapCollabEvent — assignment.created', () => {
  it('notifies primary + watchers with correct title and link', () => {
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-1',
      deck_id: 'd-3',
      slide_range: '3–7',
      primary_id: 'u-3',
      watchers: ['u-4', 'u-5'],
      status: 'pending',
    }));
    // primary(2) + watcher1(2) + watcher2(2) = 6
    expect(notifs).toHaveLength(6);

    // Check primary
    const primary = notifs.filter((n) => n.viewer_id_key === 'u-3');
    expect(primary).toHaveLength(2);
    expect(primary[0]?.payload.title).toBe('You have been assigned slides 3–7');
    expect(primary[0]?.payload.body).toBe('Assignment status: pending');
    expect(primary[0]?.payload.link).toBe('/decks/d-3/assignments/as-1');

    // Check watchers
    const watcher1 = notifs.filter((n) => n.viewer_id_key === 'u-4');
    expect(watcher1).toHaveLength(2);
    const watcher2 = notifs.filter((n) => n.viewer_id_key === 'u-5');
    expect(watcher2).toHaveLength(2);
  });

  it('includes blocked_reason when status is blocked', () => {
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-2',
      deck_id: 'd-4',
      slide_range: '1–2',
      primary_id: 'u-6',
      watchers: [],
      status: 'blocked',
      blocked_reason: 'Reviewer unavailable',
    }));
    expect(notifs).toHaveLength(2);
    expect(notifs[0]?.payload.body).toBe('Assignment status: blocked — Reviewer unavailable');
  });

  it('does not include blocked_reason for non-blocked status', () => {
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-3',
      deck_id: 'd-5',
      slide_range: '1–3',
      primary_id: 'u-7',
      watchers: [],
      status: 'approved',
      blocked_reason: 'This should not appear',
    }));
    expect(notifs[0]?.payload.body).toBe('Assignment status: approved');
  });

  it('returns [] when primary_id is missing', () => {
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-4',
      deck_id: 'd-6',
      slide_range: '1–2',
      primary_id: '',
      watchers: [],
      status: 'pending',
    }));
    expect(notifs).toEqual([]);
  });

  it('returns [] when slide_range is missing', () => {
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-5',
      deck_id: 'd-7',
      slide_range: '',
      primary_id: 'u-8',
      watchers: [],
      status: 'pending',
    }));
    expect(notifs).toEqual([]);
  });

  it('deduplicates primary from watchers set', () => {
    // If primary_id is also in watchers, they should not get double notifications.
    const notifs = mapCollabEvent(env('assignment.created', {
      assignment_id: 'as-6',
      deck_id: 'd-8',
      slide_range: '1–5',
      primary_id: 'u-9',
      watchers: ['u-9'],
      status: 'pending',
    }));
    expect(notifs).toHaveLength(2); // Only 2 (in_app + slack), not 4
  });
});

// ── unknown event type ───────────────────────────────────────────

describe('mapCollabEvent — unknown event type', () => {
  it('returns [] for unknown event_type', () => {
    const notifs = mapCollabEvent(env('some.unknown.event', {}));
    expect(notifs).toEqual([]);
  });
});
