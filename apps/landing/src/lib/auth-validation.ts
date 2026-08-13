/**
 * Form validation helpers for the auth flows (signup, login,
 * forgot-password) used across the marketing landing app.
 *
 * Wave 12 S12.3 — the goal is to keep validators pure so they can be
 * exercised from server-side guards, client components, and unit tests
 * without pulling in any React or DOM dependencies.
 *
 * Conventions:
 * - All validators return `null` for valid input, or a human-readable
 *   error string otherwise. This shape composes well with React state
 *   and form-level error summaries.
 * - Passwords must be at least 8 characters. We intentionally keep the
 *   policy light here — a stronger ruleset lives server-side.
 * - Emails must contain an `@` with non-empty local and domain parts.
 *   We deliberately avoid a full RFC 5322 regex because real users
 *   have weird addresses; the server validates canonicalisation.
 */

export type SsoProvider = 'google' | 'github' | 'microsoft';

export type SignupPlan = 'free' | 'pro' | 'enterprise';

export interface SignupRequest {
  readonly email: string;
  readonly password: string;
  readonly plan: SignupPlan;
  readonly sso_provider?: SsoProvider;
  readonly marketing_opt_in: boolean;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly sso_provider?: SsoProvider;
}

export interface ForgotPasswordRequest {
  readonly email: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: Readonly<Record<string, string>>;
}

const MIN_PASSWORD_LENGTH = 8;

const SSO_PROVIDERS: ReadonlySet<SsoProvider> = new Set(['google', 'github', 'microsoft']);

const SIGNUP_PLANS: ReadonlySet<SignupPlan> = new Set(['free', 'pro', 'enterprise']);

/**
 * Trims surrounding whitespace and normalises a string for comparison.
 * Returns `null` if the trimmed value is empty.
 */
function normalise(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validates an email address. Returns an error message when invalid,
 * otherwise `null`.
 */
export function validateEmail(email: string): string | null {
  const value = normalise(email);
  if (value === null) return 'Email is required.';
  if (value.length > 254) return 'Email is too long.';
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) {
    return 'Email must contain a single "@" with a name before it.';
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length === 0 || domain.length === 0) {
    return 'Email must include both a local part and a domain.';
  }
  if (!domain.includes('.')) {
    return 'Email domain must include a dot.';
  }
  return null;
}

/**
 * Validates a password against the landing app policy.
 * Returns an error message when invalid, otherwise `null`.
 */
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length === 0) return 'Password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

function validateSsoProvider(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'SSO provider must be a string.';
  if (!SSO_PROVIDERS.has(value as SsoProvider)) {
    return 'Unsupported SSO provider.';
  }
  return null;
}

function validatePlan(value: unknown): string | null {
  if (typeof value !== 'string') return 'Plan is required.';
  if (!SIGNUP_PLANS.has(value as SignupPlan)) {
    return 'Plan must be one of: free, pro, enterprise.';
  }
  return null;
}

/**
 * Validates the full signup payload. Returns a `ValidationResult`
 * describing whether the input is OK and any field-level errors.
 *
 * Marketing opt-in defaults to false and accepts booleans only.
 */
export function validateSignup(input: Partial<SignupRequest>): ValidationResult {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(input.email ?? '');
  if (emailError !== null) errors['email'] = emailError;

  const passwordError = validatePassword(input.password ?? '');
  if (passwordError !== null) errors['password'] = passwordError;

  const planError = validatePlan(input.plan);
  if (planError !== null) errors['plan'] = planError;

  const ssoError = validateSsoProvider(input.sso_provider);
  if (ssoError !== null) errors['sso_provider'] = ssoError;

  if (input.marketing_opt_in !== undefined && typeof input.marketing_opt_in !== 'boolean') {
    errors['marketing_opt_in'] = 'Marketing opt-in must be true or false.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the login payload. Login requires an email and either a
 * password or an SSO provider — at least one of the two auth paths
 * must be present.
 */
export function validateLogin(input: Partial<LoginRequest>): ValidationResult {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(input.email ?? '');
  if (emailError !== null) errors['email'] = emailError;

  const passwordError = validatePassword(input.password ?? '');
  const ssoError = validateSsoProvider(input.sso_provider);
  const passwordPresent = typeof input.password === 'string' && input.password.length > 0;
  const ssoPresent = input.sso_provider !== undefined && input.sso_provider !== null;
  if (!passwordPresent && !ssoPresent) {
    errors['auth'] = 'Provide a password or sign in with SSO.';
  } else if (passwordError !== null && ssoError === null && !ssoPresent) {
    errors['password'] = passwordError;
  } else if (ssoError !== null && !passwordPresent) {
    errors['sso_provider'] = ssoError;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Validates a forgot-password payload. Only an email is required.
 */
export function validateForgotPassword(input: Partial<ForgotPasswordRequest>): ValidationResult {
  const errors: Record<string, string> = {};
  const emailError = validateEmail(input.email ?? '');
  if (emailError !== null) errors['email'] = emailError;
  return { ok: Object.keys(errors).length === 0, errors };
}
