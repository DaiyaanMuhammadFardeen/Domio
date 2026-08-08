/**
 * Notification dispatcher — multi-channel router.
 *
 * Each channel implementation is a small adapter that knows how to
 * turn a Notification into the provider-specific wire format and
 * post it. The router selects an implementation by channel name
 * and returns a SendResult that captures whether the send
 * succeeded.
 *
 * In-app delivery is routed via NATS subject
 * `notifications.app.{userID}` so the realtime gateway (which is
 * already subscribed to NATS subjects per user) can fan it out
 * without an extra hop.
 */

import type { ChannelKind, Notification } from '../types.js';

export interface SendResult {
  ok: boolean;
  error?: string;
  /** Provider-side message id, when available. */
  providerMessageId?: string;
}

export interface ChannelSender {
  readonly channel: ChannelKind;
  send(notification: Notification): Promise<SendResult>;
}

/** Outbound payload signer — inject for HMAC signing. */
export interface OutboundSigner {
  sign(body: string): string;
}

/** SlackSender POSTs a chat.postMessage-style payload to a webhook URL. */
export class SlackSender implements ChannelSender {
  readonly channel = 'slack' as const;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly defaultTimeoutMs = 5000,
    private readonly signer?: OutboundSigner | undefined,
  ) {}

  async send(n: Notification): Promise<SendResult> {
    const url = n.recipient;
    if (!url) {
      return { ok: false, error: 'slack: empty webhook URL' };
    }
    const body = {
      text: `*${n.payload.title}*\n${n.payload.body}`,
      ...(n.payload.link ? { attachments: [{ title_link: n.payload.link }] } : {}),
    };
    return this.postJSON(url, body);
  }

  protected postJSON(url: string, body: unknown): Promise<SendResult> {
    return this.doFetch(url, body);
  }

  private async doFetch(url: string, body: unknown): Promise<SendResult> {
    const bodyStr = JSON.stringify(body);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.signer) {
      headers['X-Domio-Signature'] = this.signer.sign(bodyStr);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.defaultTimeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: ctl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `slack: status=${res.status} body=${text.slice(0, 256)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errToString(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** TeamsSender POSTs a MessageCard to the Teams incoming webhook URL. */
export class TeamsSender implements ChannelSender {
  readonly channel = 'teams' as const;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly signer?: OutboundSigner | undefined,
  ) {}

  async send(n: Notification): Promise<SendResult> {
    const url = n.recipient;
    if (!url) return { ok: false, error: 'teams: empty webhook URL' };
    const body = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: n.payload.title,
      themeColor: '0076D7',
      title: n.payload.title,
      text: n.payload.body,
      ...(n.payload.link ? { potentialAction: [{ '@type': 'OpenUri', name: 'Open', targets: [{ os: 'default', uri: n.payload.link }] }] } : {}),
    };
    const bodyStr = JSON.stringify(body);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.signer) {
      headers['X-Domio-Signature'] = this.signer.sign(bodyStr);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: ctl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `teams: status=${res.status} body=${text.slice(0, 256)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errToString(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * EmailSender is a stub for v1. Production wires SMTP via nodemailer;
 * the test harness uses an in-memory transport that captures messages.
 */
export interface EmailTransport {
  send(opts: { to: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string }>;
}

export class EmailSender implements ChannelSender {
  readonly channel = 'email' as const;
  constructor(private readonly transport: EmailTransport) {}

  async send(n: Notification): Promise<SendResult> {
    if (!n.recipient) return { ok: false, error: 'email: empty recipient' };
    const r = await this.transport.send({
      to: n.recipient,
      subject: n.payload.title,
      body: n.payload.body,
    });
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'email: unknown error' };
  }
}

/** InAppSender publishes to NATS subject notifications.app.{userID}. */
export interface NatsPublisher {
  publish(subject: string, payload: Uint8Array): Promise<void>;
}

export class InAppSender implements ChannelSender {
  readonly channel = 'in_app' as const;
  constructor(private readonly nats: NatsPublisher) {}

  async send(n: Notification): Promise<SendResult> {
    if (!n.recipient) return { ok: false, error: 'in_app: empty userID' };
    const subject = `notifications.app.${n.recipient}`;
    const body = JSON.stringify({
      rule_id: n.rule_id,
      workspace_id: n.workspace_id,
      viewer_id_key: n.viewer_id_key,
      title: n.payload.title,
      body: n.payload.body,
      link: n.payload.link,
      ts_ms: Date.now(),
    });
    try {
      await this.nats.publish(subject, new TextEncoder().encode(body));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errToString(err) };
    }
  }
}

/** WebhookSender is a generic JSON POST — used for "anything goes" channels. */
export class WebhookSender implements ChannelSender {
  readonly channel = 'webhook' as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(n: Notification): Promise<SendResult> {
    if (!n.recipient) return { ok: false, error: 'webhook: empty URL' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await this.fetchImpl(n.recipient, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rule_id: n.rule_id,
          workspace_id: n.workspace_id,
          viewer_id_key: n.viewer_id_key,
          title: n.payload.title,
          body: n.payload.body,
          link: n.payload.link,
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `webhook: status=${res.status} body=${text.slice(0, 256)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errToString(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Router selects the right sender for a channel. */
export class Router {
  private readonly senders = new Map<ChannelKind, ChannelSender>();

  constructor(senders: ChannelSender[]) {
    for (const s of senders) {
      this.senders.set(s.channel, s);
    }
  }

  /** Send dispatches to the registered sender for the notification's channel. */
  async send(n: Notification): Promise<SendResult> {
    const s = this.senders.get(n.channel);
    if (!s) {
      return { ok: false, error: `router: no sender for channel "${n.channel}"` };
    }
    return s.send(n);
  }
}

function errToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
