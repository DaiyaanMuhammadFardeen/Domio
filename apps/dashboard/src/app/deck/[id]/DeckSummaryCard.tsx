'use client';

import { Clock, Eye, ListChecks, Users } from 'lucide-react';

export interface DeckSummaryCardProps {
  totalSessions: number;
  viewerCount: number;
  avgDurationMs: number;
  completionRate: number;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function DeckSummaryCard({
  totalSessions,
  viewerCount,
  avgDurationMs,
  completionRate,
}: DeckSummaryCardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card icon={<Eye className="h-4 w-4" />} label="Sessions" value={totalSessions.toLocaleString()} />
      <Card icon={<Users className="h-4 w-4" />} label="Viewers" value={viewerCount.toLocaleString()} />
      <Card
        icon={<Clock className="h-4 w-4" />}
        label="Avg duration"
        value={formatDuration(avgDurationMs)}
      />
      <Card
        icon={<ListChecks className="h-4 w-4" />}
        label="Completion"
        value={`${(completionRate * 100).toFixed(1)}%`}
      />
    </div>
  );
}

function Card({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  );
}