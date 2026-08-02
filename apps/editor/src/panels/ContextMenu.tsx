'use client';

/**
 * ContextMenu — type-aware right-click menu. See
 * docs/development_phases/phase-03 §F.1: per-type menu items.
 *
 * The caller provides `itemsFor` that maps a selection type to a list of
 * commands. The menu positions at the pointer; click outside closes.
 */

import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ReadonlyArray<ContextMenuItem>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps): ReactElement | null {
  const { open, x, y, items, onSelect, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          type="button"
          className={`context-menu__item${item.destructive ? ' is-destructive' : ''}`}
          disabled={item.disabled === true}
          onClick={() => {
            onSelect(item.id);
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * Build the default context menu for a given selection kind. Used by
 * the editor's right-click handler.
 */
export function contextMenuFor(
  kind: 'frame' | 'text' | 'image' | 'vector' | 'group' | 'selection',
  options?: { hasSelection?: boolean; isComponent?: boolean },
): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { id: 'cut', label: 'Cut', shortcut: 'Cmd+X' },
    { id: 'copy', label: 'Copy', shortcut: 'Cmd+C' },
    { id: 'paste', label: 'Paste', shortcut: 'Cmd+V' },
    { id: 'duplicate', label: 'Duplicate', shortcut: 'Cmd+D' },
  ];
  if (kind === 'frame' || kind === 'group') {
    base.push({ id: 'frame-clip', label: 'Toggle clip content' });
  }
  if (kind === 'text') {
    base.push({ id: 'edit-text', label: 'Edit text' });
  }
  if (options?.hasSelection && !options?.isComponent) {
    base.push({ id: 'promote', label: 'Promote to component' });
  }
  if (options?.isComponent) {
    base.push({ id: 'detach', label: 'Detach from component' });
  }
  base.push({ id: 'bring-forward', label: 'Bring forward' });
  base.push({ id: 'send-backward', label: 'Send backward' });
  base.push({ id: 'delete', label: 'Delete', shortcut: 'Del', destructive: true });
  return base;
}