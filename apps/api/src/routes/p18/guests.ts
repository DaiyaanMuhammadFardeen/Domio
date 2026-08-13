/**
 * P18 guest-access routes.
 *
 * Covers:
 *   POST   /v1/guests                    createGuest
 *   GET    /v1/guests/:id                getGuest
 *   DELETE /v1/guests/:id                deleteGuest
 *   POST   /v1/guests/:id/magic-link     resendGuestMagicLink
 *   POST   /v1/guest-access/consume      consumeGuestMagicLink
 */

import { Hono } from 'hono';
import { handlers } from '@domio/guests-service';
import type { GuestService } from '@domio/guests-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function guestsRoutes(service: GuestService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  // Guest CRUD — absolute paths under /v1/guests
  r.post('/v1/guests', h('createGuest'));
  r.get('/v1/guests/:id', h('getGuest'));
  r.delete('/v1/guests/:id', h('deleteGuest'));
  r.post('/v1/guests/:id/magic-link', h('resendGuestMagicLink'));

  // Magic-link consumption — separate prefix /v1/guest-access
  r.post('/v1/guest-access/consume', h('consumeGuestMagicLink'));

  return r;
}
