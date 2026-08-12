/**
 * Editor annotation service — loads reviewer comments on a slide.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty list. The annotation-svc client (used by
 * the presenter runtime's AnnotationOverlay) will be extended to
 * also load editor-side comments in a later wave.
 */

export interface EditorAnnotation {
  readonly id: string;
  readonly slideId: string;
  readonly authorId: string;
  readonly text: string;
  readonly createdAtMs: number;
  readonly resolved: boolean;
}

export const BOOTSTRAP_EDITOR_ANNOTATIONS: ReadonlyArray<EditorAnnotation> = [];

export async function listEditorAnnotations(
  _deckId: string,
): Promise<ReadonlyArray<EditorAnnotation>> {
  return BOOTSTRAP_EDITOR_ANNOTATIONS;
}