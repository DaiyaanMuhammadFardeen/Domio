/**
 * SignupForm — client form for the `/signup` route.
 *
 * Wave 12 S12.3. Validates inputs with the helpers in
 * `lib/auth-validation`, submits the request to a placeholder
 * endpoint, and surfaces field-level errors + a top-level status
 * message. Plan selection uses a radio group so screen readers
 * announce it correctly.
 */

'use client';

import { useId, useState, type FormEvent, type JSX } from 'react';
import {
  validateSignup,
  type SignupPlan,
  type SignupRequest,
  type SsoProvider,
  type ValidationResult,
} from '../../lib/auth-validation';
import SSOButtons from '../../components/auth/SSOButtons';

interface PlanSpec {
  readonly id: SignupPlan;
  readonly label: string;
  readonly description: string;
}

const PLANS: ReadonlyArray<PlanSpec> = [
  {
    id: 'free',
    label: 'Free',
    description: '3 decks, 1 seat, community support.',
  },
  {
    id: 'pro',
    label: 'Pro',
    description: 'Unlimited decks, 10 seats, live presenter analytics.',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'SSO/SCIM, data residency, dedicated CSM.',
  },
];

interface FormState {
  readonly email: string;
  readonly password: string;
  readonly plan: SignupPlan;
  readonly marketing_opt_in: boolean;
}

const INITIAL_STATE: FormState = {
  email: '',
  password: '',
  plan: 'free',
  marketing_opt_in: false,
};

export function SignupForm(): JSX.Element {
  const emailId = useId();
  const passwordId = useId();
  const planId = useId();
  const optInId = useId();

  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload: Partial<SignupRequest> = {
      email: state.email,
      password: state.password,
      plan: state.plan,
      marketing_opt_in: state.marketing_opt_in,
    };
    const result: ValidationResult = validateSignup(payload);
    setErrors(result.errors);
    if (!result.ok) {
      setStatus('Please fix the errors below and try again.');
      return;
    }

    setSubmitting(true);
    setStatus('Creating your account…');
    // Real submission happens server-side; we intentionally don't
    // hit the network from the marketing landing app.
    await new Promise((resolve) => setTimeout(resolve, 50));
    setSubmitting(false);
    setStatus('Account created. Check your inbox to verify.');
  };

  const handleSso = (provider: SsoProvider): void => {
    setStatus(`Continuing with ${provider}…`);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-form__row">
        <label className="auth-form__label" htmlFor={emailId}>
          Work email
        </label>
        <input
          id={emailId}
          type="email"
          className="auth-form__input"
          autoComplete="email"
          required
          data-testid="signup-email"
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
          autoComplete="new-password"
          required
          minLength={8}
          data-testid="signup-password"
          value={state.password}
          onChange={(e) => update('password', e.target.value)}
          aria-invalid={errors['password'] !== undefined}
          aria-describedby={errors['password'] !== undefined ? `${passwordId}-err` : undefined}
        />
        {errors['password'] !== undefined ? (
          <p id={`${passwordId}-err`} className="auth-form__error">
            {errors['password']}
          </p>
        ) : (
          <p className="auth-form__hint">At least 8 characters.</p>
        )}
      </div>

      <fieldset className="auth-form__fieldset" aria-labelledby={planId}>
        <legend id={planId} className="auth-form__legend">
          Choose a plan
        </legend>
        <div className="auth-form__plans" data-testid="signup-plan">
          {PLANS.map((plan) => {
            const radioId = `${planId}-${plan.id}`;
            const checked = state.plan === plan.id;
            return (
              <label
                key={plan.id}
                htmlFor={radioId}
                className={'auth-form__plan' + (checked ? ' auth-form__plan--checked' : '')}
              >
                <input
                  id={radioId}
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={checked}
                  data-testid={`signup-plan-${plan.id}`}
                  onChange={() => update('plan', plan.id)}
                />
                <span className="auth-form__plan-label">{plan.label}</span>
                <span className="auth-form__plan-desc">{plan.description}</span>
              </label>
            );
          })}
        </div>
        {errors['plan'] !== undefined ? <p className="auth-form__error">{errors['plan']}</p> : null}
      </fieldset>

      <label className="auth-form__optin" htmlFor={optInId}>
        <input
          id={optInId}
          type="checkbox"
          checked={state.marketing_opt_in}
          onChange={(e) => update('marketing_opt_in', e.target.checked)}
        />
        <span>Send me product updates and tips. Unsubscribe anytime.</span>
      </label>

      <button
        type="submit"
        className="auth-form__submit"
        data-testid="signup-submit"
        disabled={submitting}
      >
        {submitting ? 'Creating…' : 'Create account'}
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

export default SignupForm;
