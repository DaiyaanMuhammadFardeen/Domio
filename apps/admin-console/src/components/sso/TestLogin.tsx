'use client';

import { useEffect, useState } from 'react';
import { Play, CheckCircle2, XCircle } from 'lucide-react';
import type { SSOProvider, SSOTestLoginResult } from '../../lib/types';
import { testSSOLogin } from '../../lib/sso-service';

export interface TestLoginProps {
  provider: SSOProvider;
  onResult: (result: SSOTestLoginResult) => void;
}

/**
 * Test-login runner for a single SSO provider. Shows an elapsed-ms
 * counter while in flight, then renders success or failure.
 *
 * Per Wave 8 §S8.1 of docs/frontend-roadmap/08-wave-enterprise.md.
 */
export function TestLogin({ provider, onResult }: TestLoginProps) {
  const [email, setEmail] = useState('');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<SSOTestLoginResult | null>(null);

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - start);
    }, 50);
    return () => window.clearInterval(tick);
  }, [running]);

  useEffect(() => {
    // clear result when the selected provider changes
    setResult(null);
    setEmail('');
    setElapsed(0);
  }, [provider.id]);

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setElapsed(0);
    setResult(null);
    try {
      const r = await testSSOLogin({
        provider_id: provider.id,
        subject_email: email.trim() || `test@${provider.tenant_id}.example`,
      });
      setResult(r);
      onResult(r);
    } catch (err) {
      const r: SSOTestLoginResult = {
        ok: false,
        resolved_subject: null,
        resolved_roles: [],
        latency_ms: elapsed,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      setResult(r);
      onResult(r);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="test-login"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Test login</h3>
          <p className="text-xs text-slate-500">
            Simulate a SAML/OIDC round-trip for{' '}
            <span className="font-medium">{provider.name}</span>.
          </p>
        </div>
      </div>

      <form onSubmit={handleRun} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label
            htmlFor="test-login-email"
            className="block text-xs font-medium text-slate-600"
          >
            Subject email
          </label>
          <input
            id="test-login-email"
            data-testid="test-login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${provider.tenant_id}.com`}
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={running}
          data-testid="test-login-submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          {running ? `Running… (${elapsed} ms)` : 'Run test login'}
        </button>
      </form>

      {running && (
        <div className="mt-3 text-xs text-slate-500">
          Running… ({elapsed} ms)
        </div>
      )}

      {result && !running && (
        <div
          data-testid="test-login-result"
          className={`mt-3 rounded-md border p-3 text-sm ${
            result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden />
            )}
            {result.ok
              ? `Resolved ${result.resolved_subject} with roles ${result.resolved_roles.join(', ') || '—'}`
              : `Failed: ${result.error ?? 'unknown error'}`}
          </div>
          <div
            className="mt-1 text-xs text-slate-600"
            data-testid="test-login-latency"
          >
            Latency: {result.latency_ms} ms
          </div>
        </div>
      )}
    </div>
  );
}