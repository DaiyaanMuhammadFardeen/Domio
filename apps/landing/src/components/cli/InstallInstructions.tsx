/**
 * Tabbed install instructions for the deckctl CLI.
 *
 * S10.4 — one tab per OS (macOS, Linux, Windows). Each tab shows the
 * install commands for the package managers the user is most likely to
 * reach for (brew on macOS, apt + curl on Linux, scoop + choco on Windows).
 *
 * Implementation notes:
 * - We render plain `<pre><code>` rather than shiki to keep the landing
 *   app dependency-free. A future Wave can swap in shiki when we want
 *   syntax highlighting.
 * - The "Copy" button is a client component hook so we can interact with
 *   the clipboard. The rest of the component is server-rendered.
 */

'use client';

import { useState, useEffect, type JSX } from 'react';
import type { InstallSnippet, CliOs } from '../../lib/cli-data';

interface InstallInstructionsProps {
  readonly installs: ReadonlyArray<InstallSnippet>;
}

interface TabSpec {
  readonly os: CliOs;
  readonly label: string;
}

const TABS: ReadonlyArray<TabSpec> = [
  { os: 'macos', label: 'macOS' },
  { os: 'linux', label: 'Linux' },
  { os: 'windows', label: 'Windows' },
];

const MANAGER_LABEL: Record<string, string> = {
  brew: 'Homebrew',
  apt: 'apt',
  curl: 'curl (install script)',
  scoop: 'Scoop',
  choco: 'Chocolatey',
};

function CopyButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onClick = async (): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="cli-copy-btn"
      onClick={onClick}
      aria-label={copied ? 'Copied' : 'Copy command'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function InstallInstructions({ installs }: InstallInstructionsProps): JSX.Element {
  const [active, setActive] = useState<CliOs>('macos');

  const visible = installs.filter((s) => s.os === active);

  return (
    <section className="cli-install" aria-labelledby="cli-install-heading">
      <h2 id="cli-install-heading" className="cli-section-heading">
        Install
      </h2>
      <div className="cli-tabs" role="tablist" aria-label="Install by operating system">
        {TABS.map((tab) => {
          const selected = tab.os === active;
          return (
            <button
              key={tab.os}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`cli-tabpanel-${tab.os}`}
              id={`cli-tab-${tab.os}`}
              className={
                'cli-tab' + (selected ? ' cli-tab--active' : '')
              }
              onClick={() => setActive(tab.os)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {TABS.map((tab) => (
        <div
          key={tab.os}
          role="tabpanel"
          id={`cli-tabpanel-${tab.os}`}
          aria-labelledby={`cli-tab-${tab.os}`}
          hidden={tab.os !== active}
          className="cli-tabpanel"
        >
          {visible.map((snippet) => (
            <div key={snippet.manager} className="cli-install-card">
              <div className="cli-install-card__header">
                <span className="cli-install-card__manager">
                  {MANAGER_LABEL[snippet.manager] ?? snippet.manager}
                </span>
              </div>
              <div className="cli-install-card__body">
                <pre className="cli-snippet">
                  <code>{snippet.command}</code>
                </pre>
                <CopyButton value={snippet.command} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export default InstallInstructions;
