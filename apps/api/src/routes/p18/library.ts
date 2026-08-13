/**
 * P18 library routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/library-service';
import type { LibraryService } from '@domio/library-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function libraryRoutes(service: LibraryService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  // Library entries
  r.post('/v1/library/entries', h('createEntry'));
  r.get('/v1/library/entries', h('listEntries'));
  r.get('/v1/library/entries/:id', h('getEntry'));
  r.post('/v1/library/entries/:id/versions', h('addVersion'));
  r.post('/v1/library/entries/:id/publish', h('publishEntry'));
  r.post('/v1/library/entries/:id/retire', h('retireEntry'));

  // Insert from library
  r.post('/v1/decks/:deck_id/slides/insert-from-library', h('insertFromLibrary'));

  // Auto-update bindings
  r.post('/v1/auto-update/bindings', h('createBinding'));
  r.get('/v1/auto-update/bindings', h('listBindings'));
  r.patch('/v1/auto-update/bindings/:id', h('updateBinding'));
  r.delete('/v1/auto-update/bindings/:id', h('deleteBinding'));

  return r;
}
