/**
 * ForgotForm — client form for `/forgot-password`.
 *
 * Wave 12 S12.3. Collects an email, validates it with
 * `validateForgotPassword`, and surfaces a confirmation message.
 * No network call is performed from the marketing landing app — the
 * form just shows what would happen.
 */

'use client';

import { useId, useState, type FormEvent, type JSX } from 'react';
import {
  validateForgotPassword,
  type ForgotPasswordRequest,
  type ValidationResult,
} from '../../lib/auth-validation';

interface FormState {
  readonly email: string;
}

const INITIAL_STATE: FormState = { email: '' };

export function ForgotForm(): JSX.Element {
  const emailId = useId();
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload: Partial<ForgotPasswordRequest> = { email: state.email };
    const result: ValidationResult = validateForgotPassword(payload);
    setErrors(result.errors);
    if (!result.ok) {
      setStatus('Please fix the errors below and try again.');
      return;
    }

    setSubmitting(true);
    setStatus('Sending reset link…');
    await new Promise((resolve) => setTimeout(resolve, 50));
    setSubmitting(false);
    setStatus(`If an account exists for ${state.email}, a reset link is on its way.`);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-form__row">
        <label className="auth-form__label" htmlFor={emailId}>
          Email
        </label>
        <input
          id={emailId}
          type="email"
          className="auth-form__input"
          autoComplete="email"
          required
          data-testid="forgot-email"
          value={state.email}
          onChange={(e) => setState({ email: e.target.value })}
          aria-invalid={errors['email'] !== undefined}
          aria-describedby={errors['email'] !== undefined ? `${emailId}-err` : undefined}
        />
        {errors['email'] !== undefined ? (
          <p id={`${emailId}-err`} className="auth-form__error">
            {errors['email']}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="auth-form__submit"
        data-testid="forgot-submit"
        disabled={submitting}
      >
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>

      {status !== null ? (
        <p className="auth-form__status" role="status">
          {status}
        </p>
      ) : null}
    </form>
  );
}

export default ForgotForm;
