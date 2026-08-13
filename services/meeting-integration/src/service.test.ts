/**
 * Meeting integration service tests (Phase 18).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MeetingIntegrationService, type MeetingIntegrationServiceOptions } from './service.js';
import { InMemoryMeetingStore } from './store/mem_store.js';
import type { MeetingEventEmitter, RecordMarkerInput, Vendor } from './types.js';
import { IntegrationNotFoundError, FeatureDisabledError, ValidationError } from './types.js';
import { setTokenSecret } from './tokens.js';
import { handlers } from './handlers.js';
import type { HttpRequest } from './handlers.js';

type ConnectBody = {
  workspace_id: string;
  vendor: Vendor;
  auth: Record<string, unknown>;
  connected_by: string;
  deck_id?: string;
};

type DisconnectBody = { deck_id?: string };

type TokenBody = {
  workspace_id: string;
  meeting_id: string;
  presenter_id: string;
  deck_id: string;
  meeting_end_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(opts?: {
  emitter?: MeetingEventEmitter;
  now?: () => Date;
  idGen?: () => string;
}) {
  const store = new InMemoryMeetingStore();
  const serviceOpts: Record<string, unknown> = { store };
  if (opts?.emitter !== undefined) serviceOpts.eventEmitter = opts.emitter;
  if (opts?.now !== undefined) serviceOpts.now = opts.now;
  if (opts?.idGen !== undefined) serviceOpts.idGen = opts.idGen;
  return {
    service: new MeetingIntegrationService(
      serviceOpts as unknown as MeetingIntegrationServiceOptions,
    ),
    store,
  };
}

function createEvents(): {
  events: Array<{ subject: string; payload: Record<string, unknown> }>;
  emitter: MeetingEventEmitter;
} {
  const events: Array<{ subject: string; payload: Record<string, unknown> }> = [];
  const emitter: MeetingEventEmitter = {
    async publish(subject, payload) {
      events.push({ subject, payload });
    },
  };
  return { events, emitter };
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

describe('MeetingIntegrationService', () => {
  beforeEach(() => {
    setTokenSecret('test-secret-for-meeting-integration');
  });

  it('feature flag off → 503 (FeatureDisabledError)', async () => {
    const { service } = createService();
    process.env['FEATURE_COLLAB_INTEGRATIONS_MEETING_DISABLED'] = 'true';
    try {
      await service.getStatus('ws1', 'zoom');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(FeatureDisabledError);
    } finally {
      delete process.env['FEATURE_COLLAB_INTEGRATIONS_MEETING_DISABLED'];
    }
  });

  // -------------------------------------------------------------------------
  // Connect / Disconnect lifecycle
  // -------------------------------------------------------------------------

  describe('connect/disconnect lifecycle', () => {
    it('connect creates integration with status connected', async () => {
      const { service, store } = createService();
      const integration = await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      expect(integration.id).toBeTruthy();
      expect(integration.workspace_id).toBe('ws1');
      expect(integration.vendor).toBe('zoom');
      expect(integration.status).toBe('connected');
      expect(integration.connected_by).toBe('user1');

      // Verify stored
      const stored = await store.getIntegration('ws1', 'zoom');
      expect(stored).toBeTruthy();
      expect(stored!.status).toBe('connected');
    });

    it('connect emits meeting.session_started', async () => {
      const { events, emitter } = createEvents();
      const { service } = createService({ emitter });

      await service.connect(
        {
          workspace_id: 'ws1',
          vendor: 'zoom',
          auth: { access_token: 'tok123' },
          connected_by: 'user1',
        },
        'deck-1',
      );

      const sessionEvent = events.find((e) => e.subject === 'meeting.session_started');
      expect(sessionEvent).toBeTruthy();
      expect(sessionEvent!.payload['payload']).toEqual(
        expect.objectContaining({
          vendor: 'zoom',
          presenter_id: 'user1',
        }),
      );
    });

    it('disconnect sets status to disconnected', async () => {
      const { service, store } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const result = await service.disconnect('ws1', 'zoom');
      expect(result.status).toBe('disconnected');

      const stored = await store.getIntegration('ws1', 'zoom');
      expect(stored!.status).toBe('disconnected');
    });

    it('disconnect emits meeting.session_ended', async () => {
      const { events, emitter } = createEvents();
      const { service } = createService({ emitter });

      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      await service.disconnect('ws1', 'zoom');

      const endEvent = events.find((e) => e.subject === 'meeting.session_ended');
      expect(endEvent).toBeTruthy();
      expect(endEvent!.payload['payload']).toEqual(
        expect.objectContaining({
          vendor: 'zoom',
          presenter_id: 'user1',
        }),
      );
    });

    it('disconnect throws IntegrationNotFoundError if not connected', async () => {
      const { service } = createService();
      await expect(service.disconnect('ws1', 'zoom')).rejects.toThrow(IntegrationNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // getStatus / getStatusAll / listActive
  // -------------------------------------------------------------------------

  describe('status queries', () => {
    it('getStatus returns disconnected by default', async () => {
      const { service } = createService();
      const { status, integration } = await service.getStatus('ws1', 'zoom');
      expect(status).toBe('disconnected');
      expect(integration).toBeNull();
    });

    it('getStatus returns connected after connect', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const { status } = await service.getStatus('ws1', 'zoom');
      expect(status).toBe('connected');
    });

    it('getStatusAll returns all vendors with status', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const all = await service.getStatusAll('ws1');
      expect(all).toHaveLength(3);
      expect(all.find((v) => v.vendor === 'zoom')!.status).toBe('connected');
      expect(all.find((v) => v.vendor === 'meet')!.status).toBe('disconnected');
      expect(all.find((v) => v.vendor === 'teams')!.status).toBe('disconnected');
    });

    it('listActive returns only connected integrations', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'teams',
        auth: { access_token: 'tok456' },
        connected_by: 'user2',
      });

      const active = await service.listActive('ws1');
      expect(active).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // issueToken
  // -------------------------------------------------------------------------

  describe('issueToken', () => {
    it('issues token when integration is connected', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const token = await service.issueToken(
        'ws1',
        'zoom',
        'meet-1',
        'presenter-1',
        'deck-1',
        new Date('2025-06-01T11:00:00Z'),
      );

      expect(token.token).toBeTruthy();
      expect(token.meeting_id).toBe('meet-1');
      expect(token.presenter_id).toBe('presenter-1');
      expect(token.deck_id).toBe('deck-1');
    });

    it('throws IntegrationNotFoundError when not connected', async () => {
      const { service } = createService();
      await expect(
        service.issueToken('ws1', 'zoom', 'meet-1', 'presenter-1', 'deck-1', new Date()),
      ).rejects.toThrow(IntegrationNotFoundError);
    });

    it('throws IntegrationNotFoundError when status is not connected', async () => {
      const { service } = createService();
      // Manually insert with disconnected status
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });
      await service.disconnect('ws1', 'zoom');

      await expect(
        service.issueToken('ws1', 'zoom', 'meet-1', 'presenter-1', 'deck-1', new Date()),
      ).rejects.toThrow(IntegrationNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // recordMarker
  // -------------------------------------------------------------------------

  describe('recordMarker', () => {
    it('records a marker successfully', async () => {
      const { service } = createService();
      const { marker, isFirst } = await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-1',
        transitioned_at: new Date('2025-06-01T10:00:00Z'),
      });

      expect(marker.id).toBeTruthy();
      expect(marker.meeting_id).toBe('meet-1');
      expect(marker.slide_id).toBe('slide-1');
      expect(isFirst).toBe(true);
    });

    it('isFirst is false for subsequent markers in same meeting', async () => {
      const { service } = createService();
      await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-1',
        transitioned_at: new Date('2025-06-01T10:00:00Z'),
      });

      const { isFirst } = await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-2',
        transitioned_at: new Date('2025-06-01T10:01:00Z'),
      });

      expect(isFirst).toBe(false);
    });

    it('first marker emits meeting.session_started', async () => {
      const { events, emitter } = createEvents();
      const { service } = createService({ emitter });

      await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-1',
        transitioned_at: new Date('2025-06-01T10:00:00Z'),
      });

      const sessionEvent = events.find((e) => e.subject === 'meeting.session_started');
      expect(sessionEvent).toBeTruthy();
      expect(sessionEvent!.payload['payload']).toEqual(
        expect.objectContaining({
          meeting_id: 'meet-1',
        }),
      );
    });

    it('subsequent markers do not emit meeting.session_started', async () => {
      const { events, emitter } = createEvents();
      const { service } = createService({ emitter });

      await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-1',
        transitioned_at: new Date('2025-06-01T10:00:00Z'),
      });

      events.length = 0; // Clear first marker event

      await service.recordMarker({
        meeting_id: 'meet-1',
        slide_id: 'slide-2',
        transitioned_at: new Date('2025-06-01T10:01:00Z'),
      });

      const sessionEvent = events.find((e) => e.subject === 'meeting.session_started');
      expect(sessionEvent).toBeFalsy();
    });

    it('rejects marker with future transition time', async () => {
      const { service } = createService({ now: () => new Date('2025-06-01T10:00:00Z') });
      await expect(
        service.recordMarker({
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: new Date('2025-06-01T10:05:00Z'), // 5 min future
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  describe('handlers', () => {
    it('getMeetingIntegrationStatus returns status', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const req: HttpRequest<{ vendor: Vendor }, undefined, { workspace_id?: string }> = {
        method: 'GET',
        path: '/v1/meeting-integrations/zoom/status',
        params: { vendor: 'zoom' },
        body: undefined,
        query: { workspace_id: 'ws1' },
        headers: {},
      };

      const res = await handlers.getMeetingIntegrationStatus(req, { service });
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).status).toBe('connected');
    });

    it('connectMeetingIntegration returns 201', async () => {
      const { service } = createService();
      const req: HttpRequest<{ vendor: Vendor }, ConnectBody> = {
        method: 'POST',
        path: '/v1/meeting-integrations/zoom/connect',
        params: { vendor: 'zoom' },
        body: {
          workspace_id: 'ws1',
          vendor: 'zoom',
          auth: { access_token: 'tok123' },
          connected_by: 'user1',
        },
        query: {},
        headers: { 'x-actor-id': 'user1' },
      };

      const res = await handlers.connectMeetingIntegration(req, { service });
      expect(res.status).toBe(201);
      const body = res.body as { integration: { status: string } };
      expect(body.integration.status).toBe('connected');
    });

    it('disconnectMeetingIntegration returns 200', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const req: HttpRequest<{ vendor: Vendor }, DisconnectBody, { workspace_id?: string }> = {
        method: 'POST',
        path: '/v1/meeting-integrations/zoom/disconnect',
        params: { vendor: 'zoom' },
        body: {},
        query: { workspace_id: 'ws1' },
        headers: {},
      };

      const res = await handlers.disconnectMeetingIntegration(req, { service });
      expect(res.status).toBe(200);
      const body = res.body as { integration: { status: string } };
      expect(body.integration.status).toBe('disconnected');
    });

    it('issueMeetingToken returns 201 with token', async () => {
      const { service } = createService();
      await service.connect({
        workspace_id: 'ws1',
        vendor: 'zoom',
        auth: { access_token: 'tok123' },
        connected_by: 'user1',
      });

      const req: HttpRequest<{ vendor: Vendor }, TokenBody> = {
        method: 'POST',
        path: '/v1/meeting-integrations/zoom/token',
        params: { vendor: 'zoom' },
        body: {
          workspace_id: 'ws1',
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: '2025-06-01T11:00:00Z',
        },
        query: {},
        headers: {},
      };

      const res = await handlers.issueMeetingToken(req, { service });
      expect(res.status).toBe(201);
      const body = res.body as { token: { token: string } };
      expect(body.token.token).toBeTruthy();
    });

    it('recordMeetingMarker returns 201', async () => {
      const { service } = createService();
      const req: HttpRequest<Record<string, never>, RecordMarkerInput> = {
        method: 'POST',
        path: '/v1/meeting-markers',
        params: {},
        body: {
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: new Date('2025-06-01T10:00:00Z'),
        },
        query: {},
        headers: {},
      };

      const res = await handlers.recordMeetingMarker(req, { service });
      expect(res.status).toBe(201);
      const body = res.body as { is_first: boolean };
      expect(body.is_first).toBe(true);
    });

    it('handler error mapping: IntegrationNotFoundError → 404', async () => {
      const { service } = createService();
      const req: HttpRequest<{ vendor: Vendor }, DisconnectBody, { workspace_id?: string }> = {
        method: 'POST',
        path: '/v1/meeting-integrations/zoom/disconnect',
        params: { vendor: 'zoom' },
        body: {},
        query: { workspace_id: 'ws1' },
        headers: {},
      };

      const res = await handlers.disconnectMeetingIntegration(req, { service });
      expect(res.status).toBe(404);
    });

    it('handler error mapping: FeatureDisabledError → 503', async () => {
      const { service } = createService();
      process.env['FEATURE_COLLAB_INTEGRATIONS_MEETING_DISABLED'] = 'true';

      try {
        const req: HttpRequest<{ vendor: Vendor }, undefined, { workspace_id?: string }> = {
          method: 'GET',
          path: '/v1/meeting-integrations/zoom/status',
          params: { vendor: 'zoom' },
          body: undefined,
          query: { workspace_id: 'ws1' },
          headers: {},
        };

        const res = await handlers.getMeetingIntegrationStatus(req, { service });
        expect(res.status).toBe(503);
      } finally {
        delete process.env['FEATURE_COLLAB_INTEGRATIONS_MEETING_DISABLED'];
      }
    });
  });
});
