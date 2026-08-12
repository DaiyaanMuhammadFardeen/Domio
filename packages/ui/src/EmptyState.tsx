'use client';

/**
 * EmptyState — single primitive for "nothing here, here's what to do".
 *
 * Per Wave 1 §S1.5 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Usage:
 *   <EmptyState
 *     title="No decks yet"
 *     description="Create your first deck to get started."
 *     action={{ label: 'New deck', onClick: () => ... }}
 *   />
 *
 * Renders a centered card with an icon, title, description, and an optional
 * action button. Replaces every "Coming soon", "—" placeholder.
 */

import {
  type CSSProperties,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    href?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  };
  variant?: 'card' | 'plain';
  style?: CSSProperties;
}

export function EmptyState(props: EmptyStateProps): ReactElement {
  const { title, description, icon, action, secondaryAction, variant = 'card', style } = props;

  const isCard = variant === 'card';

  const wrapperStyle: CSSProperties = isCard
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-12) var(--space-6)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-1)',
        gap: 'var(--space-4)',
        ...style,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: 'var(--space-8) var(--space-4)',
        gap: 'var(--space-3)',
        ...style,
      };

  const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: 'var(--font-heading-size)',
    lineHeight: 'var(--font-heading-line)',
    fontWeight: 'var(--font-heading-weight)' as unknown as number,
    color: 'var(--content-primary)',
  };

  const descStyle: CSSProperties = {
    margin: 0,
    color: 'var(--content-muted)',
    maxWidth: '40ch',
  };

  const actionsStyle: CSSProperties = {
    display: 'flex',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-2)',
    flexWrap: 'wrap',
    justifyContent: 'center',
  };

  return (
    <div role="status" aria-live="polite" style={wrapperStyle}>
      {icon ? <div aria-hidden>{icon}</div> : null}
      <h2 style={titleStyle}>{title}</h2>
      {description ? <p style={descStyle}>{description}</p> : null}
      {(action || secondaryAction) && (
        <div style={actionsStyle}>
          {action ? <EmptyStateButton {...action} variant="primary" /> : null}
          {secondaryAction ? (
            <EmptyStateButton {...secondaryAction} variant="secondary" />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface ButtonProps {
  label: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant: 'primary' | 'secondary';
}

function EmptyStateButton(props: ButtonProps): ReactElement {
  const { label, href, onClick, variant } = props;
  const isPrimary = variant === 'primary';

  const buttonStyle: CSSProperties = {
    appearance: 'none',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2) var(--space-5)',
    fontSize: 'var(--font-caption-size)',
    fontWeight: 600,
    cursor: 'pointer',
    background: isPrimary ? 'var(--accent-1)' : 'var(--surface-2)',
    color: isPrimary ? 'var(--content-inverse)' : 'var(--content-primary)',
    border: isPrimary ? '1px solid transparent' : '1px solid var(--border-subtle)',
  };

  if (href) {
    return (
      <a href={href} style={buttonStyle}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={buttonStyle}>
      {label}
    </button>
  );
}