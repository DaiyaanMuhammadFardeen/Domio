/**
 * P18 permission-engine routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/permission-engine';
import type { PermissionService } from '@domio/permission-engine';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function permissionRoutes(service: PermissionService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/grants', h('createGrant'));
  r.get('/grants', h('listGrants'));
  r.post('/check', h('checkPermission'));

  return r;
}
