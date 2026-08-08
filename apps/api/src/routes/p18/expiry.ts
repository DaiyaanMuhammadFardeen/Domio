/**
 * P18 expiry routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/expiry-service';
import type { ExpiryService } from '@domio/expiry-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function expiryRoutes(service: ExpiryService): Hono {
  const r = new Hono();
  const h = (name: string) => adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/v1/expiry-policies', h('upsertPolicy'));
  r.get('/v1/expiry-policies', h('listPolicies'));
  r.post('/v1/expiry-dashboard/confirm-freshness', h('confirmFreshness'));
  r.get('/v1/expiry-dashboard', h('getExpiryDashboard'));

  return r;
}
