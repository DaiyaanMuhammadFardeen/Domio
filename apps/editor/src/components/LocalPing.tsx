'use client';

/**
 * LocalPing — Cmd+Shift+P ring animation at the cursor. See
 * docs/development_phases/phase-03 §F.3 (local ping presence).
 *
 * Holds a `LocalPingAdapter`; emit + render ring on the `active` list.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { LocalPingAdapter, LocalPing } from '@domio/canvas';

export interface LocalPingProps {
  /** Adapter instance (allows sharing across panels). */
  adapter: LocalPingAdapter;
  /** Container element to position pings relative to. */
  container: React.RefObject<HTMLElement>;
}

export function LocalPing(props: LocalPingProps): ReactElement {
  const { adapter, container } = props;
  const [active, setActive] = useState<LocalPing[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        const rect = container.current?.getBoundingClientRect();
        if (!rect) return;
        adapter.emit({ x: rect.width / 2, y: rect.height / 2 });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [adapter, container]);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const next = adapter.active(now);
      setActive(next);
      rafRef.current = requestAnimationFrame(() => {
        setTimeout(tick, 100);
      });
    }
    tick();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [adapter]);

  return (
    <div className="presence-ping" aria-hidden>
      {active.map((ping) => (
        <span
          key={ping.id}
          className="presence-ping__ring"
          style={{ left: ping.cursor.x, top: ping.cursor.y }}
        />
      ))}
    </div>
  );
}
