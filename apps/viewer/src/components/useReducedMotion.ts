/**
 * useReducedMotion — client-side wrapper over createReducedMotionGuard.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * For SSR-safe access to the user's reduced-motion preference, this hook
 * hydrates on mount using matchMedia and re-renders when the OS setting
 * changes.
 */

'use client';

import { useEffect, useState } from 'react';
import {
  createReducedMotionGuard,
  type ReducedMotionGuard,
  type ReducedMotionMode,
} from '../animation/reduced-motion';

export interface UseReducedMotionResult {
  readonly reduced: boolean;
  readonly mode: ReducedMotionMode;
  readonly setMode: (mode: ReducedMotionMode) => void;
}

export function useReducedMotion(
  initialMode: ReducedMotionMode = 'follow_os',
): UseReducedMotionResult {
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<ReducedMotionMode>(initialMode);
  const [guard, setGuard] = useState<ReducedMotionGuard | null>(null);

  useEffect(() => {
    const g = createReducedMotionGuard({ onChange: setReduced });
    setGuard(g);
    setReduced(g.isReduced());
    setMode(g.getMode());
    return () => {
      g.destroy();
    };
  }, []);

  return {
    reduced,
    mode,
    setMode: (m) => {
      guard?.setMode(m);
      setMode(m);
      setReduced(guard?.isReduced() ?? false);
    },
  };
}
