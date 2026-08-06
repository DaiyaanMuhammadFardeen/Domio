-- 0039_phase12_ai_copilot.up.sql
-- Phase 12: AI Copilot foundation — all 12 tables per docs/ai-copilot.md §5.
--
-- Tables: source, ai_job, ai_run, citation, slide_citation,
-- image_generation_request, rehearsal_session, qa_pair, summary,
-- audience_variant, ai_freshness_record, semantic_index_entry.
--
-- ID strategy: uuid PRIMARY KEY DEFAULT gen_random_uuid() (matching P08+).
-- Tenant isolation: workspace_id UUID NOT NULL with RLS policies.
-- Universal audit: created_at, updated_at, created_by, updated_by,
--   ai_run_id, agent_session_id on every table (§5.11).
-- NOTE: The P08 freshness_record (0021) tracks data-binding freshness;
-- this migration creates ai_freshness_record for citation/claim freshness
-- to avoid naming collision.

BEGIN;

-- ---------------------------------------------------------------------------
-- source — ingested document or data source.
-- kind: pdf, docx, notion, markdown, url, sheet, custom.
-- ref: JSONB with URL, object key, or connector-specific metadata.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    kind            text NOT NULL
                    CHECK (kind IN ('pdf','docx','notion','markdown','url','sheet','custom')),
    title           text NOT NULL,
    ref             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_workspace_idx ON source (workspace_id);
CREATE INDEX IF NOT EXISTS source_kind_idx ON source (workspace_id, kind);

-- ---------------------------------------------------------------------------
-- ai_job — queued generation request.
-- idempotency_key is unique per workspace.
-- status: queued, running, succeeded, failed, cancelled, partial.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_job (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    requested_by    uuid NOT NULL,
    idempotency_key uuid NOT NULL,
    job_type        text NOT NULL,
    status          text NOT NULL
                    CHECK (status IN ('queued','running','succeeded','failed','cancelled','partial')),
    payload         jsonb NOT NULL,
    constraints     jsonb NOT NULL DEFAULT '{}'::jsonb,
    result          jsonb,
    error           jsonb,
    cost_cents      integer NOT NULL DEFAULT 0,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz,
    completed_at    timestamptz,
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_job_ws_status_idx ON ai_job (workspace_id, status);
CREATE INDEX IF NOT EXISTS ai_job_created_at_idx ON ai_job (created_at);

-- ---------------------------------------------------------------------------
-- ai_run — one attempt of an ai_job, plus per-step records.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_run (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          uuid NOT NULL REFERENCES ai_job (id) ON DELETE CASCADE,
    parent_run_id   uuid REFERENCES ai_run (id),
    step_name       text NOT NULL,
    model_class     text,
    model_id        text,
    prompt_hash     text,
    prompt_ref      text,
    input_tokens    integer,
    output_tokens   integer,
    cost_cents      integer,
    status          text NOT NULL DEFAULT 'running',
    error           jsonb,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS ai_run_job_idx ON ai_run (job_id);
CREATE INDEX IF NOT EXISTS ai_run_started_idx ON ai_run (started_at);

-- ---------------------------------------------------------------------------
-- citation — first-class citation record with snippet, location, confidence.
-- quote_hash: hash of snippet for de-duplication.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citation (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    source_id       uuid NOT NULL REFERENCES source (id),
    location        jsonb NOT NULL,
    snippet         text NOT NULL,
    quote_hash      text NOT NULL,
    confidence      real NOT NULL,
    verified_by     uuid,
    verified_at     timestamptz,
    disputed        boolean NOT NULL DEFAULT false,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citation_workspace_idx ON citation (workspace_id);
CREATE INDEX IF NOT EXISTS citation_source_idx ON citation (source_id);

-- ---------------------------------------------------------------------------
-- slide_citation — many-to-many slide ↔ citation ↔ claim.
-- PRIMARY KEY (slide_id, claim_id, citation_id).
-- role: primary, supporting, background.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slide_citation (
    slide_id        uuid NOT NULL,
    citation_id     uuid NOT NULL REFERENCES citation (id),
    claim_id        uuid NOT NULL,
    role            text NOT NULL
                    CHECK (role IN ('primary','supporting','background')),
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (slide_id, claim_id, citation_id)
);

CREATE INDEX IF NOT EXISTS slide_citation_slide_idx ON slide_citation (slide_id);
CREATE INDEX IF NOT EXISTS slide_citation_citation_idx ON slide_citation (citation_id);

-- ---------------------------------------------------------------------------
-- image_generation_request — image-gen audit with prompt, model, moderation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS image_generation_request (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    requested_by        uuid NOT NULL,
    prompt              text NOT NULL,
    style_ref_image_id  uuid,
    brand_kit_id        uuid,
    model_class         text NOT NULL,
    model_id            text NOT NULL,
    seed                bigint,
    output_asset_id     uuid,
    moderation_verdict  jsonb,
    status              text NOT NULL
                        CHECK (status IN ('queued','processing','completed','failed')),
    cost_cents          integer,
    created_by          uuid,
    updated_by          uuid,
    ai_run_id           uuid,
    agent_session_id    uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS igr_workspace_idx ON image_generation_request (workspace_id);

-- ---------------------------------------------------------------------------
-- rehearsal_session — per-session coaching metrics + consent + retention.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rehearsal_session (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    user_id         uuid NOT NULL,
    deck_id         uuid NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    consent_flags   jsonb NOT NULL,
    raw_video_ref   text,
    raw_audio_ref   text,
    metrics         jsonb,
    flagged         boolean NOT NULL DEFAULT false,
    retention_until timestamptz,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rehearsal_user_deck_idx ON rehearsal_session (user_id, deck_id);

-- ---------------------------------------------------------------------------
-- qa_pair — per-slide anticipated Q&A.
-- difficulty: easy, medium, hard.
-- user_status: expected, surprise, skip, NULL.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_pair (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         uuid NOT NULL,
    slide_id        uuid NOT NULL,
    question        text NOT NULL,
    rationale       text,
    suggested_answer text,
    difficulty      text
                    CHECK (difficulty IN ('easy','medium','hard')),
    audience_profile text,
    user_status     text
                    CHECK (user_status IN ('expected','surprise','skip')),
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_pair_deck_slide_idx ON qa_pair (deck_id, slide_id);

-- ---------------------------------------------------------------------------
-- summary — executive summary, TL;DR, one-pager.
-- variant: executive, tldr, one_pager.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS summary (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         uuid NOT NULL,
    variant         text NOT NULL
                    CHECK (variant IN ('executive','tldr','one_pager')),
    content         jsonb NOT NULL,
    source_deck_version_id uuid,
    language        text NOT NULL DEFAULT 'en',
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS summary_deck_idx ON summary (deck_id);

-- ---------------------------------------------------------------------------
-- audience_variant — derived decks with diff summary.
-- variant_type: five_min, technical, executive, sales, customer.
-- UNIQUE (source_deck_id, variant_type).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audience_variant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_deck_id  uuid NOT NULL,
    variant_type    text NOT NULL
                    CHECK (variant_type IN ('five_min','technical','executive','sales','customer')),
    derived_deck_id uuid NOT NULL,
    diff_summary    jsonb,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_deck_id, variant_type)
);

-- ---------------------------------------------------------------------------
-- ai_freshness_record — citation/claim freshness tracker.
-- NOTE: Named ai_freshness_record to avoid collision with P08 freshness_record.
-- verified_via: auto, manual, fetch_retry.
-- freshness_score: 0..1.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_freshness_record (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    source_id       uuid REFERENCES source (id),
    citation_id     uuid,
    claim_id        uuid,
    last_verified_at timestamptz NOT NULL,
    threshold_days  integer NOT NULL,
    freshness_score real NOT NULL,
    verified_via    text
                    CHECK (verified_via IN ('auto','manual','fetch_retry')),
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_freshness_workspace_idx ON ai_freshness_record (workspace_id);

-- ---------------------------------------------------------------------------
-- semantic_index_entry — pgvector rows mirrored relationally.
-- embedding: vector(1536) for cosine similarity search.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_index_entry (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    slide_id        uuid NOT NULL,
    chunk_id        uuid NOT NULL,
    text            text NOT NULL,
    language        text,
    metadata        jsonb,
    created_by      uuid,
    updated_by      uuid,
    ai_run_id       uuid,
    agent_session_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_index_workspace_idx
    ON semantic_index_entry (workspace_id);

-- NOTE: The pgvector embedding column and ivfflat index are added in a
-- separate migration that requires the pgvector extension to be enabled.
-- This migration creates the relational shell only. When pgvector is
-- available, run:
--   ALTER TABLE semantic_index_entry ADD COLUMN embedding vector(1536);
--   CREATE INDEX semantic_index_embedding_idx
--     ON semantic_index_entry USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Row-level security. The application sets `app.tenant_id` per request via
-- `SET LOCAL app.tenant_id = '...';`. Privileged roles bypass RLS.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'source', 'ai_job', 'ai_run', 'citation', 'slide_citation',
        'image_generation_request', 'rehearsal_session', 'qa_pair',
        'summary', 'audience_variant', 'ai_freshness_record',
        'semantic_index_entry'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
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
