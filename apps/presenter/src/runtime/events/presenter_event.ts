/**
 * apps/presenter — analytics emit helpers (Phase 17).
 *
 * Wraps the @domio/analytics-sdk emitPresenterEvent helper with the
 * presenter-specific defaults. Called from apps/presenter/src/runtime/
 * {session,deck}/index.ts after each presenter-mode action.
 */

import type { PresenterEvent, PresenterAction, AnalyticsClient } from '@domio/analytics-sdk';

export interface PresenterEmitContext {
  client?: AnalyticsClient;
  deck_id: string;
  slide_id?: string;
  presenter_user_id: string;
  session_id?: string;
  scene_node_id?: string;
}

export function emitPresenterEvent(
  ctx: PresenterEmitContext,
  action: PresenterAction,
  data: {
    action_data?: string | undefined;
    co_presenter_user_id?: string | undefined;
    annotation_id?: string | undefined;
  } = {},
): void {
  const client = ctx.client;
  if (!client) return;
  // Build the event without undefined fields so exactOptionalPropertyTypes
  // is satisfied.
  const event: {
    workspace_id: string;
    deck_id: string;
    slide_id: string;
    presenter_user_id: string;
    action: PresenterAction;
    session_id?: string;
    scene_node_id?: string;
    action_data?: string;
    co_presenter_user_id?: string;
    annotation_id?: string;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    slide_id: ctx.slide_id ?? '',
    presenter_user_id: ctx.presenter_user_id,
    action,
  };
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  if (data.action_data !== undefined) event.action_data = data.action_data;
  if (data.co_presenter_user_id !== undefined)
    event.co_presenter_user_id = data.co_presenter_user_id;
  if (data.annotation_id !== undefined) event.annotation_id = data.annotation_id;
  client.emitPresenterEvent(event as Parameters<AnalyticsClient['emitPresenterEvent']>[0]);
}

/** Slide advance / regress / jump — most common events. */
export const presenterEmitHelpers = {
  slideAdvance: (ctx: PresenterEmitContext, slideId: string) =>
    emitPresenterEvent(ctx, 'slide_advance', {
      action_data: JSON.stringify({ slide_id: slideId }),
    }),
  slideRegress: (ctx: PresenterEmitContext, slideId: string) =>
    emitPresenterEvent(ctx, 'slide_regress', {
      action_data: JSON.stringify({ slide_id: slideId }),
    }),
  slideJump: (ctx: PresenterEmitContext, fromSlideId: string, toSlideId: string) =>
    emitPresenterEvent(ctx, 'slide_jump', {
      action_data: JSON.stringify({ from: fromSlideId, to: toSlideId }),
    }),
  sessionStart: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'session_start'),
  sessionPause: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'session_pause'),
  sessionResume: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'session_resume'),
  sessionEnd: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'session_end'),
  hudOpen: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'hud_open'),
  hudClose: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'hud_close'),
  spotlightOn: (ctx: PresenterEmitContext, viewerIdKey: string) =>
    emitPresenterEvent(ctx, 'spotlight_on', {
      action_data: JSON.stringify({ viewer_id_key: viewerIdKey }),
    }),
  spotlightOff: (ctx: PresenterEmitContext) => emitPresenterEvent(ctx, 'spotlight_off'),
  annotationCreate: (ctx: PresenterEmitContext, annotationId: string) =>
    emitPresenterEvent(ctx, 'annotation_create', { annotation_id: annotationId }),
  annotationDelete: (ctx: PresenterEmitContext, annotationId: string) =>
    emitPresenterEvent(ctx, 'annotation_delete', { annotation_id: annotationId }),
  coPresenterInvite: (ctx: PresenterEmitContext, userId: string) =>
    emitPresenterEvent(ctx, 'co_presenter_invite', { co_presenter_user_id: userId }),
  coPresenterKick: (ctx: PresenterEmitContext, userId: string) =>
    emitPresenterEvent(ctx, 'co_presenter_kick', { co_presenter_user_id: userId }),
};

export type PresenterEventPayload = PresenterEvent;
