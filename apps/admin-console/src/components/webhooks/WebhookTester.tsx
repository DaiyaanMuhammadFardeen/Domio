/**
 * WebhookTester — Wave 10 §S10.2.
 *
 * Two-column layout:
 *   - Left: pick a subscription, edit a payload, button to load a
 *     per-event sample, send button.
 *   - Right: ResponseViewer showing status, latency, headers, body.
 *
 * Sends via testWebhook(id, payload).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { EventTypePicker } from './EventTypePicker';
import { ResponseViewer } from './ResponseViewer';
import type { WebhookSubscription, WebhookTestResult } from '../../lib/webhook-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

const SAMPLE_PAYLOADS: Readonly<Record<string, string>> = {
  'deck.viewed': JSON.stringify(
    {
      event: 'deck.viewed',
      deck_id: 'deck_2qX1kRZ',
      viewer: { id: 'user_8a', email: 'ada@example.com' },
      locale: 'en-US',
      viewed_at_ms: 1700000000000,
    },
    null,
    2,
  ),
  'deck.shared': JSON.stringify(
    {
      event: 'deck.shared',
      deck_id: 'deck_2qX1kRZ',
      share_id: 'shr_01HXY',
      permission: 'view',
      expires_at_ms: 0,
    },
    null,
    2,
  ),
  'comment.added': JSON.stringify(
    {
      event: 'comment.added',
      deck_id: 'deck_2qX1kRZ',
      slide_id: 'slide_7',
      comment_id: 'cmt_42',
      author: { id: 'user_9', email: 'grace@example.com' },
      body: 'Looks great — note the typo on slide 7.',
    },
    null,
    2,
  ),
  'approval.granted': JSON.stringify(
    {
      event: 'approval.granted',
      deck_id: 'deck_2qX1kRZ',
      approver: { id: 'user_1', email: 'pc@example.com' },
      comment: 'Approved for external release.',
    },
    null,
    2,
  ),
  'data.updated': JSON.stringify(
    {
      event: 'data.updated',
      dataset_id: 'ds_q3_acme',
      rows_changed: 142,
      updated_at_ms: 1700000000000,
    },
    null,
    2,
  ),
  'share.created': JSON.stringify(
    {
      event: 'share.created',
      share_id: 'shr_01HXY',
      deck_id: 'deck_2qX1kRZ',
      permission: 'edit',
      created_at_ms: 1700000000000,
    },
    null,
    2,
  ),
  'share.expired': JSON.stringify(
    {
      event: 'share.expired',
      share_id: 'shr_01HXY',
      deck_id: 'deck_2qX1kRZ',
      expired_at_ms: 1700000000000,
    },
    null,
    2,
  ),
};

const DEFAULT_SAMPLE = JSON.stringify({ event: 'custom.event', data: { hello: 'world' } }, null, 2);

interface WebhookTesterProps {
  readonly subscriptions: ReadonlyArray<WebhookSubscription>;
  readonly onTested?: (result: WebhookTestResult) => void;
}

export function WebhookTester({ subscriptions, onTested }: WebhookTesterProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [event, setEvent] = useState<string>('deck.viewed');
  const [payloadText, setPayloadText] = useState<string>(
    SAMPLE_PAYLOADS['deck.viewed'] ?? DEFAULT_SAMPLE,
  );
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  // Pre-select the first subscription once they load.
  useEffect(() => {
    if (!selectedId && subscriptions.length > 0) {
      const first = subscriptions[0];
      if (first) setSelectedId(first.id);
    }
  }, [subscriptions, selectedId]);

  const selected = useMemo<WebhookSubscription | undefined>(
    () => subscriptions.find((s) => s.id === selectedId),
    [subscriptions, selectedId],
  );

  function loadSample() {
    const sample = SAMPLE_PAYLOADS[event] ?? DEFAULT_SAMPLE;
    setPayloadText(sample);
  }

  async function handleSend() {
    if (!selectedId) {
      setError('Pick a subscription first');
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      setError('Payload is not valid JSON');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const { testWebhook } = await import('../../lib/webhook-service');
      const res = await testWebhook(selectedId, parsed);
      setResult(res);
      onTested?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test');
    } finally {
      setSending(false);
    }
  }

  return (
    <div data-testid="webhooks-tester" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          <FormattedMessage id="admin.webhooks.tester.heading" catalogue={CATALOGUE} />
        </h3>

        {error && (
          <div
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            <FormattedMessage id="admin.webhooks.tester.subscription" catalogue={CATALOGUE} />
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            data-testid="webhooks-tester-subscription"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {subscriptions.length === 0 && <option value="">— no subscriptions yet —</option>}
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.event} · {s.url}
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-mono">{selected.url}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-slate-400">retry</span>
              <span className="font-mono">{selected.retry_policy}</span>
              <span className="ml-auto text-slate-400">secret …{selected.secret_last4}</span>
            </div>
          </div>
        )}

        <EventTypePicker
          value={event}
          onChange={setEvent}
          label={CATALOGUE['admin.webhooks.subscribe.event'] ?? 'Event'}
          testid="webhooks-tester-event"
        />

        <div>
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              <FormattedMessage id="admin.webhooks.tester.payload" catalogue={CATALOGUE} />
            </span>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              spellCheck={false}
              rows={12}
              data-testid="webhooks-tester-payload"
              className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={loadSample}
              data-testid="webhooks-tester-use-sample"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <FormattedMessage id="admin.webhooks.tester.useSample" catalogue={CATALOGUE} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || subscriptions.length === 0}
            data-testid="webhooks-tester-send"
            className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? (
              '…'
            ) : (
              <FormattedMessage id="admin.webhooks.tester.send" catalogue={CATALOGUE} />
            )}
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
          <FormattedMessage id="admin.webhooks.tester.result" catalogue={CATALOGUE} />
        </h3>
        <ResponseViewer result={result} />
      </div>
    </div>
  );
}
