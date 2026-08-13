/**
 * Share-dialog tests — S3.3.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Test catalogue: load the bundled English messages so FormattedMessage
// can resolve IDs to strings.
const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

// React context providing the catalogue to our mocked FormattedMessage.
// vi.mock factories are hoisted; we reference the context via a lazy
// Proxy that resolves to the real module-level binding when the mock
// is consumed.
const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('@domio/ui')>('@domio/ui');
  // Re-import React for the mock so we can use useContext safely.
  const React = await import('react');
  return {
    ...actual,
    FormattedMessage: function MockFormattedMessage(props: {
      id: string;
      values?: Readonly<Record<string, string | number>>;
      as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'label';
      style?: React.CSSProperties;
      className?: string;
    }): React.ReactElement {
      const catalogue = React.useContext(FormattedMessageContext);
      let resolved = catalogue[props.id] ?? props.id;
      if (props.values) {
        for (const [k, v] of Object.entries(props.values)) {
          resolved = resolved.replaceAll(`{${k}}`, String(v));
        }
      }
      return (
        <span className={props.className} style={props.style} data-testid={`i18n-${props.id}`}>
          {resolved}
        </span>
      );
    },
  };
});

function withLocale(node: React.ReactElement): React.ReactElement {
  return (
    <FormattedMessageContext.Provider value={enMessages}>{node}</FormattedMessageContext.Provider>
  );
}

import { ShareDialog, type ShareDialogState } from './ShareDialog';
import { VisibilityPicker } from './VisibilityPicker';
import { DomainAllowlist } from './DomainAllowlist';
import { SSOConfig } from './SSOConfig';

describe('ShareDialog', () => {
  it('does not render when closed', () => {
    render(withLocale(<ShareDialog deckId="d1" deckTitle="Demo" open={false} onClose={vi.fn()} />));
    expect(screen.queryByTestId('share-dialog')).toBeNull();
  });

  it('renders with tabs when open', () => {
    render(withLocale(<ShareDialog deckId="d1" deckTitle="Demo" open onClose={vi.fn()} />));
    expect(screen.getByTestId('share-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('share-dialog-tab-link')).toBeInTheDocument();
    expect(screen.getByTestId('share-dialog-tab-embed')).toBeInTheDocument();
    expect(screen.getByTestId('share-dialog-tab-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('share-dialog-tab-audience')).toBeInTheDocument();
    expect(screen.getByTestId('share-dialog-tab-versions')).toBeInTheDocument();
  });

  it('switches tabs on click', () => {
    render(withLocale(<ShareDialog deckId="d1" deckTitle="Demo" open onClose={vi.fn()} />));
    expect(screen.queryByTestId('share-dialog-section-link')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('share-dialog-tab-visibility'));
    expect(screen.queryByTestId('share-dialog-section-visibility')).toBeInTheDocument();
  });

  it('closes on × click', () => {
    const onClose = vi.fn();
    render(withLocale(<ShareDialog deckId="d1" deckTitle="Demo" open onClose={onClose} />));
    fireEvent.click(screen.getByTestId('share-dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('emits onSave with the current state', () => {
    const onSave = vi.fn();
    render(
      withLocale(
        <ShareDialog deckId="d1" deckTitle="Demo" open onClose={vi.fn()} onSave={onSave} />,
      ),
    );
    fireEvent.click(screen.getByTestId('share-dialog-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0]?.[0] as ShareDialogState;
    expect(arg.visibility.kind).toBe('public');
  });

  it('toggles watermark checkbox', () => {
    const onSave = vi.fn();
    render(
      withLocale(
        <ShareDialog deckId="d1" deckTitle="Demo" open onClose={vi.fn()} onSave={onSave} />,
      ),
    );
    const cb = screen.getByTestId('share-dialog-watermark') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    fireEvent.click(screen.getByTestId('share-dialog-save'));
    const arg = onSave.mock.calls[0]?.[0] as ShareDialogState;
    expect(arg.perViewerWatermark).toBe(true);
  });

  it('shows the deck id in the link', () => {
    render(withLocale(<ShareDialog deckId="d-1234" deckTitle="Demo" open onClose={vi.fn()} />));
    const link = screen.getByTestId('share-dialog-link') as HTMLInputElement;
    expect(link.value).toContain('d-1234');
  });
});

describe('VisibilityPicker', () => {
  it('renders all options', () => {
    render(withLocale(<VisibilityPicker value={{ kind: 'public' }} onChange={vi.fn()} />));
    expect(screen.getByTestId('visibility-picker-option-public')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-picker-option-password')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-picker-option-domain')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-picker-option-sso')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-picker-option-email')).toBeInTheDocument();
  });

  it('emits onChange with new kind', () => {
    const onChange = vi.fn();
    render(withLocale(<VisibilityPicker value={{ kind: 'public' }} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('visibility-picker-option-password'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'password' });
  });

  it('shows password field when kind=password', () => {
    render(
      withLocale(
        <VisibilityPicker value={{ kind: 'password', password: 'secret' }} onChange={vi.fn()} />,
      ),
    );
    expect(screen.getByTestId('visibility-picker-password')).toBeInTheDocument();
  });
});

describe('DomainAllowlist', () => {
  it('renders with empty list', () => {
    render(withLocale(<DomainAllowlist value={[]} onChange={vi.fn()} />));
    expect(screen.getByTestId('domain-allowlist-list').children.length).toBe(0);
  });

  it('renders chips for each domain', () => {
    render(withLocale(<DomainAllowlist value={['a.com', 'b.com']} onChange={vi.fn()} />));
    expect(screen.getByTestId('domain-allowlist-item-a.com')).toBeInTheDocument();
    expect(screen.getByTestId('domain-allowlist-item-b.com')).toBeInTheDocument();
  });

  it('adds a domain on Add click', () => {
    const onChange = vi.fn();
    render(withLocale(<DomainAllowlist value={['a.com']} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('domain-allowlist-draft'), { target: { value: 'b.com' } });
    fireEvent.click(screen.getByTestId('domain-allowlist-add'));
    expect(onChange).toHaveBeenCalledWith(['a.com', 'b.com']);
  });

  it('removes a domain on × click', () => {
    const onChange = vi.fn();
    render(withLocale(<DomainAllowlist value={['a.com', 'b.com']} onChange={onChange} />));
    const removeBtn = screen.getByLabelText('remove a.com');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['b.com']);
  });

  it('ignores adding a duplicate', () => {
    const onChange = vi.fn();
    render(withLocale(<DomainAllowlist value={['a.com']} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('domain-allowlist-draft'), { target: { value: 'A.COM' } });
    fireEvent.click(screen.getByTestId('domain-allowlist-add'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SSOConfig', () => {
  const tenants = [{ tenantId: 't1', displayName: 'T1', provider: 'okta' as const }];
  it('renders with empty state', () => {
    render(withLocale(<SSOConfig tenants={tenants} value={{}} onChange={vi.fn()} />));
    expect(screen.getByTestId('sso-config-tenant')).toBeInTheDocument();
  });
  it('emits onChange on tenant select', () => {
    const onChange = vi.fn();
    render(withLocale(<SSOConfig tenants={tenants} value={{}} onChange={onChange} />));
    fireEvent.change(screen.getByTestId('sso-config-tenant'), { target: { value: 't1' } });
    expect(onChange).toHaveBeenCalledWith({ tenantId: 't1' });
  });
});
