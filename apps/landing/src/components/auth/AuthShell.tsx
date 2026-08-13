/**
 * AuthShell — shared wrapper for the auth flows (signup, login,
 * forgot-password). Provides a centered card layout, a heading,
 * an optional subtitle, and a footer slot for cross-links
 * (e.g. "Already have an account? Sign in").
 *
 * The shell is a presentational server component. The interactive
 * form bits live in client components that compose this shell.
 */

import type { JSX, ReactNode } from 'react';
import { landing } from '@domio/ui';

export interface AuthShellProps {
  readonly heading: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

const DEFAULT_FOOTER: ReadonlyArray<{ readonly href: string; readonly label: string }> = [
  { href: landing('signup'), label: 'Create account' },
  { href: landing('login'), label: 'Sign in' },
  { href: landing('forgot-password'), label: 'Forgot password' },
];

export function AuthShell({
  heading,
  subtitle,
  children,
  footer,
}: AuthShellProps): JSX.Element {
  return (
    <main className="auth-shell" data-testid="auth-shell">
      <section className="auth-shell__card" aria-labelledby="auth-shell-heading">
        <h1 id="auth-shell-heading" className="auth-shell__heading">
          {heading}
        </h1>
        {subtitle !== undefined ? (
          <p className="auth-shell__subtitle">{subtitle}</p>
        ) : null}
        <div className="auth-shell__body">{children}</div>
        {footer !== undefined ? (
          <div className="auth-shell__footer">{footer}</div>
        ) : (
          <nav className="auth-shell__footer" aria-label="Auth cross-links">
            <ul className="auth-shell__links">
              {DEFAULT_FOOTER.map((link) => (
                <li key={link.href}>
                  <a className="auth-shell__link" href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </section>
    </main>
  );
}

export default AuthShell;