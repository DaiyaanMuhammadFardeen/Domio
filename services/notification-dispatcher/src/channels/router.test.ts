import { describe, it, expect, vi } from 'vitest';
import {
  Router,
  SlackSender,
  TeamsSender,
  EmailSender,
  InAppSender,
  WebhookSender,
  type EmailTransport,
  type NatsPublisher,
} from './router.js';
import type { Notification } from '../types.js';

function notif(overrides: Partial<Notification> = {}): Notification {
  return {
    rule_id: 'r-1',
    workspace_id: 'w-1',
    viewer_id_key: 'v-1',
    channel: 'slack',
    recipient: 'https://hooks.slack/test',
    payload: { title: 'T', body: 'B' },
    ...overrides,
  };
}

describe('channels/router', () => {
  it('SlackSender POSTs JSON', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('ok', { status: 200 });
    };
    const sender = new SlackSender(fakeFetch);
    const r = await sender.send(notif({ recipient: 'https://hooks.slack/test' }));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://hooks.slack/test');
    expect((calls[0]?.body as { text: string }).text).toContain('T');
  });

  it('SlackSender surfaces errors', async () => {
    const fakeFetch: typeof fetch = async () => new Response('blocked', { status: 403 });
    const sender = new SlackSender(fakeFetch);
    const r = await sender.send(notif({ recipient: 'https://hooks.slack/test' }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('403');
  });

  it('TeamsSender POSTs MessageCard', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('ok', { status: 200 });
    };
    const sender = new TeamsSender(fakeFetch);
    const r = await sender.send(notif({ channel: 'teams', recipient: 'https://teams.webhook' }));
    expect(r.ok).toBe(true);
    expect((calls[0]?.body as { '@type': string })['@type']).toBe('MessageCard');
  });

  it('EmailSender delegates to transport', async () => {
    const sent: Array<{ to: string; subject: string; body: string }> = [];
    const transport: EmailTransport = {
      send: async (opts) => {
        sent.push(opts);
        return { ok: true };
      },
    };
    const sender = new EmailSender(transport);
    const r = await sender.send(notif({ channel: 'email', recipient: 'a@b.com' }));
    expect(r.ok).toBe(true);
    expect(sent[0]?.to).toBe('a@b.com');
    expect(sent[0]?.subject).toBe('T');
  });

  it('InAppSender publishes to notifications.app.{userID}', async () => {
    const published: Array<{ subject: string; payload: string }> = [];
    const nats: NatsPublisher = {
      publish: async (subject, payload) => {
        published.push({ subject, payload: new TextDecoder().decode(payload) });
      },
    };
    const sender = new InAppSender(nats);
    const r = await sender.send(notif({ channel: 'in_app', recipient: 'u-42' }));
    expect(r.ok).toBe(true);
    expect(published[0]?.subject).toBe('notifications.app.u-42');
    expect(JSON.parse(published[0]?.payload ?? '{}').rule_id).toBe('r-1');
  });

  it('InAppSender requires userID', async () => {
    const nats: NatsPublisher = { publish: async () => {} };
    const sender = new InAppSender(nats);
    const r = await sender.send(notif({ channel: 'in_app', recipient: '' }));
    expect(r.ok).toBe(false);
  });

  it('WebhookSender generic POST', async () => {
    const fakeFetch: typeof fetch = async () => new Response(null, { status: 204 });
    const sender = new WebhookSender(fakeFetch);
    const r = await sender.send(notif({ channel: 'webhook', recipient: 'https://x' }));
    expect(r.ok).toBe(true);
  });

  it('Router selects by channel', async () => {
    const slackCalls = vi.fn(async () => new Response('ok', { status: 200 }));
    const slackSender = new SlackSender(slackCalls as unknown as typeof fetch);
    const emailTransport: EmailTransport = { send: async () => ({ ok: true }) };
    const router = new Router([slackSender, new EmailSender(emailTransport)]);
    const r1 = await router.send(notif({ channel: 'slack', recipient: 'https://slack/x' }));
    const r2 = await router.send(notif({ channel: 'email', recipient: 'a@b.com' }));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(slackCalls).toHaveBeenCalledTimes(1);
  });

  it('Router returns error for unknown channel', async () => {
    const router = new Router([new SlackSender()]);
    const r = await router.send(notif({ channel: 'email', recipient: 'a@b.com' }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('email');
  });

  it('SlackSender handles network error', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('ECONNRESET');
    };
    const sender = new SlackSender(fakeFetch);
    const r = await sender.send(notif({ recipient: 'https://x' }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ECONNRESET');
  });

  it('SlackSender includes X-Domio-Signature when signer is provided', async () => {
    const headers: Record<string, string> = {};
    const fakeFetch: typeof fetch = async (_url, init) => {
      const h = init?.headers as Record<string, string>;
      Object.assign(headers, h);
      return new Response('ok', { status: 200 });
    };
    const signer = { sign: (body: string) => `hmac-${body.length}` };
    const sender = new SlackSender(fakeFetch, 5000, signer);
    await sender.send(notif({ recipient: 'https://hooks.slack/test' }));
    expect(headers['X-Domio-Signature']).toBeDefined();
    expect(headers['X-Domio-Signature']).toMatch(/^hmac-/);
  });

  it('TeamsSender includes X-Domio-Signature when signer is provided', async () => {
    const headers: Record<string, string> = {};
    const fakeFetch: typeof fetch = async (_url, init) => {
      const h = init?.headers as Record<string, string>;
      Object.assign(headers, h);
      return new Response('ok', { status: 200 });
    };
    const signer = { sign: (body: string) => `teams-sig-${body.length}` };
    const sender = new TeamsSender(fakeFetch, signer);
    await sender.send(notif({ channel: 'teams', recipient: 'https://teams.webhook' }));
    expect(headers['X-Domio-Signature']).toBeDefined();
    expect(headers['X-Domio-Signature']).toMatch(/^teams-sig-/);
  });

  it('SlackSender omits signature header when no signer', async () => {
    const headers: Record<string, string> = {};
    const fakeFetch: typeof fetch = async (_url, init) => {
      const h = init?.headers as Record<string, string>;
      Object.assign(headers, h);
      return new Response('ok', { status: 200 });
    };
    const sender = new SlackSender(fakeFetch);
    await sender.send(notif({ recipient: 'https://hooks.slack/test' }));
    expect(headers['X-Domio-Signature']).toBeUndefined();
  });
});
