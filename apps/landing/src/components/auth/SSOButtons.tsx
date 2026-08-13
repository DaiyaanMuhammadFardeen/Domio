/**
 * SSOButtons — Google / GitHub / Microsoft sign-in buttons.
 *
 * Renders three equal-weight buttons in a vertical stack. Each button
 * is a real `<button type="button">` so consumers can wire its
 * `onClick` handler to whichever OAuth redirect they prefer.
 *
 * The component is a client component so consumers can pass an
 * `onSelect` callback that triggers navigation. We deliberately keep
 * the component stateless — it never opens a popup or performs a
 * fetch itself.
 */

'use client';

import type { JSX } from 'react';
import type { SsoProvider } from '../../lib/auth-validation';

export interface SSOButtonsProps {
  readonly onSelect?: (provider: SsoProvider) => void;
  readonly disabled?: boolean;
  readonly label?: string;
}

interface ProviderSpec {
  readonly id: SsoProvider;
  readonly label: string;
  readonly glyph: string;
  readonly testId: string;
}

const PROVIDERS: ReadonlyArray<ProviderSpec> = [
  { id: 'google', label: 'Google', glyph: 'G', testId: 'sso-google' },
  { id: 'github', label: 'GitHub', glyph: 'GH', testId: 'sso-github' },
  { id: 'microsoft', label: 'Microsoft', glyph: 'M', testId: 'sso-microsoft' },
];

export function SSOButtons({
  onSelect,
  disabled = false,
  label = 'Or continue with',
}: SSOButtonsProps): JSX.Element {
  return (
    <div className="auth-sso" data-testid="sso-buttons">
      <p className="auth-sso__heading">{label}</p>
      <div className="auth-sso__row">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="auth-sso__button"
            data-testid={provider.testId}
            disabled={disabled}
            onClick={() => onSelect?.(provider.id)}
            aria-label={`Continue with ${provider.label}`}
          >
            <span className="auth-sso__glyph" aria-hidden="true">
              {provider.glyph}
            </span>
            <span className="auth-sso__label">{provider.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SSOButtons;