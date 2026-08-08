import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WidgetConfigPanel } from './WidgetConfigPanel';
import type { AudienceWidgetDescriptor } from '@domio/audience-service';

function makeDescriptor(type: AudienceWidgetDescriptor['type'], payload: Record<string, unknown> = {}): AudienceWidgetDescriptor {
  return {
    widget_id: 'w1',
    type,
    position: 0,
    payload,
    updated_at_ms: 0,
  };
}

describe('WidgetConfigPanel', () => {
  it('renders the poll config form', () => {
    const onChange = vi.fn();
    const dom = render(
      <WidgetConfigPanel descriptor={makeDescriptor('poll', { question: 'Hi', options: ['A', 'B'] })} onChange={onChange} />,
    );
    expect(dom.container.querySelector('[data-testid="widget-config-poll"]')).toBeTruthy();
  });

  it('renders a fallback for unsupported widget types', () => {
    const onChange = vi.fn();
    const dom = render(
      <WidgetConfigPanel descriptor={makeDescriptor('reaction')} onChange={onChange} />,
    );
    expect(dom.container.textContent).toMatch(/No configuration/);
  });
});