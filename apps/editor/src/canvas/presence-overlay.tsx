'use client';

/**
 * Presence overlay — renders the avatar stack (top-right), remote cursor
 * overlays, and "follow user" pinning.  Per doc B.4:
 *
 * - Avatar stack: small colored circles with initials in the top-right
 *   corner.  Clicking an avatar enters "follow" mode which pins the local
 *   viewport to that remote user's world position.
 * - Cursor overlays: a small colored triangle + name label for each remote
 *   peer whose cursor position is known.
 * - Remote pings: renders an expanding ring at the remote user's world
 *   position when they emit a ping (Cmd+Shift+P).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { cursorColorFor } from '@domio/yjs-shared';
import type { RemotePeer } from '../sync/presence.js';

// ----- Types -----

export interface PingEvent {
  id: string;
  authorId: string;
  cursor: { x: number; y: number };
  startAt: number;
  durationMs: number;
}

export interface PresenceOverlayProps {
  /** All remote peers currently visible. */
  peers: RemotePeer[];
  /** Ping events to render. */
  pings: PingEvent[];
  /** The local user's actor ID (excluded from avatar stack). */
  localActorId: string;
  /** Called when "follow user" is activated.  `null` means unfollow. */
  onFollowUser: (actorId: string | null) => void;
  /** Currently followed actor ID (or null). */
  followedActorId: string | null;
  /** Duration for ping ring animation (ms). */
  pingDurationMs?: number;
}

// ----- Helpers -----

/** Extract up to 2 initials from a user name or actor ID. */
function initials(name: string | undefined, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ----- Sub-components -----

function AvatarChip({
  peer,
  isFollowed,
  onClick,
}: {
  peer: RemotePeer;
  isFollowed: boolean;
  onClick: () => void;
}): ReactElement {
  const color = peer.color ?? cursorColorFor(peer.actorId);
  const name = peer.state.name ?? peer.actorId;
  const init = initials(name, peer.actorId);

  return (
    <button
      type="button"
      title={isFollowed ? `Unfollow ${name}` : `Follow ${name}`}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        backgroundColor: color,
        color: '#fff',
        border: isFollowed ? '2px solid #fff' : '2px solid transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: isFollowed ? `0 0 0 2px ${color}` : 'none',
        padding: 0,
        lineHeight: 1,
      }}
    >
      {init}
    </button>
  );
}

function CursorOverlay({ peer }: { peer: RemotePeer }): ReactElement | null {
  const cursor = peer.state.cursor;
  if (!cursor) return null;

  const color = peer.color ?? cursorColorFor(peer.actorId);
  const name = peer.state.name ?? peer.actorId;

  return (
    <div
      style={{
        position: 'absolute',
        left: cursor.x,
        top: cursor.y,
        pointerEvents: 'none',
        zIndex: 900,
      }}
    >
      {/* Cursor triangle */}
      <svg width="16" height="20" viewBox="0 0 16 20" style={{ display: 'block' }}>
        <path
          d="M0 0 L16 12 L8 12 L12 20 L8 18 L4 12 L0 16 Z"
          fill={color}
          stroke="#fff"
          strokeWidth="1"
        />
      </svg>
      {/* Name label */}
      <span
        style={{
          display: 'inline-block',
          marginTop: 2,
          marginLeft: 12,
          padding: '1px 4px',
          backgroundColor: color,
          color: '#fff',
          fontSize: 10,
          lineHeight: '14px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </div>
  );
}

function PingRing({
  ping,
  durationMs,
}: {
  ping: PingEvent;
  durationMs: number;
}): ReactElement | null {
  const [elapsed, setElapsed] = useState(() => Date.now() - ping.startAt);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const now = Date.now();
      const e = now - ping.startAt;
      if (e >= durationMs) return;
      setElapsed(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ping.startAt, durationMs]);

  if (elapsed >= durationMs) return null;

  const progress = elapsed / durationMs;
  const radius = 8 + progress * 40;
  const opacity = 1 - progress;

  return (
    <div
      style={{
        position: 'absolute',
        left: ping.cursor.x - radius,
        top: ping.cursor.y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: '50%',
        border: '2px solid rgba(255, 80, 80, 0.8)',
        opacity,
        pointerEvents: 'none',
        zIndex: 899,
      }}
    />
  );
}

// ----- Main component -----

export function PresenceOverlay({
  peers,
  pings,
  localActorId,
  onFollowUser,
  followedActorId,
  pingDurationMs = 1200,
}: PresenceOverlayProps): ReactElement {
  const remotePeers = useMemo(
    () => peers.filter((p) => p.actorId !== localActorId),
    [peers, localActorId],
  );

  const handleAvatarClick = useCallback(
    (actorId: string) => {
      if (followedActorId === actorId) {
        onFollowUser(null);
      } else {
        onFollowUser(actorId);
      }
    },
    [followedActorId, onFollowUser],
  );

  return (
    <>
      {/* Avatar stack — top-right corner */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          zIndex: 1100,
        }}
      >
        {remotePeers.map((peer) => (
          <AvatarChip
            key={peer.actorId}
            peer={peer}
            isFollowed={followedActorId === peer.actorId}
            onClick={() => handleAvatarClick(peer.actorId)}
          />
        ))}
      </div>

      {/* Cursor overlays */}
      {remotePeers.map((peer) => (
        <CursorOverlay key={peer.actorId} peer={peer} />
      ))}

      {/* Ping rings */}
      {pings.map((ping) => (
        <PingRing key={ping.id} ping={ping} durationMs={pingDurationMs} />
      ))}
    </>
  );
}
