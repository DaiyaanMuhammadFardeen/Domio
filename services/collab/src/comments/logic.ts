/**
 * Comments module logic (Phase 18, #179).
 *
 * Business logic for element-pinned comments: anchor validation,
 * mention parsing, create/update/resolve, reactions, orphan promotion.
 */

import type {
  Comment,
  CommentAnchor,
  CreateCommentInput,
  Mention,
  MentionedType,
  UpdateCommentInput,
} from './types.js';
import {
  InvalidAnchorError,
  CommentNotFoundError,
  CollabValidationError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Anchor validation
// ---------------------------------------------------------------------------

export function validateAnchor(anchor: CommentAnchor): void {
  if (anchor.element !== null) {
    if (typeof anchor.element.x !== 'number' || anchor.element.x < 0 || anchor.element.x > 1) {
      throw new InvalidAnchorError('element.x must be a number in [0, 1]');
    }
    if (typeof anchor.element.y !== 'number' || anchor.element.y < 0 || anchor.element.y > 1) {
      throw new InvalidAnchorError('element.y must be a number in [0, 1]');
    }
  }
  if (typeof anchor.slide.x !== 'number') {
    throw new InvalidAnchorError('slide.x must be a number');
  }
  if (typeof anchor.slide.y !== 'number') {
    throw new InvalidAnchorError('slide.y must be a number');
  }
}

// ---------------------------------------------------------------------------
// Create comment
// ---------------------------------------------------------------------------

export function validateCreateComment(input: CreateCommentInput): void {
  if (!input.bodyMd || input.bodyMd.trim().length === 0) {
    throw new CollabValidationError('body_md is required and must be non-empty');
  }
  if (!['element', 'slide', 'deck'].includes(input.targetType)) {
    throw new CollabValidationError(`invalid target_type: ${input.targetType}`);
  }
  if (input.anchor) {
    validateAnchor(input.anchor);
  }
}

export interface CreateCommentResult {
  comment: Comment;
  mentions: Mention[];
}

export function createCommentBody(
  input: CreateCommentInput,
  existingComments: Comment[],
  opts: { now: () => Date; idGen: () => string },
): CreateCommentResult {
  validateCreateComment(input);
  const now = opts.now();
  let threadId: string;

  if (input.parentId) {
    const parent = existingComments.find((c) => c.id === input.parentId);
    if (!parent) throw new CommentNotFoundError(input.parentId);
    threadId = parent.threadId;
  } else {
    threadId = opts.idGen();
  }

  const comment: Comment = {
    id: opts.idGen(),
    workspaceId: input.workspaceId,
    deckId: input.deckId,
    threadId,
    parentId: input.parentId ?? null,
    authorId: input.actorId,
    authorType: input.authorType,
    bodyMd: input.bodyMd,
    targetType: input.targetType,
    targetId: input.targetId,
    anchor: input.anchor ?? null,
    status: 'open',
    isOrphaned: false,
    emojiReactions: {},
    attachments: input.attachments ?? [],
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedBy: null,
  };

  // Parse mentions from body_md
  const mentions = parseMentions(comment.id, input.workspaceId, input.bodyMd, now, opts.idGen);

  return { comment, mentions };
}

// ---------------------------------------------------------------------------
// Mention parsing
// ---------------------------------------------------------------------------

const MENTION_RE = /@(\w[\w.-]*(?::\w[\w.-]*)?)/g;

export function parseMentions(
  commentId: string,
  workspaceId: string,
  bodyMd: string,
  now: Date,
  idGen: () => string,
): Mention[] {
  const mentions: Mention[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = MENTION_RE.exec(bodyMd)) !== null) {
    const token = match[1]!;
    // Skip if preceded by a word char (email pattern like user@domain)
    const precedingChar = match.index > 0 ? bodyMd[match.index - 1] : undefined;
    if (precedingChar && /\w/.test(precedingChar)) continue;
    if (seen.has(token)) continue;
    seen.add(token);

    let mentionedId: string;
    let mentionedType: MentionedType;

    if (token.startsWith('role:')) {
      mentionedId = token.slice(5);
      mentionedType = 'role';
    } else if (token.startsWith('group:')) {
      mentionedId = token.slice(6);
      mentionedType = 'group';
    } else {
      // Skip email-like tokens (PII)
      if (token.includes('@') || /\d{5,}/.test(token)) continue;
      mentionedId = token;
      mentionedType = 'user';
    }

    if (!mentionedId) continue;

    mentions.push({
      id: idGen(),
      workspaceId,
      commentId,
      mentionedId,
      mentionedType,
      notifiedAt: null,
      readAt: null,
      createdAt: now,
    });
  }

  return mentions;
}

// ---------------------------------------------------------------------------
// Update comment
// ---------------------------------------------------------------------------

export function updateCommentBody(
  comment: Comment,
  patch: UpdateCommentInput,
  now: Date,
): Comment {
  if (patch.bodyMd !== undefined && patch.bodyMd.trim().length === 0) {
    throw new CollabValidationError('body_md must be non-empty');
  }
  return {
    ...comment,
    ...(patch.bodyMd !== undefined ? { bodyMd: patch.bodyMd } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Resolve comment
// ---------------------------------------------------------------------------

export function resolveCommentBody(
  comment: Comment,
  resolvedBy: string,
  now: Date,
): Comment {
  return {
    ...comment,
    status: 'resolved',
    resolvedAt: now,
    resolvedBy,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export function addReaction(
  comment: Comment,
  emoji: string,
  userId: string,
): Comment {
  const reactions = { ...comment.emojiReactions };
  const users = new Set(reactions[emoji] ?? []);
  users.add(userId);
  reactions[emoji] = [...users];
  return { ...comment, emojiReactions: reactions, updatedAt: new Date() };
}

export function removeReaction(
  comment: Comment,
  emoji: string,
  userId: string,
): Comment {
  const reactions = { ...comment.emojiReactions };
  const users = new Set(reactions[emoji] ?? []);
  users.delete(userId);
  if (users.size === 0) {
    delete reactions[emoji];
  } else {
    reactions[emoji] = [...users];
  }
  return { ...comment, emojiReactions: reactions, updatedAt: new Date() };
}

// ---------------------------------------------------------------------------
// Orphan promotion (rewrite target to slide)
// ---------------------------------------------------------------------------

export function promoteOrphan(
  comment: Comment,
  slideTargetId: string,
  now: Date,
): Comment {
  return {
    ...comment,
    targetType: 'slide',
    targetId: slideTargetId,
    isOrphaned: true,
    updatedAt: now,
  };
}
