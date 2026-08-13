'use client';

/**
 * MCPToolDetailDrawer — Wave 10 §S10.1.
 *
 * Slide-in drawer that shows the full JSON schema for an MCP tool's
 * params and return shape. Used by `mcp/tools/page.tsx` when an operator
 * expands a row.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge, type BadgeTone } from '../Badge';
import type { MCPTool } from '../../lib/mcp-service';

export interface MCPToolDetailDrawerProps {
  tool: MCPTool | null;
  open: boolean;
  onClose: () => void;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toneForRateLimit(cls: MCPTool['rate_limit_class']): BadgeTone {
  switch (cls) {
    case 'high':
      return 'green';
    case 'medium':
      return 'amber';
    case 'low':
      return 'red';
    default:
      return 'grey';
  }
}

function humanRateLimit(cls: MCPTool['rate_limit_class']): string {
  switch (cls) {
    case 'high':
      return '1000 req/min';
    case 'medium':
      return '100 req/min';
    case 'low':
      return '20 req/min';
    default:
      return '—';
  }
}

function countParams(schema: Record<string, unknown>): number {
  const props = schema['properties'];
  if (props && typeof props === 'object') {
    return Object.keys(props as Record<string, unknown>).length;
  }
  return 0;
}

export function MCPToolDetailDrawer({ tool, open, onClose }: MCPToolDetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !tool) return null;

  return (
    <div
      data-testid="mcp-tool-detail-drawer"
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`${tool.name} detail`}
    >
      <button
        type="button"
        aria-label="Close tool detail drawer"
        onClick={onClose}
        className="flex-1 bg-slate-900/40"
      />
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tool detail
            </div>
            <div className="mt-1 font-mono text-xs text-slate-700">{tool.name}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          <p className="leading-relaxed text-slate-700">{tool.description}</p>

          <dl className="mt-5 grid grid-cols-3 gap-y-2">
            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Status
            </dt>
            <dd className="col-span-2">
              {tool.enabled ? (
                <Badge tone="green">enabled</Badge>
              ) : (
                <Badge tone="grey">disabled</Badge>
              )}
            </dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Rate limit
            </dt>
            <dd className="col-span-2">
              <Badge tone={toneForRateLimit(tool.rate_limit_class)}>
                {humanRateLimit(tool.rate_limit_class)}
              </Badge>
            </dd>

            <dt className="col-span-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Params
            </dt>
            <dd className="col-span-2 text-slate-800">
              {countParams(tool.params_schema)} field(s)
            </dd>
          </dl>

          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Params schema
            </h3>
            <pre
              data-testid="mcp-tool-params-schema"
              className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800"
            >
              {stringify(tool.params_schema)}
            </pre>
          </section>

          <section className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Return schema
            </h3>
            <pre
              data-testid="mcp-tool-return-schema"
              className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100"
            >
              {stringify(tool.return_schema)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
