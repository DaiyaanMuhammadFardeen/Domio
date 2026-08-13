/**
 * P18 meeting-integration routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/meeting-integration-service';
import type { MeetingIntegrationService } from '@domio/meeting-integration-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function meetingRoutes(service: MeetingIntegrationService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.get('/v1/meeting-integrations/:vendor/status', h('getMeetingIntegrationStatus'));
  r.post('/v1/meeting-integrations/:vendor/connect', h('connectMeetingIntegration'));
  r.post('/v1/meeting-integrations/:vendor/disconnect', h('disconnectMeetingIntegration'));
  r.post('/v1/meeting-integrations/:vendor/token', h('issueMeetingToken'));
  r.post('/v1/meeting-markers', h('recordMeetingMarker'));

  return r;
}
