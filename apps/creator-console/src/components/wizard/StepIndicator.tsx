'use client';

import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import type { WizardStep } from '../../lib/types';

export interface StepDescriptor {
  readonly key: WizardStep;
  readonly label: string;
}

export interface StepIndicatorProps {
  readonly current: WizardStep;
  readonly steps: ReadonlyArray<StepDescriptor>;
}

const STEP_ORDER: ReadonlyArray<WizardStep> = ['details', 'media', 'files', 'pricing'];

export function StepIndicator({ current, steps }: StepIndicatorProps) {
  const currentIdx = STEP_ORDER.indexOf(current);

  return (
    <ol className="flex items-center gap-2 overflow-x-auto" data-testid="wizard-step-indicator">
      {steps.map((step, i) => {
        const completed = i < currentIdx;
        const active = step.key === current;
        return (
          <li
            key={step.key}
            className="flex items-center gap-2"
            data-testid={`wizard-step-${step.key}`}
          >
            <span
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                completed && 'bg-brand-600 text-white',
                active && 'bg-brand-100 text-brand-700',
                !completed && !active && 'bg-slate-100 text-slate-500',
              )}
              aria-hidden
            >
              {completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={clsx('text-sm font-medium', active ? 'text-slate-900' : 'text-slate-500')}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={clsx('mx-1 h-px w-8', completed ? 'bg-brand-600' : 'bg-slate-200')}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
