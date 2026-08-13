/**
 * @domio/join-web — widget renderer.
 *
 * Reads the descriptor's `type` and dispatches to the registered
 * component. Adding a new widget kind requires only a new entry in
 * the registry plus a new file (Open/Closed).
 */

'use client';

import type { AudienceWidgetDescriptor } from '@domio/audience-service';
import { getWidget } from './registry';
import { useWidgetState } from '@/runtime/widgets/WidgetEngineConnector';

export interface WidgetRendererProps {
  readonly descriptor: AudienceWidgetDescriptor;
  readonly onSubmit?: ((payload: Record<string, unknown>) => void) | undefined;
  readonly disabled?: boolean | undefined;
}

export function WidgetRenderer(props: WidgetRendererProps) {
  const { descriptor, onSubmit, disabled } = props;
  // Hooks must be called unconditionally; the registry lookup happens
  // after the snapshot hook so React's rules-of-hooks stay satisfied.
  const { state, error } = useWidgetState(descriptor.widget_id);
  const entry = getWidget(descriptor.type);
  if (!entry) return null;
  const Component = entry.Component;
  return (
    <Component
      descriptor={descriptor}
      payload={descriptor.payload}
      widgetId={descriptor.widget_id}
      onSubmit={onSubmit}
      disabled={Boolean(disabled)}
      state={state}
      error={error}
    />
  );
}
