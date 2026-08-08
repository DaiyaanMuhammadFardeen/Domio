import { describe, it, expect } from 'vitest';
import {
  buildActionButtons,
  buildActionBlocks,
  parseCallbackPayload,
  handleAction,
  InMemoryIdempotencyStore,
  NoopActionHandler,
  type ActionHandler,
  type ActionResult,
} from './actions.js';

describe('webhooks/actions', () => {
  describe('buildActionButtons', () => {
    it('builds 4 buttons by default', () => {
      const buttons = buildActionButtons('notif-1', 'idem-key-1');
      expect(buttons).toHaveLength(4);
      expect(buttons.map((b) => b.text.text)).toEqual(['Approve', 'Reject', 'Open', 'Resolve']);
    });

    it('encodes notificationId + action + idempotencyKey in value', () => {
      const buttons = buildActionButtons('n-42', 'key-99');
      const approve = buttons.find((b) => b.text.text === 'Approve')!;
      const value = JSON.parse(approve.value);
      expect(value.notificationId).toBe('n-42');
      expect(value.action).toBe('approve');
      expect(value.idempotencyKey).toBe('key-99');
    });

    it('respects custom action list', () => {
      const buttons = buildActionButtons('n-1', 'k-1', ['approve', 'reject']);
      expect(buttons).toHaveLength(2);
    });
  });

  describe('buildActionBlocks', () => {
    it('wraps buttons in an actions block', () => {
      const blocks = buildActionBlocks('n-1', 'k-1');
      expect(blocks.type).toBe('actions');
      expect(blocks.elements).toHaveLength(4);
    });
  });

  describe('parseCallbackPayload', () => {
    it('parses a valid callback payload', () => {
      const raw = {
        callback_id: 'cb-1',
        action: {
          action_id: 'approve_btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' }),
        },
        user: { id: 'u-1' },
        response_url: 'https://hooks.slack.com/actions',
      };
      const result = parseCallbackPayload(raw);
      expect(result).not.toBeNull();
      expect(result?.callback_id).toBe('cb-1');
      expect(result?.user?.id).toBe('u-1');
    });

    it('returns null when callback_id is missing', () => {
      expect(parseCallbackPayload({ action: { action_id: 'a', value: '{}' } })).toBeNull();
    });

    it('returns null when action is missing', () => {
      expect(parseCallbackPayload({ callback_id: 'cb-1' })).toBeNull();
    });

    it('returns null when value is not valid JSON', () => {
      const raw = {
        callback_id: 'cb-1',
        action: { action_id: 'a', value: 'not-json' },
      };
      expect(parseCallbackPayload(raw)).toBeNull();
    });

    it('returns null when parsed value lacks required fields', () => {
      const raw = {
        callback_id: 'cb-1',
        action: { action_id: 'a', value: JSON.stringify({ notificationId: 'n-1' }) },
      };
      expect(parseCallbackPayload(raw)).toBeNull();
    });
  });

  describe('handleAction', () => {
    it('returns 400 for invalid payload', async () => {
      const result = await handleAction({}, {
        idempotencyStore: new InMemoryIdempotencyStore(),
        actionHandler: new NoopActionHandler(),
      });
      expect(result.status).toBe(400);
    });

    it('returns 404 for unknown action', async () => {
      const raw = {
        callback_id: 'cb-1',
        action: {
          action_id: 'btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'bogus', idempotencyKey: 'k-1' }),
        },
      };
      const result = await handleAction(raw, {
        idempotencyStore: new InMemoryIdempotencyStore(),
        actionHandler: new NoopActionHandler(),
      });
      expect(result.status).toBe(404);
    });

    it('delegates to ActionHandler and returns 200', async () => {
      const raw = {
        callback_id: 'cb-1',
        action: {
          action_id: 'btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' }),
        },
      };
      const result = await handleAction(raw, {
        idempotencyStore: new InMemoryIdempotencyStore(),
        actionHandler: new NoopActionHandler(),
      });
      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
    });

    it('is idempotent — same callback returns cached result', async () => {
      let callCount = 0;
      const handler: ActionHandler = {
        handleAction: async () => {
          callCount++;
          return { ok: true, note: `call-${callCount}` };
        },
      };

      const raw = {
        callback_id: 'cb-1',
        action: {
          action_id: 'btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' }),
        },
      };

      const deps = {
        idempotencyStore: new InMemoryIdempotencyStore(),
        actionHandler: handler,
      };

      const r1 = await handleAction(raw, deps);
      expect(r1.status).toBe(200);
      expect(callCount).toBe(1);

      const r2 = await handleAction(raw, deps);
      expect(r2.status).toBe(200);
      // Handler should NOT have been called again — idempotent
      expect(callCount).toBe(1);
      // Same cached result
      expect((r2.body as ActionResult).note).toBe('call-1');
    });

    it('different idempotency keys dispatch separately', async () => {
      let callCount = 0;
      const handler: ActionHandler = {
        handleAction: async () => {
          callCount++;
          return { ok: true };
        },
      };

      const deps = {
        idempotencyStore: new InMemoryIdempotencyStore(),
        actionHandler: handler,
      };

      await handleAction({
        callback_id: 'cb-1',
        action: {
          action_id: 'btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-1' }),
        },
      }, deps);

      await handleAction({
        callback_id: 'cb-1',
        action: {
          action_id: 'btn',
          value: JSON.stringify({ notificationId: 'n-1', action: 'approve', idempotencyKey: 'k-2' }),
        },
      }, deps);

      expect(callCount).toBe(2);
    });
  });
});
