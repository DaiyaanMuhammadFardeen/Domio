/**
 * apps/join-web — analytics emit helpers (Phase 17).
 *
 * join-web is the audience-side companion to apps/presenter; it
 * captures poll votes, qa_items, reactions, raise_hand, and feedback
 * response. These are the audience-facing interactions that drive
 * #175 (live session delivery analytics) and feed the presenter's HUD
 * (<1s p95).
 *
 * Reuses: @domio/analytics-sdk emitInteraction with the
 * interaction_kind controlled vocabulary.
 */

import type { InteractionEvent, InteractionKind, AnalyticsClient } from '@domio/analytics-sdk';

export interface JoinEmitContext {
  client?: AnalyticsClient;
  deck_id: string;
  slide_id?: string;
  viewer_id_key: string;
  session_id?: string;
  share_link_id?: string;
  scene_node_id?: string;
}

export function emitJoinInteraction(
  ctx: JoinEmitContext,
  kind: InteractionKind,
  data: {
    value_numeric?: number | undefined;
    value_text?: string | undefined;
    interaction_data?: string | undefined;
  } = {},
): void {
  const client = ctx.client;
  if (!client) return;
  // Build the event without undefined fields so exactOptionalPropertyTypes
  // is satisfied — when value_text/value_numeric/interaction_data are
  // absent we omit the key rather than serializing `undefined`.
  const event: {
    workspace_id: string;
    deck_id: string;
    viewer_id_key: string;
    interaction_kind: InteractionKind;
    slide_id?: string;
    scene_node_id?: string;
    session_id?: string;
    share_link_id?: string;
    value_numeric?: number;
    value_text?: string;
    interaction_data?: string;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    viewer_id_key: ctx.viewer_id_key,
    interaction_kind: kind,
  };
  if (ctx.slide_id !== undefined) event.slide_id = ctx.slide_id;
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.share_link_id !== undefined) event.share_link_id = ctx.share_link_id;
  if (data.value_numeric !== undefined) event.value_numeric = data.value_numeric;
  if (data.value_text !== undefined) event.value_text = data.value_text;
  if (data.interaction_data !== undefined) event.interaction_data = data.interaction_data;
  // Cast at the boundary: the SDK accepts an Omit<InteractionEvent, ...>
  // and we have satisfied the required fields above.
  client.emitInteraction(event as Parameters<AnalyticsClient['emitInteraction']>[0]);
}

/**
 * High-level audience-facing helpers.
 */
export const joinEmitHelpers = {
  pollVote: (ctx: JoinEmitContext, pollId: string, choiceId: string) =>
    emitJoinInteraction(ctx, 'poll_vote', {
      interaction_data: JSON.stringify({ poll_id: pollId, choice_id: choiceId }),
    }),
  qaItem: (ctx: JoinEmitContext, text: string) =>
    emitJoinInteraction(ctx, 'qa_item', {
      value_text: text.slice(0, 2000),
    }),
  reaction: (ctx: JoinEmitContext, emoji: string) =>
    emitJoinInteraction(ctx, 'reaction', {
      interaction_data: JSON.stringify({ emoji }),
    }),
  navVote: (ctx: JoinEmitContext, choiceId: string) =>
    emitJoinInteraction(ctx, 'nav_vote', {
      interaction_data: JSON.stringify({ choice_id: choiceId }),
    }),
  sentimentInput: (ctx: JoinEmitContext, value: number) =>
    emitJoinInteraction(ctx, 'sentiment_input', { value_numeric: value }),
  raiseHand: (ctx: JoinEmitContext) => emitJoinInteraction(ctx, 'raise_hand'),
  quizAttempt: (ctx: JoinEmitContext, quizId: string, choiceId: string, correct: boolean) =>
    emitJoinInteraction(ctx, 'quiz_attempt', {
      interaction_data: JSON.stringify({ quiz_id: quizId, choice_id: choiceId, correct }),
    }),
  feedbackResponse: (ctx: JoinEmitContext, stars: number, text?: string) =>
    emitJoinInteraction(ctx, 'feedback_response', {
      value_numeric: stars,
      value_text: text?.slice(0, 4000),
    }),
  ctaClick: (ctx: JoinEmitContext, ctaId: string) =>
    emitJoinInteraction(ctx, 'cta_click', {
      interaction_data: JSON.stringify({ cta_id: ctaId }),
    }),
};

export type JoinEvent = InteractionEvent;
