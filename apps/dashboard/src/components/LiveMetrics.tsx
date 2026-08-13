'use client';

/**
 * LiveMetrics — attendance / poll-participation / question-volume /
 * attention tile row.
 *
 * Per Wave 7 §S7.7 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 */

import { type ReactElement } from 'react';
import {
  Activity,
  BarChart3,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  LiveAttendance,
  LivePollParticipation,
  LiveQuestionVolume,
  LiveSlideState,
} from '../lib/live-analytics-service';

export interface LiveMetricsProps {
  attendance: LiveAttendance;
  poll: LivePollParticipation;
  question: LiveQuestionVolume;
  slide: LiveSlideState;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function attentionTone(score: number): string {
  if (score >= 0.7) return 'text-emerald-700';
  if (score >= 0.4) return 'text-amber-700';
  return 'text-rose-700';
}

export function LiveMetrics({
  attendance,
  poll,
  question,
  slide,
}: LiveMetricsProps): ReactElement {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      data-testid="live-metrics"
    >
      <Metric
        testId="live-attendance"
        icon={<Eye className="h-4 w-4" />}
        label="Attendance"
        value={attendance.current.toLocaleString()}
        sub={`peak ${attendance.peak.toLocaleString()} · +${attendance.joinedLast30s}/- ${attendance.leftLast30s} (30s)`}
      />
      <Metric
        testId="live-poll"
        icon={<BarChart3 className="h-4 w-4" />}
        label="Poll participation"
        value={poll.participationRate > 0 ? pct(poll.participationRate) : '—'}
        sub={
          poll.activePollId
            ? `${poll.votes} votes · ${poll.participants} eligible`
            : 'no active poll'
        }
      />
      <Metric
        testId="live-questions"
        icon={<MessageSquare className="h-4 w-4" />}
        label="Question volume"
        value={question.openQuestions.toLocaleString()}
        sub={`${question.answered} answered · ${question.questionsPerMinute.toFixed(1)}/min`}
      />
      <Metric
        testId="live-attention"
        icon={<Activity className={clsx('h-4 w-4', attentionTone(slide.attentionScore))} />}
        label="Attention"
        value={pct(slide.attentionScore)}
        sub={`time on slide ${formatMs(slide.timeInSlideMs)}`}
      />
    </div>
  );
}

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  testId: string;
}

function Metric({ icon, label, value, sub, testId }: MetricProps): ReactElement {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}