'use client';

/**
 * CommentPins — renders a small badge at each comment's anchor position
 * on the canvas slide viewport.  Anchors are fractional (0..1) and are
 * mapped to the slide SVG coordinate space (0..1600, 0..900).
 *
 * Clicking a pin expands the comment thread inline below the pin.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Comment, CommentStatus } from './types.js';
import { listComments, resolveComment, addReaction } from '../lib/collaboration-service.js';

// ----- Types -----

export interface CommentPinsProps {
  deckId: string;
  slideId: string;
  /** Actor ID of the current user — used for resolve/reaction permissions. */
  currentActorId: string;
}

// ----- Helpers -----

function statusColor(status: CommentStatus): string {
  return status === 'resolved' ? 'var(--muted)' : 'var(--accent)';
}

// ----- Component -----

export function CommentPins({ deckId, slideId, currentActorId }: CommentPinsProps): ReactElement {
  const [comments, setComments] = useState<Comment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await listComments(deckId);
      setComments(all.filter((c) => c.target_id === slideId && c.target_type === 'slide'));
    } catch {
      // Silently swallow — pins are decorative.
    }
  }, [deckId, slideId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  // currentActorId is used for permission checks; for now, all open
  // comments are resolvable by any actor (the backend enforces real ACL).
  void currentActorId;

  const handleResolve = useCallback(
    async (commentId: string) => {
      try {
        await resolveComment(commentId);
        await refresh();
      } catch {
        // no-op — will retry on next poll
      }
    },
    [refresh],
  );

  const handleReact = useCallback(
    async (commentId: string, emoji: string) => {
      try {
        await addReaction(commentId, emoji);
        await refresh();
      } catch {
        // no-op
      }
    },
    [refresh],
  );

  return (
    <>
      {comments.map((comment) => {
        const left = `${comment.anchor.x * 100}%`;
        const top = `${comment.anchor.y * 100}%`;
        const expanded = expandedId === comment.id;

        return (
          <div key={comment.id} className="comment-pin" style={{ left, top }}>
            <button
              type="button"
              className="comment-pin__badge"
              style={{ background: statusColor(comment.status) }}
              onClick={() => setExpandedId(expanded ? null : comment.id)}
              aria-label={`Comment by ${comment.author_id}`}
            >
              {comment.status === 'resolved' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.5L4.5 8.5L9.5 3.5"
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" fill="#fff" opacity="0.3" />
                  <circle cx="6" cy="6" r="2.5" fill="#fff" />
                </svg>
              )}
            </button>

            {expanded && (
              <div className="comment-pin__thread">
                <p className="comment-pin__body">{comment.body_md}</p>
                <div className="comment-pin__actions">
                  {comment.status === 'open' && (
                    <button
                      type="button"
                      className="collab-btn collab-btn--subtle"
                      onClick={() => void handleResolve(comment.id)}
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    type="button"
                    className="collab-btn collab-btn--subtle"
                    onClick={() => void handleReact(comment.id, '👍')}
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className="collab-btn collab-btn--subtle"
                    onClick={() => void handleReact(comment.id, '❤️')}
                  >
                    ❤️
                  </button>
                </div>
                <span className="comment-pin__author">{comment.author_id}</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
