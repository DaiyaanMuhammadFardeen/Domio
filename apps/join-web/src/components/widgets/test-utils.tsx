/**
 * Shared test helpers for widget tests.
 */

'use client';

import { _resetWidgetBusForTests } from '@/runtime/widgets/WidgetEngineConnector';
import type { WidgetProps } from './registry';
import type { AudienceWidgetDescriptor } from '@domio/audience-service';

export function resetBus(): void {
  _resetWidgetBusForTests();
}

export function buildProps<P>(
  type: AudienceWidgetDescriptor['type'],
  widgetId: string,
  payload: P,
  opts: { onSubmit?: (p: Record<string, unknown>) => void; disabled?: boolean; state?: unknown; error?: string | null } = {},
): WidgetProps<P> {
  const descriptor: AudienceWidgetDescriptor = {
    widget_id: widgetId,
    type,
    position: 0,
    payload: (payload ?? {}) as Record<string, unknown>,
    updated_at_ms: 0,
  };
  return {
    descriptor,
    payload,
    widgetId,
    onSubmit: opts.onSubmit,
    disabled: opts.disabled ?? false,
    state: opts.state ?? null,
    error: opts.error ?? null,
  };
}
