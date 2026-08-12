/**
 * Tests for the @domio/eslint-plugin rules.
 *
 * Per Wave 1 §S1.10 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import tsparser from '@typescript-eslint/parser';
import plugin from './index.js';

const linter = new Linter({ configType: 'flat' });

function lint(code: string, ruleName: keyof typeof plugin.rules): readonly { messageId: string }[] {
  const messages = linter.verify(code, [
    {
      plugins: {
        domio: plugin,
      },
      languageOptions: {
        parser: tsparser as never,
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
      },
      rules: {
        [`domio/${ruleName}`]: 'error',
      },
    },
  ] as never);
  return messages.map((m) => ({ messageId: (m as { messageId?: string }).messageId ?? 'unknown' }));
}

describe('domio/no-raw-href', () => {
  it('flags string-literal href', () => {
    const msgs = lint('const x = <Link href="/editor/deck-1">Open</Link>;', 'no-raw-href');
    expect(msgs).toContainEqual({ messageId: 'noRawHref' });
  });

  it('does not flag dynamic href', () => {
    const msgs = lint('const x = <Link href={editor("deck-1")}>Open</Link>;', 'no-raw-href');
    expect(msgs).toEqual([]);
  });

  it('does not flag elements without href', () => {
    const msgs = lint('const x = <Link>No href</Link>;', 'no-raw-href');
    expect(msgs).toEqual([]);
  });
});

describe('domio/no-raw-fetch', () => {
  it('flags direct fetch call', () => {
    const msgs = lint('fetch("/api/decks");', 'no-raw-fetch');
    expect(msgs).toContainEqual({ messageId: 'noRawFetch' });
  });

  it('does not flag sdk calls', () => {
    const msgs = lint('import { sdk } from "./sdk"; const x = sdk.decks.list();', 'no-raw-fetch');
    expect(msgs).toEqual([]);
  });
});

describe('domio/no-raw-hex', () => {
  it('flags hex literals in JSX style', () => {
    const msgs = lint('const x = <div style={{ color: "#ff0000" }} />;', 'no-raw-hex');
    expect(msgs).toContainEqual({ messageId: 'noRawHex' });
  });

  it('does not flag CSS variable references', () => {
    const msgs = lint('const x = <div style={{ background: "var(--surface-base)" }} />;', 'no-raw-hex');
    expect(msgs).toEqual([]);
  });
});