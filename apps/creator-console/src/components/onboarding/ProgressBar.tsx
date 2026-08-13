'use client';

import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import type { OnboardingStep } from '../../lib/onboarding-service';

export interface ProgressBarStepDescriptor {
  readonly key: OnboardingStep;
  readonly label: string;
}

export interface ProgressBarProps {
  readonly current: OnboardingStep;
  readonly steps: ReadonlyArray<ProgressBarStepDescriptor>;
  readonly completed: ReadonlyArray<OnboardingStep>;
  readonly onJump?: (step: OnboardingStep) => void;
}

export function ProgressBar({ current, steps, completed, onJump }: ProgressBarProps) {
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <ol
      className="flex items-center gap-2 overflow-x-auto pb-2"
      data-testid="onboarding-progress"
    >
      {steps.map((step, i) => {
        const isCompleted = completed.includes(step.key);
        const isActive = step.key === current;
        const canJump = isCompleted && Boolean(onJump);
        return (
          <li
            key={step.key}
            className="flex items-center gap-2"
            data-testid={`onboarding-step-${step.key}`}
          >
            <button
              type="button"
              disabled={!canJump}
              onClick={canJump ? () => onJump?.(step.key) : undefined}
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition',
                isCompleted && 'bg-brand-600 text-white',
                isActive && !isCompleted && 'bg-brand-100 text-brand-700',
                !isCompleted && !isActive && 'bg-slate-100 text-slate-500',
                canJump && 'cursor-pointer hover:opacity-80',
                !canJump && 'cursor-default',
              )}
              aria-current={isActive ? 'step' : undefined}
              aria-label={step.label}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span
              className={clsx(
                'text-sm font-medium whitespace-nowrap',
                isActive ? 'text-slate-900' : 'text-slate-500',
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={clsx(
                  'mx-1 h-px w-8 sm:w-12',
                  i < currentIdx ? 'bg-brand-600' : 'bg-slate-200',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}