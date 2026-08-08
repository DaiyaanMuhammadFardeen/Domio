import { describe, it, expect } from 'vitest';
import { signPayload } from './hmac.js';
import {
  receiveSlackEvent,
  receiveSlackInteraction,
  receiveSlackCommand,
  receiveTeamsAction,
  receiveTeamsCommand,
  type WebhookDeps,
} from './handlers.js';
import { InMemoryIdempotencyStore, NoopActionHandler } from './actions.js';

const SECRET = 'test-secret';
const deps: WebhookDeps = {
  secret: SECRET,
  idempotencyStore: new InMemoryIdempotencyStore(),
  actionHandler: new NoopActionHandler(),
};

describe('webhooks/handlers', () => {
  describe('receiveSlackEvent', () => {
    it('returns 200 for URL verification challenge', () => {
      const body = JSON.stringify({ challenge: 'abc123' });
      const res = receiveSlackEvent(body, undefined, deps);
      expect(res.status).toBe(200);
      expect((res.body as { challenge: string }).challenge).toBe('abc123');
    });

    it('returns 200 for event callback', () => {
      const body = JSON.stringify({ event: { type: 'message' } });
      const res = receiveSlackEvent(body, undefined, deps);
      expect(res.status).toBe(200);
    });

    it('returns 401 for invalid HMAC', () => {
      const body = JSON.stringify({ challenge: 'x' });
      const sig = signPayload('wrong-secret', body);
      const res = receiveSlackEvent(body, sig, deps);
      expect(res.status).toBe(401);
    });

    it('returns 200 for valid HMAC', () => {
      const body = JSON.stringify({ challenge: 'x' });
      const sig = signPayload(SECRET, body);
      const res = receiveSlackEvent(body, sig, deps);
      expect(res.status).toBe(200);
    });

    it('returns 400 for unrecognized payload', () => {
      const body = JSON.stringify({ foo: 'bar' });
      const res = receiveSlackEvent(body, undefined, deps);
      expect(res.status).toBe(400);
    });
  });

  describe('receiveSlackInteraction', () => {
    it('returns 200 for valid interaction with idempotency', async () => {
      const payload = {
        callback_id: 'cb-1',
        action: {
          action_id: 'approve_btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' }),
        },
      };
      const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
      const res = await receiveSlackInteraction(body, undefined, deps);
      expect(res.status).toBe(200);
    });

    it('returns 401 for invalid HMAC', async () => {
      const body = 'payload=%7B%7D';
      const sig = signPayload('wrong', body);
      const res = await receiveSlackInteraction(body, sig, deps);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON', async () => {
      const body = 'not-json';
      const res = await receiveSlackInteraction(body, undefined, deps);
      expect(res.status).toBe(400);
    });
  });

  describe('receiveSlackCommand', () => {
    it('dispatches /domio help', async () => {
      const body = 'command=/domio&text=help&trigger_id=t-1';
      const res = await receiveSlackCommand(body, undefined, deps);
      expect(res.status).toBe(200);
      expect((res.body as { text: string }).text).toContain('Commands');
    });

    it('returns 401 for invalid HMAC', async () => {
      const body = 'command=/help';
      const sig = signPayload('wrong', body);
      const res = await receiveSlackCommand(body, sig, deps);
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown command', async () => {
      const body = 'command=/nonexistent&trigger_id=t-1';
      const res = await receiveSlackCommand(body, undefined, deps);
      expect(res.status).toBe(404);
    });
  });

  describe('receiveTeamsAction', () => {
    it('returns 200 for valid Teams action', async () => {
      const payload = {
        callback_id: 'cb-1',
        action: {
          id: 'approve_btn',
          data: { notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' },
        },
        user: { id: 'u-teams' },
      };
      const body = JSON.stringify(payload);
      const res = await receiveTeamsAction(body, undefined, deps);
      expect(res.status).toBe(200);
    });

    it('returns 401 for invalid HMAC', async () => {
      const body = JSON.stringify({ action: {} });
      const sig = signPayload('wrong', body);
      const res = await receiveTeamsAction(body, sig, deps);
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await receiveTeamsAction('not-json', undefined, deps);
      expect(res.status).toBe(400);
    });
  });

  describe('receiveTeamsCommand', () => {
    it('dispatches /domio approve', async () => {
      const body = JSON.stringify({ text: '/domio approve req-1', triggerId: 't-1' });
      const res = await receiveTeamsCommand(body, undefined, deps);
      expect(res.status).toBe(200);
    });

    it('returns 401 for invalid HMAC', async () => {
      const body = JSON.stringify({ text: '/help' });
      const sig = signPayload('wrong', body);
      const res = await receiveTeamsCommand(body, sig, deps);
      expect(res.status).toBe(401);
    });
  });
});
