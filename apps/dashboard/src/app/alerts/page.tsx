/**
 * /alerts — real-time alerts configuration + live feed.
 *
 * Per Wave 7 §S7.6 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Server page fetches the initial triggered-alert snapshot, then
 * mounts the client `AlertConfigForm` + `AlertFeed`. The form posts
 * new rules to notification-dispatcher via the typed client.
 */

import { AlertConfigForm } from '../../components/AlertConfigForm';
import { AlertFeed } from '../../components/AlertFeed';
import {
  createAlertRule,
  listAlertRules,
  listTriggeredAlerts,
  type AlertChannel,
  type AlertComparator,
  type AlertMetric,
} from '../../lib/alerts-service';

export default async function AlertsPage() {
  const workspaceId = process.env['NEXT_PUBLIC_WORKSPACE_ID'] ?? 'ws-demo';
  const [initial, rules] = await Promise.all([
    listTriggeredAlerts(workspaceId),
    listAlertRules(workspaceId),
  ]);

  async function saveRule(input: {
    metric: AlertMetric;
    comparator: AlertComparator;
    threshold: number;
    channel: AlertChannel;
    target: string;
  }) {
    'use server';
    await createAlertRule(workspaceId, input);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Real-time alerts</h1>
        <p className="text-sm text-slate-500">
          Pick a metric + threshold; Domio pushes to Slack, Teams, email, or your webhook via
          notification-dispatcher.
        </p>
      </header>

      <AlertConfigForm onSave={saveRule} />
      <AlertFeed workspaceId={workspaceId} initialEvents={initial} />

      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Configured rules ({rules.length})
        </header>
        {rules.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No rules yet. Use the form above to create one.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2">
                <span>
                  {r.metric} {r.comparator} {r.threshold}
                </span>
                <span className="text-xs text-slate-500">
                  {r.channel} · {r.target}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
