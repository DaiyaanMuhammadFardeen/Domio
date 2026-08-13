/**
 * Forgot-password page — `/forgot-password`.
 *
 * Wave 12 S12.3. Server component. Renders the shared AuthShell and
 * the client forgot-password form. Cross-links use the `landing()`
 * builder.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import AuthShell from '../../components/auth/AuthShell';
import ForgotForm from './ForgotForm';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Reset your Domio password',
  description: 'Enter the email you used to sign up and we will send a password reset link.',
};

export default function ForgotPasswordPage(): JSX.Element {
  const loginHref = landing('login');
  const signupHref = landing('signup');

  return (
    <PageShell currentId="forgot-password" relatedTitle="Get back in">
      <AuthShell
        heading="Reset your password"
        subtitle="Enter your email and we will send a reset link."
        footer={
          <nav className="auth-shell__footer" aria-label="Auth cross-links">
            <p className="auth-shell__footer-text">
              Remembered it? <a href={loginHref}>Back to sign in</a>
            </p>
            <p className="auth-shell__footer-text">
              No account yet? <a href={signupHref}>Create one</a>
            </p>
          </nav>
        }
      >
        <ForgotForm />
      </AuthShell>
    </PageShell>
  );
}
