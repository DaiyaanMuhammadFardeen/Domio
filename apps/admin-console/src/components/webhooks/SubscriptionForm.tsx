/**
 * SubscriptionForm — Wave 10 §S10.2.
 *
 * Subscribe to a webhook event. Fields:
 *   - event      (EventTypePicker: common + freeform)
 *   - url        (text input)
 *   - secret     (text input with "Generate" button)
 *   - retry      (radio: none / exp1 / exp3)
 * Submits via createSubscription().
 */

'use client';

import { useState } from 'react';
import { FormattedMessage } from '@domio/ui';
import enMessages from '../../../messages/en.json';
import { EventTypePicker } from './EventTypePicker';
import type { WebhookSubscription, WebhookRetryPolicy } from '../../lib/webhook-service';

const CATALOGUE = enMessages as Readonly<Record<string, string>>;

const RETRY_OPTIONS: ReadonlyArray<{
  readonly value: WebhookRetryPolicy;
  readonly labelKey: string;
}> = [
  { value: 'none', labelKey: 'admin.webhooks.subscribe.retry.none' },
  { value: 'exp1', labelKey: 'admin.webhooks.subscribe.retry.exp1' },
  { value: 'exp3', labelKey: 'admin.webhooks.subscribe.retry.exp3' },
];

interface SubscriptionFormProps {
  readonly onCreated: (sub: WebhookSubscription) => void;
}

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return `whsec_${out}`;
}

export function SubscriptionForm({ onCreated }: SubscriptionFormProps) {
  const [event, setEvent] = useState<string>('deck.viewed');
  const [url, setUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [retry, setRetry] = useState<WebhookRetryPolicy>('exp3');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!event.trim()) {
      setError('Event is required');
      return;
    }
    if (!url.trim().toLowerCase().startsWith('https://')) {
      setError('URL must use HTTPS');
      return;
    }
    if (secret.length < 8) {
      setError('Secret must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { createSubscription } = await import('../../lib/webhook-service');
      const sub = await createSubscription({
        event: event.trim(),
        url: url.trim(),
        secret,
        retry_policy: retry,
      });
      setCreatedId(sub.id);
      onCreated(sub);
      setUrl('');
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="webhooks-subscribe-form"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        <FormattedMessage
          id="admin.webhooks.subscribe.heading"
          catalogue={CATALOGUE}
        />
      </h3>

      {error && (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {createdId && (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          data-testid="webhooks-subscribe-success"
        >
          Created subscription <span className="font-mono">{createdId}</span>.
        </div>
      )}

      <EventTypePicker
        value={event}
        onChange={setEvent}
        label={CATALOGUE['admin.webhooks.subscribe.event'] ?? 'Event'}
        testid="webhooks-subscribe-event"
      />

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          <FormattedMessage id="admin.webhooks.subscribe.url" catalogue={CATALOGUE} />
        </span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.example.com/domio"
          data-testid="webhooks-subscribe-url"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </label>

      <div>
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            <FormattedMessage id="admin.webhooks.subscribe.secret" catalogue={CATALOGUE} />
          </span>
          <div className="mt-1 flex items-stretch gap-2">
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_…"
              data-testid="webhooks-subscribe-secret"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={() => setSecret(generateSecret())}
              data-testid="webhooks-subscribe-secret-generate"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <FormattedMessage
                id="admin.webhooks.subscribe.secretGenerate"
                catalogue={CATALOGUE}
              />
            </button>
          </div>
        </label>
      </div>

      <fieldset>
        <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          <FormattedMessage id="admin.webhooks.subscribe.retry" catalogue={CATALOGUE} />
        </legend>
        <div
          className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"
          data-testid="webhooks-subscribe-retry"
        >
          {RETRY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <input
                type="radio"
                name="retry-policy"
                value={opt.value}
                checked={retry === opt.value}
                onChange={() => setRetry(opt.value)}
                data-testid={`webhooks-subscribe-retry-${opt.value}`}
                className="h-3.5 w-3.5 accent-brand-600"
              />
              <span>
                <FormattedMessage id={opt.labelKey} catalogue={CATALOGUE} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitting}
          data-testid="webhooks-subscribe-submit"
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? '…' : (
            <FormattedMessage id="admin.webhooks.subscribe.submit" catalogue={CATALOGUE} />
          )}
        </button>
      </div>
    </form>
  );
}