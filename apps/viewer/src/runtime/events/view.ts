/**
 * apps/viewer — analytics emit helpers (Phase 17).
 *
 * Thin wrappers around @domio/analytics-sdk that stamp the per-app
 * defaults (source_app='viewer', device_class, country_iso, etc.).
 * The actual SDK is initialized once per app boot via
 * apps/viewer/src/runtime/events/init.ts which is added in W1.
 *
 * The helpers here are called from the deck runtime after CRDT apply
 * (apps/viewer/src/runtime/transport/index.ts), so the viewer emits
 * view, interaction, scroll_progress, and scroll_pause events without
 * any per-callbookkeeping.
 *
 * Reuses: @domio/analytics-sdk (signing + batching + PII strip already
 * implemented there). Reuses: @domio/prototype-recorder (legacy event
 * recorder path; the analytics-sdk transparently forwards to it when
 * the FEATURE_ANALYTICS_LEGACY flag is on).
 */

import type {
  ViewEvent,
  InteractionEvent,
  ScrollProgressEvent,
  ScrollPauseEvent,
  InteractionKind,
  AnalyticsClient,
} from '@domio/analytics-sdk';

export interface ViewerEmitContext {
  /** The live AnalyticsClient instance. Defaults to module-level singleton. */
  client?: AnalyticsClient;
  deck_id: string;
  slide_id: string;
  viewer_id_key: string;
  session_id?: string;
  share_link_id?: string;
  experiment_id?: string;
  variant_id?: string;
  scene_node_id?: string;
}

/**
 * Emit a view event when the viewer lands on a slide. Should be called
 * after CRDT apply completes so the slide_id is the stable scene-graph
 * node id (not a transient index).
 */
export function emitView(ctx: ViewerEmitContext, overrides: Partial<ViewEvent> = {}): void {
  const client = ctx.client;
  if (!client) return;
  // Build the event without undefined fields so exactOptionalPropertyTypes
  // is satisfied.
  const event: {
    workspace_id: string;
    deck_id: string;
    slide_id: string;
    viewer_id_key: string;
    session_id?: string;
    share_link_id?: string;
    experiment_id?: string;
    variant_id?: string;
    scene_node_id?: string;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    slide_id: ctx.slide_id,
    viewer_id_key: ctx.viewer_id_key,
  };
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.share_link_id !== undefined) event.share_link_id = ctx.share_link_id;
  if (ctx.experiment_id !== undefined) event.experiment_id = ctx.experiment_id;
  if (ctx.variant_id !== undefined) event.variant_id = ctx.variant_id;
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  client.emitView({ ...event, ...overrides } as Parameters<AnalyticsClient['emitView']>[0]);
}

/**
 * Emit an interaction event. `kind` is the controlled vocabulary from
 * contracts/events/ingest/interaction.json.
 *
 * Note: workspace_id is stamped by the SDK from AnalyticsContext — the
 * caller doesn't pass it. The empty-string workspace_id above is a
 * placeholder; the SDK reads the live context value.
 */
export function emitInteraction(
  ctx: ViewerEmitContext,
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
  // is satisfied.
  const event: {
    workspace_id: string;
    deck_id: string;
    slide_id: string;
    viewer_id_key: string;
    interaction_kind: InteractionKind;
    scene_node_id?: string;
    session_id?: string;
    share_link_id?: string;
    experiment_id?: string;
    variant_id?: string;
    value_numeric?: number;
    value_text?: string;
    interaction_data?: string;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    slide_id: ctx.slide_id,
    viewer_id_key: ctx.viewer_id_key,
    interaction_kind: kind,
  };
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.share_link_id !== undefined) event.share_link_id = ctx.share_link_id;
  if (ctx.experiment_id !== undefined) event.experiment_id = ctx.experiment_id;
  if (ctx.variant_id !== undefined) event.variant_id = ctx.variant_id;
  if (data.value_numeric !== undefined) event.value_numeric = data.value_numeric;
  if (data.value_text !== undefined) event.value_text = data.value_text;
  if (data.interaction_data !== undefined) event.interaction_data = data.interaction_data;
  client.emitInteraction(event as Parameters<AnalyticsClient['emitInteraction']>[0]);
}

/**
 * Emit a scroll_progress event. The viewer runtime should call this at
 * most every 250ms while the user scrolls (we rate-limit at the call
 * site — the SDK imposes no rate limit on its own).
 */
export function emitScrollProgress(
  ctx: ViewerEmitContext,
  args: {
    dwell_ms: number;
    scroll_depth: number;
    tile_x: number;
    tile_y: number;
    viewport_height_px: number;
    scroll_velocity_px_per_s?: number | undefined;
  },
): boolean {
  const client = ctx.client;
  if (!client) return false;
  const event: {
    workspace_id: string;
    deck_id: string;
    slide_id: string;
    viewer_id_key: string;
    dwell_ms: number;
    scroll_depth: number;
    tile_x: number;
    tile_y: number;
    viewport_height_px: number;
    scene_node_id?: string;
    session_id?: string;
    share_link_id?: string;
    experiment_id?: string;
    variant_id?: string;
    scroll_velocity_px_per_s?: number;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    slide_id: ctx.slide_id,
    viewer_id_key: ctx.viewer_id_key,
    dwell_ms: args.dwell_ms,
    scroll_depth: args.scroll_depth,
    tile_x: args.tile_x,
    tile_y: args.tile_y,
    viewport_height_px: args.viewport_height_px,
  };
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.share_link_id !== undefined) event.share_link_id = ctx.share_link_id;
  if (ctx.experiment_id !== undefined) event.experiment_id = ctx.experiment_id;
  if (ctx.variant_id !== undefined) event.variant_id = ctx.variant_id;
  if (args.scroll_velocity_px_per_s !== undefined)
    event.scroll_velocity_px_per_s = args.scroll_velocity_px_per_s;
  return client.emitScrollProgress(event as Parameters<AnalyticsClient['emitScrollProgress']>[0]);
}

/**
 * Emit a scroll_pause event when the scroll stalls for >=750ms.
 * Privacy floor (<5 impressions) is enforced in the rollup.
 */
export function emitScrollPause(
  ctx: ViewerEmitContext,
  args: {
    dwell_ms: number;
    scroll_depth?: number | undefined;
    tile_x: number;
    tile_y: number;
    viewport_height_px: number;
  },
): boolean {
  const client = ctx.client;
  if (!client) return false;
  const event: {
    workspace_id: string;
    deck_id: string;
    slide_id: string;
    viewer_id_key: string;
    dwell_ms: number;
    tile_x: number;
    tile_y: number;
    viewport_height_px: number;
    scene_node_id?: string;
    session_id?: string;
    share_link_id?: string;
    experiment_id?: string;
    variant_id?: string;
    scroll_depth?: number;
  } = {
    workspace_id: '',
    deck_id: ctx.deck_id,
    slide_id: ctx.slide_id,
    viewer_id_key: ctx.viewer_id_key,
    dwell_ms: args.dwell_ms,
    tile_x: args.tile_x,
    tile_y: args.tile_y,
    viewport_height_px: args.viewport_height_px,
  };
  if (ctx.scene_node_id !== undefined) event.scene_node_id = ctx.scene_node_id;
  if (ctx.session_id !== undefined) event.session_id = ctx.session_id;
  if (ctx.share_link_id !== undefined) event.share_link_id = ctx.share_link_id;
  if (ctx.experiment_id !== undefined) event.experiment_id = ctx.experiment_id;
  if (ctx.variant_id !== undefined) event.variant_id = ctx.variant_id;
  if (args.scroll_depth !== undefined) event.scroll_depth = args.scroll_depth;
  return client.emitScrollPause(event as Parameters<AnalyticsClient['emitScrollPause']>[0]);
}

/**
 * Convenience union: the viewer emits view + interaction + scroll events.
 * The presenter / join-web apps use their own emitters.
 */
export type ViewerEvent = ViewEvent | InteractionEvent | ScrollProgressEvent | ScrollPauseEvent;
