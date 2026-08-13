/**
 * LoginForm — client form for `/login`.
 *
 * Wave 12 S12.3. Validates inputs via the helpers in
 * `lib/auth-validation`. The form supports either email/password or
 * SSO. We do not submit the password anywhere from the marketing
 * landing app — the click handler merely surfaces a status.
 */

'use client';

import { useId, useState, type FormEvent, type JSX } from 'react';
import {
  validateLogin,
  type LoginRequest,
  type SsoProvider,
  type ValidationResult,
} from '../../lib/auth-validation';
import SSOButtons from '../../components/auth/SSOButtons';

interface FormState {
  readonly email: string;
  readonly password: string;
}

const INITIAL_STATE: FormState = {
  email: '',
  password: '',
};

export function LoginForm(): JSX.Element {
  const emailId = useId();
  const passwordId = useId();

  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload: Partial<LoginRequest> = {
      email: state.email,
      password: state.password,
    };
    const result: ValidationResult = validateLogin(payload);
    setErrors(result.errors);
    if (!result.ok) {
      setStatus('Please fix the errors below and try again.');
      return;
    }

    setSubmitting(true);
    setStatus('Signing you in…');
    await new Promise((resolve) => setTimeout(resolve, 50));
    setSubmitting(false);
    setStatus('Signed in. Redirecting…');
  };

  const handleSso = (provider: SsoProvider): void => {
    setStatus(`Continuing with ${provider}…`);
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
          data-testid="login-email"
          value={state.email}
          onChange={(e) => update('email', e.target.value)}
          aria-invalid={errors['email'] !== undefined}
          aria-describedby={errors['email'] !== undefined ? `${emailId}-err` : undefined}
        />
        {errors['email'] !== undefined ? (
          <p id={`${emailId}-err`} className="auth-form__error">
            {errors['email']}
          </p>
        ) : null}
      </div>

      <div className="auth-form__row">
        <label className="auth-form__label" htmlFor={passwordId}>
          Password
        </label>
        <input
          id={passwordId}
          type="password"
          className="auth-form__input"
          autoComplete="current-password"
          required
          data-testid="login-password"
          value={state.password}
          onChange={(e) => update('password', e.target.value)}
          aria-invalid={errors['password'] !== undefined}
          aria-describedby={
            errors['password'] !== undefined ? `${passwordId}-err` : undefined
          }
        />
        {errors['password'] !== undefined ? (
          <p id={`${passwordId}-err`} className="auth-form__error">
            {errors['password']}
          </p>
        ) : null}
      </div>

      {errors['auth'] !== undefined ? (
        <p className="auth-form__error" role="alert">
          {errors['auth']}
        </p>
      ) : null}

      <button
        type="submit"
        className="auth-form__submit"
        data-testid="login-submit"
        disabled={submitting}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      {status !== null ? (
        <p className="auth-form__status" role="status">
          {status}
        </p>
      ) : null}

      <SSOButtons onSelect={handleSso} disabled={submitting} />
    </form>
  );
}

export default LoginForm;