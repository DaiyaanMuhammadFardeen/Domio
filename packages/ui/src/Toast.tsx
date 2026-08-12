'use client';

/**
 * Toast — non-blocking notification primitive.
 *
 * Per Wave 1 §S1.6 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Two pieces:
 *   - `<ToastProvider>`: mount once near the root; renders the queue.
 *   - `useToast()`: returns a function that pushes a toast.
 *
 * Variants: `info | success | warning | danger`. Default timeout 4s.
 *
 * The provider is intentionally tiny — no portal, no animation. Apps that
 * want richer behavior can swap their own provider by reading from the
 * same `ToastContext`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface InternalToast extends Required<Omit<ToastInput, 'action'>> {
  id: string;
  action?: ToastInput['action'];
}

interface ToastContextValue {
  push(input: ToastInput): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Position on screen. Default `bottom-right`. */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const POSITION_STYLE: Record<
  NonNullable<ToastProviderProps['position']>,
  CSSProperties
> = {
  'top-right': { top: 'var(--space-4)', right: 'var(--space-4)' },
  'top-left': { top: 'var(--space-4)', left: 'var(--space-4)' },
  'bottom-right': { bottom: 'var(--space-4)', right: 'var(--space-4)' },
  'bottom-left': { bottom: 'var(--space-4)', left: 'var(--space-4)' },
};

export function ToastProvider(props: ToastProviderProps): ReactElement {
  const { children, position = 'bottom-right' } = props;
  const [toasts, setToasts] = useState<InternalToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput): string => {
      const id =
        typeof globalThis !== 'undefined' &&
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const toast: InternalToast = {
        id,
        message: input.message,
        variant: input.variant ?? 'info',
        durationMs: input.durationMs ?? 4000,
        ...(input.action ? { action: input.action } : {}),
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.durationMs > 0) {
        setTimeout(() => dismiss(id), toast.durationMs);
      }
      return id;
    },
    [dismiss],
  );

  const ctx = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          ...POSITION_STYLE[position],
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          zIndex: 9999,
          maxWidth: '360px',
        }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: InternalToast;
  onDismiss: () => void;
}): ReactElement {
  const variantColor =
    toast.variant === 'success'
      ? 'var(--success)'
      : toast.variant === 'warning'
      ? 'var(--warning)'
      : toast.variant === 'danger'
      ? 'var(--danger)'
      : 'var(--accent-1)';

  return (
    <div
      role={toast.variant === 'danger' || toast.variant === 'warning' ? 'alert' : 'status'}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `4px solid ${variantColor}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
        boxShadow: 'var(--shadow-2)',
        color: 'var(--content-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: '240px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        <span style={{ flex: 1, fontSize: 'var(--font-caption-size)' }}>
          {toast.message}
        </span>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--content-muted)',
            cursor: 'pointer',
            padding: 0,
            fontSize: 'var(--font-caption-size)',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-1) var(--space-3)',
            color: 'var(--content-primary)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

export function useToast(): ToastContextValue['push'] {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Outside provider — degrade gracefully: log to console.
    return (input: ToastInput): string => {
      if (typeof console !== 'undefined') {
        const tag = `[toast:${input.variant ?? 'info'}]`;
        console.log(tag, input.message);
      }
      return 'noop';
    };
  }
  return ctx.push;
}