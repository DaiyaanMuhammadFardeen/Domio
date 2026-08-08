-- 0065_phase18_comments.up.sql
-- Phase 18 W1: Threaded comments with mentions.
--
-- Tables:
--   comment  — individual comment with thread, anchor, reactions (JSONB), attachments (JSONB).
--   mention  — per-recipient mention tracking with read status.
--
-- Thread is encoded on comment.thread_id (not a separate table).
-- Emoji reactions stored in comment.emoji_reactions JSONB.
-- Attachments stored in comment.attachments JSONB.

BEGIN;

-- ---------------------------------------------------------------------------
-- comment — individual comment within a thread.
-- thread_id: links to the parent comment in the same thread (top-level comments
--            reference themselves or a root comment; the application assigns this).
-- author_type: 'member' | 'guest' | 'agent'
-- target_type: 'element' | 'slide' | 'deck'
-- anchor: JSONB with element/slide coordinates for precise positioning.
-- emoji_reactions: JSONB map of emoji → user_id[] for reactions.
-- attachments: JSONB array of attachment objects.
-- status: 'open' | 'resolved' (thread-level resolution).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    thread_id            uuid NOT NULL,
    parent_id            uuid,
    author_id            uuid NOT NULL,
    author_type          text NOT NULL
                         CHECK (author_type IN ('member','guest','agent')),
    body_md              text NOT NULL,
    target_type          text NOT NULL
                         CHECK (target_type IN ('element','slide','deck')),
    target_id            uuid NOT NULL,
    anchor               jsonb,
    status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','resolved')),
    is_orphaned          boolean NOT NULL DEFAULT false,
    emoji_reactions      jsonb NOT NULL DEFAULT '{}'::jsonb,
    attachments          jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    resolved_at          timestamptz,
    resolved_by          uuid
);

CREATE INDEX IF NOT EXISTS comment_deck_idx ON comment (deck_id);
CREATE INDEX IF NOT EXISTS comment_thread_idx ON comment (thread_id);
CREATE INDEX IF NOT EXISTS comment_target_idx ON comment (target_type, target_id);

-- ---------------------------------------------------------------------------
-- mention — per-recipient mention tracking with read status.
-- mentioned_type: 'user' | 'role' | 'group'
-- notified_at: when the mention notification was sent.
-- read_at: when the mentioned user read the comment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mention (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    comment_id           uuid NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
    mentioned_id         uuid NOT NULL,
    mentioned_type       text NOT NULL
                         CHECK (mentioned_type IN ('user','role','group')),
    notified_at          timestamptz,
    read_at              timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mention_workspace_idx ON mention (workspace_id);
CREATE INDEX IF NOT EXISTS mention_comment_idx ON mention (comment_id);
CREATE INDEX IF NOT EXISTS mention_user_idx ON mention (mentioned_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'comment',
        'mention'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
              AND policyname = t || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I USING (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                ) WITH CHECK (
                    workspace_id::text = current_setting(''app.tenant_id'', true)
                    OR current_setting(''app.bypass_rls'', true) = ''on''
                )',
                t || '_tenant_isolation', t
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
