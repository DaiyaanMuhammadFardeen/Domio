/**
 * Presence provider — syncs cursor, selection, viewport, and peer state
 * through the realtime gateway's Presence protocol.
 *
 * Wraps yjs-shared's Awareness helpers and maps between the proto-level
 * Presence messages and the internal PresenceState type.
 */

import {
  Presence as PresenceMsg,
  PeerJoined,
  PeerLeft,
  PresenceKind,
} from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';
import {
  createAwareness,
  updatePresence,
  cursorColorFor,
  type PresenceState,
} from '@domio/yjs-shared';
import * as Y from 'yjs';
import type { SyncProvider } from './provider.js';

// ----- Peer tracking -----

export interface RemotePeer {
  actorId: string;
  sessionId: string;
  state: PresenceState;
  color: string;
  lastSeen: number;
}

export interface PresenceEvents {
  'peer-joined': (peer: RemotePeer) => void;
  'peer-left': (actorId: string) => void;
  'peers-changed': (peers: RemotePeer[]) => void;
}

// ----- Presence provider -----

export interface RemotePresenceProviderOptions {
  /** The actor (user) ID. */
  actorId: string;
  /** The session ID. */
  sessionId: string;
  /** The sync provider for sending/receiving. */
  provider: SyncProvider;
}

export class RemotePresenceProvider {
  private readonly actorId: string;
  private readonly provider: SyncProvider;
  private readonly awareness;
  private readonly remotePeers = new Map<string, RemotePeer>();
  private readonly listeners = new Set<(...args: unknown[]) => void>();
  private unsubs: Array<() => void> = [];

  constructor(options: RemotePresenceProviderOptions) {
    this.actorId = options.actorId;
    this.provider = options.provider;
    // Create a dummy doc just for awareness state management
    this.awareness = createAwareness(new Y.Doc());
  }

  /** Initialize — wire up provider events for presence. */
  init(): void {
    // Listen for presence updates from the gateway
    this.unsubs.push(
      this.provider.on('presence', (presence) => {
        if (presence.actorId === this.actorId) return;
        this.handlePresence(presence);
      }),
    );

    // Listen for peer join/leave
    this.unsubs.push(
      this.provider.on('peer-joined', (peer) => {
        if (peer.actorId === this.actorId) return;
        this.handlePeerJoined(peer);
      }),
    );

    this.unsubs.push(
      this.provider.on('peer-left', (peer) => {
        if (peer.actorId === this.actorId) return;
        this.handlePeerLeft(peer);
      }),
    );
  }

  /** Update local presence state and broadcast. */
  updateLocalPresence(state: Partial<PresenceState>): void {
    updatePresence(this.awareness, this.actorId, state);
    const stateMap = new Map<string, string>();
    if (state.name !== undefined) stateMap.set('name', state.name);
    if (state.cursor !== undefined) stateMap.set('cursor', JSON.stringify(state.cursor));
    if (state.selection !== undefined) stateMap.set('selection', JSON.stringify(state.selection));
    if (state.viewport !== undefined) stateMap.set('viewport', JSON.stringify(state.viewport));
    if (state.activeSlide !== undefined && state.activeSlide !== null) stateMap.set('activeSlide', state.activeSlide);
    this.provider.sendPresence(stateMap, PresenceKind.UPDATE);
  }

  /** Send a join announcement. */
  sendJoin(): void {
    const stateMap = new Map<string, string>();
    stateMap.set('name', this.actorId);
    this.provider.sendPresence(stateMap, PresenceKind.JOIN);
  }

  /** Send a leave announcement. */
  sendLeave(): void {
    const stateMap = new Map<string, string>();
    this.provider.sendPresence(stateMap, PresenceKind.LEAVE);
  }

  /** Get all remote peers. */
  getRemotePeers(): RemotePeer[] {
    return Array.from(this.remotePeers.values());
  }

  /** Get a specific peer's color. */
  peerColor(actorId: string): string {
    return cursorColorFor(actorId);
  }

  /** Subscribe to presence events. */
  on<K extends keyof PresenceEvents>(
    _event: K,
    cb: PresenceEvents[K],
  ): () => void {
    const wrapped = cb as (...args: unknown[]) => void;
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  }

  /** Cleanup. */
  destroy(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.remotePeers.clear();
  }

  // ----- Internals -----

  private handlePresence(presence: PresenceMsg): void {
    const actorId = presence.actorId;

    const state: PresenceState = {};
    const rawState = presence.state;
    if (rawState['name']) state.name = rawState['name'];
    if (rawState['cursor']) {
      try {
        const parsed = JSON.parse(rawState['cursor'] as string) as { x: number; y: number } | null;
        state.cursor = parsed ?? null;
      } catch { /* skip */ }
    }
    if (rawState['selection']) {
      try {
        state.selection = JSON.parse(rawState['selection'] as string) as string[];
      } catch { /* skip */ }
    }
    if (rawState['viewport']) {
      try {
        const parsed = JSON.parse(rawState['viewport'] as string) as { x: number; y: number; zoom: number } | null;
        state.viewport = parsed ?? null;
      } catch { /* skip */ }
    }
    if (rawState['activeSlide']) state.activeSlide = rawState['activeSlide'];

    const peer: RemotePeer = {
      actorId,
      sessionId: presence.sessionId,
      state,
      color: cursorColorFor(actorId),
      lastSeen: Date.now(),
    };

    this.remotePeers.set(actorId, peer);
    this.emit('peers-changed', this.getRemotePeers());
  }

  private handlePeerJoined(peer: PeerJoined): void {
    if (this.remotePeers.has(peer.actorId)) return;
    const remotePeer: RemotePeer = {
      actorId: peer.actorId,
      sessionId: peer.sessionId,
      state: {},
      color: cursorColorFor(peer.actorId),
      lastSeen: Date.now(),
    };
    this.remotePeers.set(peer.actorId, remotePeer);
    this.emit('peer-joined', remotePeer);
    this.emit('peers-changed', this.getRemotePeers());
  }

  private handlePeerLeft(peer: PeerLeft): void {
    this.remotePeers.delete(peer.actorId);
    this.emit('peer-left', peer.actorId);
    this.emit('peers-changed', this.getRemotePeers());
  }

  private emit(_event: string, ...args: unknown[]): void {
    for (const listener of this.listeners) {
      listener(...args);
    }
  }
}
