'use client';

import { useEffect, useState } from 'react';
import { StatementTable } from '../../components/statements/StatementTable';
import { StatementDetail } from '../../components/statements/StatementDetail';
import { useI18n } from '../../lib/i18n';
import { generateStatement, getStatement, listStatements } from '../../lib/statement-service';
import type { Statement } from '../../lib/types';

const CREATOR_ID = 'creator-demo';

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function StatementsPage() {
  const { t } = useI18n();
  const [statements, setStatements] = useStatementList();
  const [selected, setSelected] = useState<Statement | null>(null);
  const [period, setPeriod] = useState<string>(defaultPeriod());
  const [generating, setGenerating] = useState(false);

  async function handleSelect(id: string) {
    const detail = await getStatement(id);
    setSelected(detail);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateStatement(CREATOR_ID, period);
      const refreshed = await listStatements(CREATOR_ID);
      setStatements(refreshed);
      const detail = await getStatement(`stmt_${CREATOR_ID}_${period}`);
      if (detail) setSelected(detail);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div data-testid="statements-page" className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('creator.statements.heading')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('creator.statements.subheading')}</p>
      </header>

      <section
        data-testid="statements-generate"
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">{t('creator.statements.generate')}</h2>
        <div className="mt-3 flex items-end gap-3">
          <div>
            <label
              htmlFor="statements-generate-month"
              className="block text-xs font-medium text-slate-600"
            >
              {t('creator.statements.generateMonth')}
            </label>
            <input
              id="statements-generate-month"
              data-testid="statements-generate-month"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {generating ? 'Generating…' : t('creator.statements.generate')}
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StatementTable statements={statements} onSelect={handleSelect} />
        </div>
        <div>
          <StatementDetail statement={selected} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local hook to keep the page tidy while sharing state with the table.
// ---------------------------------------------------------------------------

function useStatementList(): [Statement[], (s: Statement[]) => void] {
  const [statements, setStatements] = useState<Statement[]>([]);
  useEffect(() => {
    let cancelled = false;
    listStatements(CREATOR_ID).then((rows) => {
      if (!cancelled) setStatements(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return [statements, setStatements];
}
