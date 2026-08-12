/**
 * Widget service — the audience-side widget catalogue.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty widget list. The widget-catalog-svc client
 * will replace this in a later wave.
 */

export interface WidgetDescriptor {
  readonly id: string;
  readonly kind: 'poll' | 'qa' | 'quiz' | 'wordcloud' | 'rating';
  readonly title: string;
  readonly updatedAtMs: number;
}

export const BOOTSTRAP_WIDGETS: ReadonlyArray<WidgetDescriptor> = [];

export async function listWidgets(
  _sessionId: string,
): Promise<ReadonlyArray<WidgetDescriptor>> {
  return BOOTSTRAP_WIDGETS;
}