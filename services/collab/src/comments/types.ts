/**
 * Comments module types (Phase 18, #179).
 *
 * Pinned comments with element-level anchoring, threaded replies,
 * mentions, reactions, and orphan promotion.
 */

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

export interface CommentAnchor {
  /** Element-relative fractional offsets (0..1). */
  readonly element: { x: number; y: number } | null;
  /** Slide-relative pixel offsets (any number). */
  readonly slide: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Comment row
// ---------------------------------------------------------------------------

export type CommentTargetType = 'element' | 'slide' | 'deck';
export type CommentStatus = 'open' | 'resolved';
export type CommentAuthorType = 'member' | 'guest' | 'agent';

export interface Comment {
  readonly id: string;
  readonly workspaceId: string;
  readonly deckId: string;
  readonly threadId: string;
  readonly parentId: string | null;
  readonly authorId: string;
  readonly authorType: CommentAuthorType;
  readonly bodyMd: string;
  readonly targetType: CommentTargetType;
  readonly targetId: string;
  readonly anchor: CommentAnchor | null;
  readonly status: CommentStatus;
  readonly isOrphaned: boolean;
  readonly emojiReactions: Record<string, readonly string[]>;
  readonly attachments: readonly Record<string, unknown>[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
}

// ---------------------------------------------------------------------------
// Mention
// ---------------------------------------------------------------------------

export type MentionedType = 'user' | 'role' | 'group';

export interface Mention {
  readonly id: string;
  readonly workspaceId: string;
  readonly commentId: string;
  readonly mentionedId: string;
  readonly mentionedType: MentionedType;
  readonly notifiedAt: Date | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Create comment input
// ---------------------------------------------------------------------------

export interface CreateCommentInput {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly actorId: string;
  readonly authorType: CommentAuthorType;
  readonly bodyMd: string;
  readonly targetType: CommentTargetType;
  readonly targetId: string;
  readonly anchor?: CommentAnchor | null;
  readonly parentId?: string | null;
  readonly attachments?: readonly Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Update comment input
// ---------------------------------------------------------------------------

export interface UpdateCommentInput {
  readonly bodyMd?: string;
  readonly status?: CommentStatus;
}
