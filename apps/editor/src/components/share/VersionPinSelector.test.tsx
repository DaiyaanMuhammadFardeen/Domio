/**
 * VersionPinSelector tests — S3.11.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createContext } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VersionPinSelector, type DeckVersion } from './VersionPinSelector';

const enFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../messages/en.json',
);
const enMessages = JSON.parse(fs.readFileSync(enFile, 'utf8')) as Record<string, string>;

const FormattedMessageContext = createContext<Readonly<Record<string, string>>>({});

vi.mock('@domio/ui', async () => {
  const actual = await vi.importActual<typeof import('@domio/ui')>('@domio/ui');
  const React = await import('react');
  return {
    ...actual,
    FormattedMessage: function MockFormattedMessage(props: {
      id: string;
      values?: Readonly<Record<string, string | number>>;
    }): React.ReactElement {
      const catalogue = React.useContext(FormattedMessageContext);
      let resolved = catalogue[props.id] ?? props.id;
      if (props.values) {
        for (const [k, v] of Object.entries(props.values)) {
          resolved = resolved.replaceAll(`{${k}}`, String(v));
        }
      }
      return <span>{resolved}</span>;
    },
  };
});

function withLocale(node: React.ReactElement): React.ReactElement {
  return (
    <FormattedMessageContext.Provider value={enMessages}>
      {node}
    </FormattedMessageContext.Provider>
  );
}

const VERSIONS: readonly DeckVersion[] = [
  { id: 'v3', label: 'v3.0.0', createdAtMs: 300, authorLabel: 'Alice', isLatest: true },
  { id: 'v2', label: 'v2.1.0', createdAtMs: 200, authorLabel: 'Bob', isLatest: false },
  { id: 'v1', label: 'v2.0.0', createdAtMs: 100, authorLabel: 'Carol', isLatest: false },
];

describe('VersionPinSelector', () => {
  it('renders the latest option + every version', () => {
    render(withLocale(<VersionPinSelector versions={VERSIONS} value="latest" onChange={vi.fn()} />));
    const sel = screen.getByTestId('version-pin-selector-select') as HTMLSelectElement;
    expect(sel.options.length).toBe(4); // latest + 3 versions
    expect(sel.options[0]?.value).toBe('latest');
  });

  it('emits the chosen version id', () => {
    const onChange = vi.fn();
    render(withLocale(<VersionPinSelector versions={VERSIONS} value="latest" onChange={onChange} />));
    fireEvent.change(screen.getByTestId('version-pin-selector-select'), {
      target: { value: 'v2' },
    });
    expect(onChange).toHaveBeenCalledWith('v2');
  });

  it('shows the latest-hint when value is "latest"', () => {
    render(withLocale(<VersionPinSelector versions={VERSIONS} value="latest" onChange={vi.fn()} />));
    expect(screen.getByTestId('version-pin-selector-latest-hint')).toBeInTheDocument();
  });

  it('shows the pinned-hint when value is a specific version', () => {
    render(withLocale(<VersionPinSelector versions={VERSIONS} value="v2" onChange={vi.fn()} />));
    const hint = screen.getByTestId('version-pin-selector-pinned-hint');
    expect(hint.textContent).toContain('v2');
  });

  it('sorts versions by createdAtMs descending', () => {
    render(withLocale(<VersionPinSelector versions={VERSIONS} value="latest" onChange={vi.fn()} />));
    const sel = screen.getByTestId('version-pin-selector-select') as HTMLSelectElement;
    // latest + v3 (300) + v2 (200) + v1 (100)
    expect(sel.options[1]?.value).toBe('v3');
    expect(sel.options[2]?.value).toBe('v2');
    expect(sel.options[3]?.value).toBe('v1');
  });
});