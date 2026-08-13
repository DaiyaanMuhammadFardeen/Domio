/**
 * P18 calendar routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/calendar-service';
import type { CalendarService } from '@domio/calendar-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function calendarRoutes(service: CalendarService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/v1/decks/:deck_id/calendar-links', h('createCalendarLink'));
  r.get('/v1/decks/:deck_id/calendar-links', h('listCalendarLinks'));
  r.delete('/v1/calendar-links/:id', h('deleteCalendarLink'));
  r.post('/v1/calendar-links/:id/sync', h('syncCalendarLink'));
  r.get('/v1/calendar-links/today', h('getPresenterTodayView'));

  return r;
}
