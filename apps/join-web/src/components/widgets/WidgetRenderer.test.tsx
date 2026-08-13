/**
 * WidgetRenderer tests — renders the right component per descriptor
 * type. Asserts via data-testid presence.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AudienceWidgetDescriptor } from '@domio/audience-service';
import { WidgetRenderer } from './WidgetRenderer';
import { _resetWidgetBusForTests } from '@/runtime/widgets/WidgetEngineConnector';

function makeDescriptor(
  type: AudienceWidgetDescriptor['type'],
  payload: Record<string, unknown> = {},
): AudienceWidgetDescriptor {
  return {
    widget_id: `w-${type}`,
    type,
    position: 0,
    payload,
    updated_at_ms: 0,
  };
}

describe('WidgetRenderer', () => {
  it.each([
    ['poll', 'poll-card'],
    ['word_cloud', 'word-cloud-card'],
    ['qa', 'qa-card'],
    ['quiz', 'quiz-card'],
    ['reaction', 'reaction-card'],
    ['nav_vote', 'nav-card'],
    ['sentiment', 'sentiment-card'],
    ['raise_hand', 'raise-hand-card'],
  ] as const)('renders the %s widget card', (type, testId) => {
    _resetWidgetBusForTests();
    render(<WidgetRenderer descriptor={makeDescriptor(type)} />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('returns null for an unknown type', () => {
    _resetWidgetBusForTests();
    const descriptor = makeDescriptor('bogus' as AudienceWidgetDescriptor['type']);
    const { container } = render(<WidgetRenderer descriptor={descriptor} />);
    expect(container.firstChild).toBeNull();
  });
});
