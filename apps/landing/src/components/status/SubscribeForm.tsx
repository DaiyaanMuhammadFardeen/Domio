/**
 * Subscribe-to-updates form.
 *
 * Client component because we read + write `localStorage` and
 * need to react to user input. Stores the submitted email under
 * `domio:status:subscribe-email` so the form can show a "you're
 * subscribed" state on reload — this is a marketing demo, not a
 * production subscription pipeline.
 */

'use client';

import { useEffect, useState, type FormEvent, type JSX } from 'react';

const STORAGE_KEY = 'domio:status:subscribe-email';

function isValidEmail(value: string): boolean {
  // Intentionally permissive — this is a marketing demo.
  return /.+@.+\..+/.test(value);
}

export interface SubscribeFormProps {
  readonly heading?: string;
  readonly description?: string;
}

export function SubscribeForm({
  heading = 'Subscribe to status updates',
  description = 'Get an email when an incident is opened or resolved for any Domio service.',
}: SubscribeFormProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) setSavedEmail(existing);
  }, []);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    }
    setSavedEmail(trimmed);
    setEmail('');
  };

  const onUnsubscribe = (): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSavedEmail(null);
  };

  return (
    <section className="status-subscribe" aria-labelledby="status-subscribe-heading">
      <h2 id="status-subscribe-heading">{heading}</h2>
      <p className="status-subscribe__desc">{description}</p>

      {savedEmail ? (
        <div className="status-subscribe__success" data-testid="status-subscribe-success">
          <p>
            Subscribed as <strong>{savedEmail}</strong>. You&rsquo;ll get an email when incidents
            open or resolve.
          </p>
          <button type="button" className="status-subscribe__link" onClick={onUnsubscribe}>
            Unsubscribe
          </button>
        </div>
      ) : (
        <form className="status-subscribe__form" onSubmit={onSubmit}>
          <label htmlFor="status-subscribe-email" className="visually-hidden">
            Email address
          </label>
          <input
            id="status-subscribe-email"
            type="email"
            className="status-subscribe__input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="status-subscribe-input"
            required
          />
          <button
            type="submit"
            className="status-subscribe__button"
            data-testid="status-subscribe-submit"
          >
            Subscribe
          </button>
        </form>
      )}
    </section>
  );
}

export default SubscribeForm;
