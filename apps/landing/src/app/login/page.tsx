/**
 * Login page — `/login`.
 *
 * Wave 12 S12.3. Server component that wraps the client LoginForm
 * in the shared AuthShell. Cross-links use the `landing()` builder.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import AuthShell from '../../components/auth/AuthShell';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in to Domio',
  description:
    'Sign in to Domio with email and password, or continue with Google, GitHub, or Microsoft.',
};

export default function LoginPage(): JSX.Element {
  const signupHref = landing('signup');
  const forgotHref = landing('forgot-password');

  return (
    <AuthShell
      heading="Sign in to Domio"
      subtitle="Welcome back. Pick up where you left off."
      footer={
        <nav className="auth-shell__footer" aria-label="Auth cross-links">
          <p className="auth-shell__footer-text">
            New here? <a href={signupHref}>Create an account</a>
          </p>
          <p className="auth-shell__footer-text">
            <a href={forgotHref}>Forgot your password?</a>
          </p>
        </nav>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}