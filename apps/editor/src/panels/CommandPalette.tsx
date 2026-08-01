'use client';

/**
 * CommandPalette — Cmd+K palette. See docs/development_phases/phase-03
 * §F.1: every action reachable via a single keystroke or via Cmd+K.
 *
 * Searches shortcuts by label / description / id; arrow-key navigation,
 * Enter to invoke. Caller wires `onInvoke` and `onClose`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Shortcut } from '@domio/canvas';

export interface CommandPaletteProps {
  open: boolean;
  shortcuts: ReadonlyArray<Shortcut>;
  onInvoke: (shortcut: Shortcut) => void;
  onClose: () => void;
}

export function CommandPalette(props: CommandPaletteProps): ReactElement | null {
  const { open, shortcuts, onInvoke, onClose } = props;
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter((s) => {
      return (
        s.label.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false) ||
        s.id.toLowerCase().includes(q) ||
        s.chord.toLowerCase().includes(q)
      );
    });
  }, [shortcuts, query]);

  useEffect(() => {
    if (cursor >= matches.length) setCursor(Math.max(0, matches.length - 1));
  }, [matches.length, cursor]);

  if (!open) return null;

  return (
    <div className="palette" role="dialog" aria-label="Command palette">
      <div className="palette__panel">
        <input
          ref={inputRef}
          type="search"
          placeholder="Type a command…"
          className="palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(matches.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const target = matches[cursor];
              if (target) onInvoke(target);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette__results" role="listbox">
          {matches.map((s, i) => (
            <li
              key={s.id}
              className={`palette__row${i === cursor ? ' is-active' : ''}`}
              role="option"
              aria-selected={i === cursor}
            >
              <button
                type="button"
                onClick={() => onInvoke(s)}
                onMouseEnter={() => setCursor(i)}
              >
                <span className="palette__label">{s.label}</span>
                {s.category ? <span className="palette__cat">{s.category}</span> : null}
                <span className="palette__chord">{s.chord}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="palette__empty">No matches</li>
          ) : null}
        </ul>
      </div>
      <button
        type="button"
        aria-label="Close"
        className="palette__scrim"
        onClick={onClose}
      />
    </div>
  );
}