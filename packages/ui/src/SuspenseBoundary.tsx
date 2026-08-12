'use client';

/**
 * SuspenseBoundary — single primitive for loading / error / empty states.
 *
 * Per Wave 1 §S1.5 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Replaces every spinner in the editor. Three slots:
 *   - fallback: rendered while a child suspends (default = Skeleton.Block).
 *   - errorFallback: rendered when a child throws (default = ErrorCard).
 *   - empty: rendered when a child calls useEmpty() and the result is
 *     "empty" (default = EmptyState).
 *
 * Children can call `useEmpty()` to signal an empty state declaratively:
 *
 *   function DeckList() {
 *     const decks = useDeckList();
 *     useEmpty(decks.length === 0, {
 *       title: 'No decks yet',
 *       description: 'Create your first deck to get started.',
 *     });
 *     return <ul>{decks.map(...)}</ul>;
 *   }
 */

import {
  Component,
  Suspense,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';

import { EmptyState, type EmptyStateProps } from './EmptyState.js';
import { ErrorCard, type ErrorCardProps } from './ErrorBoundary.js';
import { Skeleton } from './Skeleton.js';

interface SuspenseBoundaryContextValue {
  setEmpty(props: EmptyStateProps | null): void;
}

const SuspenseBoundaryContext = createContext<SuspenseBoundaryContextValue | null>(
  null,
);

export interface SuspenseBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  errorFallback?: (error: Error, reset: () => void) => ReactElement;
  /** Optional initial empty state (otherwise nothing rendered empty until child calls useEmpty). */
  initialEmpty?: EmptyStateProps | undefined;
}

/**
 * Wraps a subtree in a Suspense + Error Boundary + Empty registry.
 *
 * Components inside the boundary may:
 *   - suspend (e.g. React Suspense while data is loading),
 *   - throw (caught by the error boundary),
 *   - call `useEmpty()` to push an empty state.
 */
export function SuspenseBoundary(props: SuspenseBoundaryProps): ReactElement {
  const { children, fallback, errorFallback, initialEmpty } = props;
  const [empty, setEmpty] = useState<EmptyStateProps | null>(initialEmpty ?? null);

  const ctx = useMemo<SuspenseBoundaryContextValue>(
    () => ({ setEmpty: (next) => setEmpty(next) }),
    [],
  );

  return (
    <SuspenseBoundaryContext.Provider value={ctx}>
      <BoundaryErrorLayer
        fallback={errorFallback}
        resetKey={empty?.title ?? ''}
      >
        {empty ? (
          <EmptyState {...empty} />
        ) : (
          <Suspense fallback={fallback ?? <Skeleton.Block rows={4} />}>
            {children}
          </Suspense>
        )}
      </BoundaryErrorLayer>
    </SuspenseBoundaryContext.Provider>
  );
}

interface BoundaryErrorLayerProps {
  children: ReactNode;
  fallback?: ((error: Error, reset: () => void) => ReactElement) | undefined;
  resetKey: string;
}

class BoundaryErrorLayer extends Component<BoundaryErrorLayerProps> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error | null } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined') {
      console.error('[SuspenseBoundary]', error, info.componentStack);
    }
  }

  override componentDidUpdate(prev: BoundaryErrorLayerProps): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (fallback) return fallback(this.state.error, this.reset);
      const errProps: ErrorCardProps = {
        error: this.state.error,
        onRetry: this.reset,
      };
      return <ErrorCard {...errProps} />;
    }
    return this.props.children;
  }
}

/**
 * Children call this to push an EmptyState into the nearest SuspenseBoundary.
 *
 * Passing `null` props clears the empty state and resumes normal rendering.
 */
export function useEmpty(
  isEmpty: boolean,
  props: EmptyStateProps | null = null,
): void {
  const ctx = useContext(SuspenseBoundaryContext);
  useEffect(() => {
    if (!ctx) return;
    if (isEmpty && props) {
      ctx.setEmpty(props);
    } else if (!isEmpty) {
      ctx.setEmpty(null);
    }
  }, [ctx, isEmpty, props]);
}