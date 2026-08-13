/**
 * @domio/editor — participation widget palette.
 *
 * Phase 16 W3. The 8 widget types authored by the editor. Each
 * definition is the source of truth for (a) the palette entry shown to
 * the author, (b) the default props seeded on insert, and (c) the
 * audience-side render descriptor emitted in the bundle.
 */

import type { AudienceWidgetType } from '@domio/audience-service';

export interface WidgetPaletteEntry {
  readonly type: AudienceWidgetType;
  readonly label: string;
  readonly description: string;
  readonly emoji: string;
  readonly defaultProps: Record<string, unknown>;
}

export const PARTICIPATION_WIDGETS: ReadonlyArray<WidgetPaletteEntry> = [
  {
    type: 'poll',
    label: 'Poll',
    description: 'Single or multiple choice vote. Results live-update.',
    emoji: '🗳️',
    defaultProps: {
      question: 'What do you think?',
      options: ['Yes', 'No', 'Maybe'],
      allow_multiple: false,
      show_results_after_close: true,
    },
  },
  {
    type: 'word_cloud',
    label: 'Word cloud',
    description: 'Open-ended 1–2 word submissions. Words cluster by size.',
    emoji: '💭',
    defaultProps: {
      prompt: 'Describe the topic in one word',
      max_chars: 40,
      min_chars: 1,
      max_submissions_per_participant: 3,
    },
  },
  {
    type: 'qa',
    label: 'Q&A',
    description: 'Audience-submitted questions with upvotes.',
    emoji: '❓',
    defaultProps: {
      anonymous: false,
      max_question_length: 280,
      upvote_enabled: true,
      moderator_review: true,
      promote_to_parking_lot: true,
    },
  },
  {
    type: 'quiz',
    label: 'Quiz',
    description: 'Single correct answer with server-clock scoring.',
    emoji: '🧠',
    defaultProps: {
      question: '…',
      choices: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      time_limit_ms: 30_000,
      show_leaderboard: false,
    },
  },
  {
    type: 'reaction',
    label: 'Reaction',
    description: 'Quick emoji reactions on the current slide.',
    emoji: '🎉',
    defaultProps: {
      emojis: ['👍', '❤️', '👏', '🎉', '🤔', '👀'],
      max_per_minute: 30,
    },
  },
  {
    type: 'nav_vote',
    label: 'Navigation vote',
    description: 'Let the audience vote on the next slide.',
    emoji: '➡️',
    defaultProps: {
      targets: ['Back', 'Forward'],
      window_ms: 15_000,
    },
  },
  {
    type: 'sentiment',
    label: 'Sentiment',
    description: '5-point sentiment bar; results visible to presenter.',
    emoji: '🙂',
    defaultProps: {
      caption: 'How is it going?',
      faces: ['😀', '🙂', '😐', '😕', '😟'],
    },
  },
  {
    type: 'raise_hand',
    label: 'Raise hand',
    description: 'Queue for verbal follow-up. Visible to presenter only.',
    emoji: '✋',
    defaultProps: {
      moderator_drain: true,
      max_queue_depth: 50,
    },
  },
];

export function findWidget(type: AudienceWidgetType): WidgetPaletteEntry | undefined {
  return PARTICIPATION_WIDGETS.find((w) => w.type === type);
}
