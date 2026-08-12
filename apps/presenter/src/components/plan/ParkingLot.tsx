'use client';

/**
 * ParkingLot — list of audience questions awaiting a wrap-up slide.
 *
 * Per Wave 4 §S4.4 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Differs from ParkingLotDrawer: the drawer is the slide-in panel
 * (open/close + composer). This component is the always-visible list
 * itself, intended to be embedded inside the sidebar next to the plan
 * editor. Each item has a "promote to wrap-up" affordance that emits
 * an onPromote(id) callback.
 */

import { useCallback, useState, type ReactElement } from 'react';

export interface ParkingLotItem {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly received_at_ms: number;
  readonly votes: number;
}

export interface ParkingLotProps {
  readonly items: readonly ParkingLotItem[];
  readonly disabled?: boolean;
  readonly onPromote?: (id: string) => void;
  readonly dataTestId?: string;
}

export function ParkingLot({
  items,
  disabled = false,
  onPromote,
  dataTestId = 'parking-lot',
}: ParkingLotProps): ReactElement {
  const [filter, setFilter] = useState('');

  const filtered = items.filter((i) =>
    filter.trim() === '' ? true : i.text.toLowerCase().includes(filter.toLowerCase()),
  );

  const handlePromote = useCallback(
    (id: string) => {
      onPromote?.(id);
    },
    [onPromote],
  );

  return (
    <section
      data-testid={dataTestId}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-base)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <strong style={{ fontSize: 12 }}>🅿️ Parking lot</strong>
        <span style={{ fontSize: 11, color: 'var(--content-muted)' }}>
          {items.length} question{items.length === 1 ? '' : 's'}
        </span>
      </header>

      <div style={{ padding: '8px 10px' }}>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid={`${dataTestId}-filter`}
          style={{
            width: '100%',
            padding: '4px 6px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            fontSize: 11,
            background: 'var(--surface-base)',
            color: 'var(--content-primary)',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p
          data-testid={`${dataTestId}-empty`}
          style={{ fontSize: 11, color: 'var(--content-muted)', margin: '0 10px 8px' }}
        >
          {items.length === 0 ? 'No questions yet.' : 'No matches.'}
        </p>
      ) : (
        <ul
          data-testid={`${dataTestId}-list`}
          style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          {filtered.map((item) => (
            <li
              key={item.id}
              data-testid={`${dataTestId}-item-${item.id}`}
              style={{
                margin: '0 10px',
                padding: '6px 8px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                background: 'var(--surface-raised)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 11 }}>{item.author}</strong>
                <span style={{ fontSize: 10, color: 'var(--content-muted)' }}>↑ {item.votes}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{item.text}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePromote(item.id)}
                  aria-label={`Promote to wrap-up: ${item.text}`}
                  data-testid={`${dataTestId}-promote-${item.id}`}
                  style={{
                    padding: '2px 8px',
                    fontSize: 11,
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    background: 'var(--surface-base)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  ⭐ Wrap-up
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}