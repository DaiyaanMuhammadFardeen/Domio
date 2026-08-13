/**
 * AuthSelector — Wave 10 §S10.3.
 *
 * Top-right dropdown that picks one of three auth kinds (API key, OAuth
 * bearer, MCP token) and shows the corresponding token input.
 */

'use client';

import { ChevronDown, Key, ShieldCheck, Cpu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { ApiExplorerAuth } from '../../lib/api-explorer-service';

export interface AuthSelectorProps {
  auth: ApiExplorerAuth | undefined;
  onChange: (auth: ApiExplorerAuth | undefined) => void;
}

type Kind = ApiExplorerAuth['kind'];

const KIND_META: ReadonlyArray<{ kind: Kind; label: string; icon: React.ReactNode; placeholder: string }> = [
  { kind: 'api_key', label: 'API Key', icon: <Key className="h-3.5 w-3.5" aria-hidden />, placeholder: 'pk_live_xxx…' },
  { kind: 'oauth', label: 'OAuth', icon: <ShieldCheck className="h-3.5 w-3.5" aria-hidden />, placeholder: 'oauth bearer token…' },
  { kind: 'mcp_token', label: 'MCP Token', icon: <Cpu className="h-3.5 w-3.5" aria-hidden />, placeholder: 'mcp token…' },
];

export function AuthSelector({ auth, onChange }: AuthSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = auth ? KIND_META.find((k) => k.kind === auth.kind) : null;

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Auth
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.icon ?? <Key className="h-3.5 w-3.5" aria-hidden />}
        <span>{current?.label ?? 'None'}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {KIND_META.map((opt) => (
            <li key={opt.kind}>
              <button
                type="button"
                role="option"
                aria-selected={auth?.kind === opt.kind}
                onClick={() => {
                  onChange({ kind: opt.kind, value: auth?.value ?? '' });
                  setOpen(false);
                }}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50',
                  auth?.kind === opt.kind && 'bg-brand-50 text-brand-700',
                )}
              >
                {opt.icon}
                <span className="font-medium">{opt.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              <span className="font-medium">None</span>
            </button>
          </li>
        </ul>
      )}
      {auth && (
        <input
          type="password"
          value={auth.value}
          onChange={(e) => onChange({ ...auth, value: e.target.value })}
          placeholder={current?.placeholder}
          aria-label={`${current?.label} token`}
          className="w-44 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
        />
      )}
    </div>
  );
}
