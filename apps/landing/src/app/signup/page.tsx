/**
 * Signup page — `/signup`.
 *
 * Wave 12 S12.3. The page is a server component that renders the
 * AuthShell wrapper and the client-side SignupForm. Cross-links are
 * generated via the `landing()` builder so the URL contract stays
 * in `packages/ui`.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import AuthShell from '../../components/auth/AuthShell';
import SignupForm from './SignupForm';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Create your Domio account',
  description:
    'Sign up for Domio. Pick a plan, create an account with email and password, or continue with Google, GitHub, or Microsoft.',
};

export default function SignupPage(): JSX.Element {
  const loginHref = landing('login');
  const forgotHref = landing('forgot-password');

  return (
    <PageShell currentId="signup" relatedTitle="Get started">
      <AuthShell
        heading="Create your Domio account"
        subtitle="Build reactive decks, share live sessions, and ship faster."
        footer={
          <nav className="auth-shell__footer" aria-label="Auth cross-links">
            <p className="auth-shell__footer-text">
              Already have an account? <a href={loginHref}>Sign in</a>
            </p>
            <p className="auth-shell__footer-text">
              <a href={forgotHref}>Forgot your password?</a>
            </p>
          </nav>
        }
      >
        <SignupForm />
      </AuthShell>
    </PageShell>
  );
}