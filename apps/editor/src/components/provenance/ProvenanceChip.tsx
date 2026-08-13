'use client';

/**
 * ProvenanceChip — small "i" chip that appears on hover over any
 * data-bound element on a slide.
 *
 * Per Wave 11 §S11.11 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Behaviour:
 * 1. The chip is hidden by default and revealed on hover/focus of the
 *    wrapped child (or on hover of the chip itself).
 * 2. Clicking the chip opens `<ProvenanceDrawer>` with the
 *    element's provenance record.
 * 3. The chip is fully keyboard-accessible — focus reveals it,
 *    Enter / Space open the drawer.
 */

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/locale';
import { ProvenanceDrawer } from './ProvenanceDrawer';

export interface ProvenanceChipProps {
  /** Element the chip annotates (rendered as the chip's child). */
  readonly children: ReactElement;
  /** Slide-scoped element id used to look up the provenance record. */
  readonly elementId: string;
  /** When true the chip is permanently visible (e.g. for QA review). */
  readonly alwaysVisible?: boolean;
  /** Optional callback fired when the user opens the drawer. */
  readonly onOpen?: (elementId: string) => void;
  /** Optional callback fired when the user closes the drawer. */
  readonly onClose?: () => void;
}

export function ProvenanceChip({
  children,
  elementId,
  alwaysVisible = false,
  onOpen,
  onClose,
}: ProvenanceChipProps): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const reveal = hovered || alwaysVisible || open;

  const handleOpen = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    onOpen?.(elementId);
  }, [elementId, onOpen]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
    // Restore focus to whatever opened the chip (a11y).
    queueMicrotask(() => {
      const target = lastFocusRef.current;
      if (target && typeof target.focus === 'function') target.focus();
    });
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleOpen();
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        handleClose();
      }
    },
    [handleOpen, handleClose, open],
  );

  // Close on Escape even when focus is outside the chip wrapper.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  // Build the wrapped child: clone the single element to add hover
  // listeners and an aria-describedby pointing at the chip.
  const childElement = isValidElement(children) ? children : null;
  const childProps = (childElement?.props ?? {}) as Record<string, unknown>;
  const augmented = childElement
    ? cloneElement(children, {
        // Preserve any existing className from the child.
        className: cn(
          (childProps['className'] as string | undefined) ?? '',
          'provenance-chip-target',
        ),
      } as Partial<typeof children.props>)
    : children;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex max-w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        // Only collapse hover when focus leaves the entire wrapper.
        const next = event.relatedTarget as Node | null;
        if (!next || !wrapperRef.current?.contains(next)) {
          setHovered(false);
        }
      }}
      data-testid="provenance-chip-wrapper"
      data-element-id={elementId}
    >
      {augmented}

      <button
        type="button"
        aria-label={t('editor.provenance.chip.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          handleOpen();
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'absolute -top-2 -right-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full',
          'bg-blue-600 text-white shadow ring-1 ring-blue-400/60 transition-all',
          'hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
          reveal ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none',
        )}
        data-testid="provenance-chip-button"
        data-element-id={elementId}
        tabIndex={reveal ? 0 : -1}
      >
        <Info size={11} aria-hidden />
      </button>

      <ProvenanceDrawer open={open} elementId={elementId} onClose={handleClose} />
    </span>
  );
}

export default ProvenanceChip;

// Re-export for tests that need to assert on the wrapper DOM node.
export type ProvenanceChipChild = ReactNode;
