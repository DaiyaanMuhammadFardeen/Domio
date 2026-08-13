/**
 * P18 suggestions routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/suggestions-service';
import type { SuggestionsService } from '@domio/suggestions-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function suggestionRoutes(service: SuggestionsService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/v1/decks/:deck_id/suggestions', h('createSuggestion'));
  r.get('/v1/decks/:deck_id/suggestions', h('listSuggestions'));
  r.post('/v1/suggestions/:id/accept', h('acceptSuggestion'));
  r.post('/v1/suggestions/:id/reject', h('rejectSuggestion'));

  return r;
}
