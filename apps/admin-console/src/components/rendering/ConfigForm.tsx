'use client';

/**
 * ConfigForm — edit render-config knobs for the active tenant.
 *
 * Per Wave 8 §S8.11. Validates client-side before calling the
 * `onSave` handler supplied by the page.
 */

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { RenderConfig } from '../../lib/types';

export interface ConfigFormProps {
  readonly config: RenderConfig;
  readonly onSave: (next: RenderConfig) => Promise<void>;
}

interface FieldError {
  parallelism?: string;
  retention?: string;
  rateLimit?: string;
}

export function ConfigForm({ config, onSave }: ConfigFormProps) {
  const [parallelism, setParallelism] = useState(config.max_parallelism);
  const [retention, setRetention] = useState(config.retention_days);
  const [rateLimit, setRateLimit] = useState(config.rate_limit_per_tenant);
  const [errors, setErrors] = useState<FieldError>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  function validate(): FieldError {
    const next: FieldError = {};
    if (!Number.isFinite(parallelism) || parallelism < 1 || parallelism > 64) {
      next.parallelism = 'Must be between 1 and 64';
    }
    if (!Number.isFinite(retention) || retention < 1 || retention > 365) {
      next.retention = 'Must be between 1 and 365 days';
    }
    if (!Number.isFinite(rateLimit) || rateLimit < 1 || rateLimit > 1000) {
      next.rateLimit = 'Must be between 1 and 1000 jobs/min';
    }
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus('error');
      return;
    }
    setStatus('saving');
    startTransition(() => {
      const next: RenderConfig = {
        tenant_id: config.tenant_id,
        max_parallelism: parallelism,
        retention_days: retention,
        rate_limit_per_tenant: rateLimit,
      };
      onSave(next)
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'));
    });
  }

  return (
    <form
      data-testid="render-config"
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Render configuration
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Tenant <span className="font-mono">{config.tenant_id}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Max parallelism (1–64)
          </span>
          <input
            data-testid="render-config-parallelism"
            type="number"
            min={1}
            max={64}
            value={parallelism}
            onChange={(e) => setParallelism(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {errors.parallelism ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.parallelism}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Retention (days, 1–365)
          </span>
          <input
            data-testid="render-config-retention"
            type="number"
            min={1}
            max={365}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {errors.retention ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.retention}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Rate limit / tenant (1–1000)
          </span>
          <input
            data-testid="render-config-rate-limit"
            type="number"
            min={1}
            max={1000}
            value={rateLimit}
            onChange={(e) => setRateLimit(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {errors.rateLimit ? (
            <span className="mt-1 block text-xs text-rose-600">{errors.rateLimit}</span>
          ) : null}
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs" data-testid="render-config-status" aria-live="polite">
          {status === 'saved' ? (
            <span className="text-emerald-600">Saved.</span>
          ) : status === 'error' ? (
            <span className="text-rose-600">Fix the highlighted fields.</span>
          ) : status === 'saving' ? (
            <span className="text-slate-500">Saving…</span>
          ) : (
            <span className="text-slate-400">idle</span>
          )}
        </span>
        <button
          data-testid="render-config-save"
          type="submit"
          disabled={isPending || status === 'saving'}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          Save configuration
        </button>
      </div>
    </form>
  );
}
