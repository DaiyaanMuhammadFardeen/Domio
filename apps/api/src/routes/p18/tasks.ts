/**
 * P18 task-manager routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/task-manager-service';
import type { TaskManagerService } from '@domio/task-manager-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function taskRoutes(service: TaskManagerService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/', h('createTaskLink'));
  r.get('/', h('listTaskLinks'));
  r.patch('/:id', h('updateTaskLink'));
  r.delete('/:id', h('deleteTaskLink'));
  r.post('/:id/sync', h('syncTaskLink'));

  return r;
}
