/**
 * AI service — generates slide copy + structure suggestions.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns an empty suggestion. When the copilot-svc client lands,
 * this becomes a thin loader wrapper that streams structured output.
 */

export interface AiSuggestion {
  readonly kind: 'headline' | 'outline' | 'alt-text';
  readonly text: string;
}

export const BOOTSTRAP_AI_SUGGESTIONS: ReadonlyArray<AiSuggestion> = [];

export async function generateSuggestions(
  _prompt: string,
  _kind: AiSuggestion['kind'] = 'headline',
): Promise<ReadonlyArray<AiSuggestion>> {
  return BOOTSTRAP_AI_SUGGESTIONS;
}