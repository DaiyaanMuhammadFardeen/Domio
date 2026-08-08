/**
 * apps/presenter — runtime types.
 *
 * Mirrors the @domio/presenter-session domain types but lives in the
 * Next.js app so we can keep the runtime self-contained and not couple
 * the UI to the service package's exact wire format.
 *
 * The wire format (PresenterSession in services/presenter-session) is
 * kept stable; this is the thin view-side projection.
 */

export type SessionMode = 'live' | 'rehearsal' | 'offline' | 'multi_presenter' | 'failover';

export interface SlideSnapshot {
  slide_id: string;
  slide_index: number;
  title?: string | undefined;
  notes?: string | undefined;
  /** Pointer to the canvas — the runtime hydrates this on the server. */
  thumbnail_url?: string | undefined;
}

export interface PresenterSessionState {
  id: string;
  workspace_id: string;
  deck_id: string;
  presenter_id: string;
  mode: SessionMode;
  state: {
    slide_id: string;
    slide_index: number;
    animation_frame_ms: number;
    last_update_ts: number;
  };
  agenda_timers: AgendaTimer[];
  parking_lot: { pinned_count: number; open_count: number; pinned_ids: string[] };
  display_profile: DisplayProfileSnapshot;
  pip_config: { position: string; shape: string };
  version: number;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
  /** Authoritative slide list (canonical deck order). */
  slides: SlideSnapshot[];
  /** The dynamic plan overlay (order + hidden). Empty when in canonical mode. */
  plan: { order: string[]; hidden: string[] };
}

/** Display profile mirror — what the runtime uses to drive PiP, palette,
 *  and watermark. Mirrors the @domio/presenter-session DisplayProfileSnapshot. */
export interface DisplayProfileSnapshot {
  name: string;
  width: number;
  height: number;
  refresh_hz: number;
  color_profile: 'srgb' | 'display_p3' | 'rec2020';
  hdr: boolean;
  bandwidth_estimate_mbps: number;
  mirror_mode: 'clone' | 'extend' | 'audience_only';
}

export interface AgendaTimer {
  id: string;
  label: string;
  starts_at_ms: number;
  duration_ms: number;
  remaining_ms: number;
  status: 'idle' | 'running' | 'paused' | 'done';
  visible_to: 'presenter' | 'audience' | 'both';
}

export interface PairingInfo {
  /** Active pairing token (signed). */
  token: string;
  /** Deep-link URL the QR encodes. */
  deep_link: string;
  /** Epoch — bumped on rotation. */
  epoch: number;
  /** Time at which the token expires (ms since epoch). */
  expires_at_ms: number;
  /** Currently paired device count (0 when no phone is connected). */
  paired_devices: number;
}

export interface JumpGridEntry {
  slide_id: string;
  slide_index: number;
  title: string;
  thumbnail_url?: string | undefined;
  hidden: boolean;
  is_current: boolean;
}

export interface AdvanceEvent {
  slide_id: string;
  slide_index: number;
  ts: number;
}