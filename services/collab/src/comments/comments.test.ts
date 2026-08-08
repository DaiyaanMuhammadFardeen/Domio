/**
 * Comments module tests (Phase 18, #179).
 *
 * Anchor validation, mention parsing, create/resolve, reactions, orphan promotion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCollabStore } from '../store/mem_store.js';
import { CollabService } from '../service.js';
import { FEATURE_FLAGS, checkFeature } from '../feature_flags.js';
import {
  validateAnchor,
  parseMentions,
  resolveCommentBody,
  addReaction,
  removeReaction,
  promoteOrphan,
  validateCreateComment,
} from './logic.js';
import type { Comment, CreateCommentInput } from './types.js';
import {
  InvalidAnchorError,
  CollabValidationError,
  FeatureDisabledError,
} from '../types.js';

describe('Comment anchor validation', () => {
  it('accepts valid anchor with element in [0,1]', () => {
    expect(() => validateAnchor({ element: { x: 0.5, y: 0.5 }, slide: { x: 100, y: 200 } })).not.toThrow();
    expect(() => validateAnchor({ element: { x: 0, y: 0 }, slide: { x: 0, y: 0 } })).not.toThrow();
    expect(() => validateAnchor({ element: { x: 1, y: 1 }, slide: { x: -10, y: 50 } })).not.toThrow();
  });

  it('accepts anchor with null element (slide-only)', () => {
    expect(() => validateAnchor({ element: null, slide: { x: 100, y: 200 } })).not.toThrow();
  });

  it('rejects element.x out of range', () => {
    expect(() => validateAnchor({ element: { x: -0.1, y: 0.5 }, slide: { x: 0, y: 0 } })).toThrow(InvalidAnchorError);
    expect(() => validateAnchor({ element: { x: 1.1, y: 0.5 }, slide: { x: 0, y: 0 } })).toThrow(InvalidAnchorError);
  });

  it('rejects element.y out of range', () => {
    expect(() => validateAnchor({ element: { x: 0.5, y: -0.1 }, slide: { x: 0, y: 0 } })).toThrow(InvalidAnchorError);
    expect(() => validateAnchor({ element: { x: 0.5, y: 1.1 }, slide: { x: 0, y: 0 } })).toThrow(InvalidAnchorError);
  });

  it('accepts slide offsets of any value (including negative)', () => {
    expect(() => validateAnchor({ element: null, slide: { x: -100, y: -200 } })).not.toThrow();
    expect(() => validateAnchor({ element: null, slide: { x: 9999, y: 9999 } })).not.toThrow();
  });
});

describe('Mention parsing', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  let idCounter = 0;
  const idGen = () => `mention_${++idCounter}`;

  beforeEach(() => { idCounter = 0; });

  it('parses user mentions', () => {
    const mentions = parseMentions('c1', 'ws1', 'Hello @alice and @bob!', now, idGen);
    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.mentionedId).toBe('alice');
    expect(mentions[0]!.mentionedType).toBe('user');
    expect(mentions[1]!.mentionedId).toBe('bob');
    expect(mentions[1]!.mentionedType).toBe('user');
  });

  it('parses role mentions', () => {
    const mentions = parseMentions('c1', 'ws1', 'cc @role:designer', now, idGen);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.mentionedId).toBe('designer');
    expect(mentions[0]!.mentionedType).toBe('role');
  });

  it('parses group mentions', () => {
    const mentions = parseMentions('c1', 'ws1', 'ping @group:engineering', now, idGen);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.mentionedId).toBe('engineering');
    expect(mentions[0]!.mentionedType).toBe('group');
  });

  it('ignores duplicate mentions', () => {
    const mentions = parseMentions('c1', 'ws1', '@alice and @alice again', now, idGen);
    expect(mentions).toHaveLength(1);
  });

  it('ignores email-like tokens (PII)', () => {
    const mentions = parseMentions('c1', 'ws1', 'Contact user@example.com', now, idGen);
    expect(mentions).toHaveLength(0);
  });

  it('ignores long numeric tokens (phone-like)', () => {
    const mentions = parseMentions('c1', 'ws1', 'Call 1234567890', now, idGen);
    expect(mentions).toHaveLength(0);
  });

  it('returns empty for no mentions', () => {
    const mentions = parseMentions('c1', 'ws1', 'No mentions here', now, idGen);
    expect(mentions).toHaveLength(0);
  });
});

describe('Create comment validation', () => {
  it('rejects empty body_md', () => {
    const input: CreateCommentInput = {
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: '',
      targetType: 'element',
      targetId: 'el1',
    };
    expect(() => validateCreateComment(input)).toThrow(CollabValidationError);
  });

  it('rejects whitespace-only body_md', () => {
    const input: CreateCommentInput = {
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: '   ',
      targetType: 'element',
      targetId: 'el1',
    };
    expect(() => validateCreateComment(input)).toThrow(CollabValidationError);
  });

  it('rejects invalid target_type', () => {
    const input: CreateCommentInput = {
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: 'Hello',
      targetType: 'invalid' as 'element',
      targetId: 'el1',
    };
    expect(() => validateCreateComment(input)).toThrow(CollabValidationError);
  });
});

describe('Resolve comment', () => {
  it('sets resolved_at and resolved_by', () => {
    const comment = makeComment();
    const now = new Date();
    const resolved = resolveCommentBody(comment, 'user1', now);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBe(now);
    expect(resolved.resolvedBy).toBe('user1');
  });
});

describe('Reactions', () => {
  it('addReaction is idempotent', () => {
    let comment = makeComment();
    comment = addReaction(comment, '👍', 'user1');
    comment = addReaction(comment, '👍', 'user1');
    expect(comment.emojiReactions['👍']).toEqual(['user1']);
  });

  it('addReaction adds multiple users', () => {
    let comment = makeComment();
    comment = addReaction(comment, '👍', 'user1');
    comment = addReaction(comment, '👍', 'user2');
    expect(comment.emojiReactions['👍']).toEqual(['user1', 'user2']);
  });

  it('removeReaction removes user', () => {
    let comment = makeComment();
    comment = addReaction(comment, '👍', 'user1');
    comment = addReaction(comment, '👍', 'user2');
    comment = removeReaction(comment, '👍', 'user1');
    expect(comment.emojiReactions['👍']).toEqual(['user2']);
  });

  it('removeReaction cleans up empty emoji key', () => {
    let comment = makeComment();
    comment = addReaction(comment, '👍', 'user1');
    comment = removeReaction(comment, '👍', 'user1');
    expect(comment.emojiReactions['👍']).toBeUndefined();
  });
});

describe('Orphan promotion', () => {
  it('rewrites target to slide and marks orphaned', () => {
    const comment = makeComment();
    const now = new Date();
    const promoted = promoteOrphan(comment, 'slide_123', now);
    expect(promoted.targetType).toBe('slide');
    expect(promoted.targetId).toBe('slide_123');
    expect(promoted.isOrphaned).toBe(true);
    expect(promoted.updatedAt).toBe(now);
  });
});

describe('Feature flag guard', () => {
  it('throws FeatureDisabledError when comments flag is disabled', () => {
    process.env.FEATURE_COLLAB_COMMENTS_DISABLED = 'true';
    try {
      expect(() => checkFeature(FEATURE_FLAGS.comments)).toThrow(FeatureDisabledError);
    } finally {
      delete process.env.FEATURE_COLLAB_COMMENTS_DISABLED;
    }
  });

  it('does not throw when flag is not set', () => {
    delete process.env.FEATURE_COLLAB_COMMENTS_DISABLED;
    expect(() => checkFeature(FEATURE_FLAGS.comments)).not.toThrow();
  });
});

describe('CollabService comments integration', () => {
  let store: InMemoryCollabStore;
  let service: CollabService;
  const now = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    store = new InMemoryCollabStore();
    service = new CollabService({
      store,
      now: () => now,
    });
  });

  it('creates a comment and retrieves it', async () => {
    const { comment } = await service.createComment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: 'Hello world',
      targetType: 'element',
      targetId: 'el1',
      anchor: { element: { x: 0.5, y: 0.5 }, slide: { x: 100, y: 200 } },
    });

    expect(comment.id).toBeTruthy();
    expect(comment.bodyMd).toBe('Hello world');
    expect(comment.threadId).toBeTruthy();

    const comments = await service.listComments('deck1');
    expect(comments).toHaveLength(1);
    expect(comments[0]!.id).toBe(comment.id);
  });

  it('resolves a comment', async () => {
    const { comment } = await service.createComment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: 'Fix this',
      targetType: 'slide',
      targetId: 'slide1',
    });

    const resolved = await service.resolveComment(comment.id, 'user2');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedBy).toBe('user2');
  });

  it('creates threaded replies (same thread_id)', async () => {
    const { comment: parent } = await service.createComment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user1',
      authorType: 'member',
      bodyMd: 'Original comment',
      targetType: 'slide',
      targetId: 'slide1',
    });

    const { comment: reply } = await service.createComment({
      workspaceId: 'ws1',
      deckId: 'deck1',
      actorId: 'user2',
      authorType: 'member',
      bodyMd: 'Reply here',
      targetType: 'slide',
      targetId: 'slide1',
      parentId: parent.id,
    });

    expect(reply.threadId).toBe(parent.threadId);
    expect(reply.parentId).toBe(parent.id);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeComment(overrides?: Partial<Comment>): Comment {
  return {
    id: 'comment_1',
    workspaceId: 'ws1',
    deckId: 'deck1',
    threadId: 'thread_1',
    parentId: null,
    authorId: 'user1',
    authorType: 'member',
    bodyMd: 'Test comment',
    targetType: 'element',
    targetId: 'el1',
    anchor: { element: { x: 0.5, y: 0.5 }, slide: { x: 100, y: 200 } },
    status: 'open',
    isOrphaned: false,
    emojiReactions: {},
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}
