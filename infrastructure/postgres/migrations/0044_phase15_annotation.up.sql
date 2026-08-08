-- 0044_phase15_annotation.up.sql
-- Phase 15 W4: Annotation engine — pen, highlighter, spotlight, zoom, blur.
-- All five tools render as overlay layers on the live stage with saved
-- annotations attached to the slide as overlay layers.
--
-- Tables:
--   annotation_layer — one row per drawn overlay. May be attached to a
--                       session (live/ephemeral) or promoted to a slide
--                       (saved_overlay_id echoes into slide element).
-- geometry: JSONB describing the vector/path. Format depends on `kind`:
--   - pen / highlighter: { strokes: [[{x, y, pressure, t}, ...], ...] }
--   - spotlight: { x: number, y: number, radius: number, shape: 'circle' | 'rect' }
--   - zoom: { x: number, y: number, radius: number, magnification: number }
--   - blur: { x: number, y: number, width: number, height: number, radius: number }
-- ephemeral: TRUE for live-only strokes (cleared on session end); FALSE for
--            saved overlays attached to the slide.

BEGIN;

CREATE TABLE IF NOT EXISTS annotation_layer (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    slide_id              text NOT NULL,
    kind                  text NOT NULL
                          CHECK (kind IN ('pen','highlighter','spotlight','zoom','blur','saved')),
    geometry              jsonb NOT NULL,
    style                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    color                 text,
    stroke_width          numeric(6,2),
    ephemeral             boolean NOT NULL DEFAULT true,
    saved_overlay_id      uuid,
    promoted_at           timestamptz,
    promoted_by           uuid,
    drawn_by              uuid,
    drawn_by_display_name text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS annotation_layer_session_slide_idx
    ON annotation_layer (presenter_session_id, slide_id);
CREATE INDEX IF NOT EXISTS annotation_layer_ephemeral_idx
    ON annotation_layer (presenter_session_id, ephemeral);
CREATE INDEX IF NOT EXISTS annotation_layer_saved_overlay_idx
    ON annotation_layer (saved_overlay_id) WHERE saved_overlay_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS annotation_layer_workspace_idx
    ON annotation_layer (workspace_id);

DO $$
DECLARE
    t text := 'annotation_layer';
BEGIN
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
END $$;

COMMIT;