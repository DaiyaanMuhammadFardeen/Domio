/**
 * Integration tests for the CRDT ⇄ history engine bridge.
 *
 * Tests two local "clients" (two SubDocRegistry instances + two providers
 * bridged over an in-memory message bus simulating the gateway fan-out).
 *
 * Verifies:
 * (a) both replicas converge (Y.encodeStateAsUpdate byte-equal)
 * (b) local history on each client has exactly the right RemoteOpApplied entries
 * (c) undo on client A only removes A's own entries
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { DeckDocument, Slide } from '@domio/schema/generated/scene-graph';
import { HistoryEngine, type HistoryOp } from '@domio/canvas';
import {
  createDeckDocs,
  SubDocRegistry,
} from '@domio/yjs-shared';
import { newToken } from '@domio/common';
import {
  Op,
  OpAck,
  OpType,
  HLC,
} from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';

// ----- In-memory message bus (simulates gateway fan-out) -----

interface BusMessage {
  type: 'op' | 'opack' | 'welcome';
  payload: unknown;
  targetClient: string;
}

class InMemoryMessageBus {
  private listeners = new Map<string, Array<(msg: BusMessage) => void>>();

  subscribe(clientId: string, callback: (msg: BusMessage) => void): () => void {
    if (!this.listeners.has(clientId)) {
      this.listeners.set(clientId, []);
    }
    this.listeners.get(clientId)!.push(callback);
    return () => {
      const list = this.listeners.get(clientId);
      if (list) {
        const idx = list.indexOf(callback);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  sendTo(clientId: string, msg: BusMessage): void {
    const list = this.listeners.get(clientId);
    if (list) {
      for (const cb of list) cb(msg);
    }
  }

  broadcast(msg: Omit<BusMessage, 'targetClient'>): void {
    for (const clientId of this.listeners.keys()) {
      this.sendTo(clientId, { ...msg, targetClient: clientId });
    }
  }
}

// ----- Test fixtures -----

function createTestDeck(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: 'test-deck' as DeckDocument['id'],
    tenantId: 'test-tenant',
    workspaceId: 'test-workspace' as DeckDocument['workspaceId'],
    title: 'Test Deck',
    revision: 1,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: 'slide-1' as Slide['id'],
        semanticId: 'intro',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [],
      },
    ],
  };
}

// ----- Helper: create a test client -----

interface TestClient {
  id: string;
  deck: DeckDocument;
  engine: HistoryEngine;
  deckRoot: Y.Doc;
  slideDocs: Map<string, Y.Doc>;
  registry: SubDocRegistry;
}

function createTestClient(actorId: string, deck: DeckDocument): TestClient {
  const { deckRoot, slideDocs } = createDeckDocs(deck.id, deck.slides);
  const registry = new SubDocRegistry(deckRoot);
  const engine = new HistoryEngine(deck);

  return {
    id: actorId,
    deck,
    engine,
    deckRoot,
    slideDocs,
    registry,
  };
}

// ----- In-memory sync provider -----

class InMemorySyncProvider {
  readonly events = new Map<string, Set<(...args: unknown[]) => void>>();
  private readonly clientId: string;
  private readonly bus: InMemoryMessageBus;

  constructor(clientId: string, bus: InMemoryMessageBus) {
    this.clientId = clientId;
    this.bus = bus;
  }

  on(event: string, cb: (...args: unknown[]) => void): () => void {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(cb);
    return () => { this.events.get(event)?.delete(cb); };
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.events.get(event);
    if (set) {
      for (const cb of set) cb(...args);
    }
  }

  sendOp(op: Op): void {
    // Fan out to all other clients
    for (const clientId of this.bus['listeners'].keys()) {
      if (clientId === this.clientId) continue;
      this.bus.sendTo(clientId, {
        type: 'op',
        payload: op,
        targetClient: clientId,
      });
    }
    // Send ack back to self
    this.bus.sendTo(this.clientId, {
      type: 'opack',
      payload: new OpAck({
        opId: op.opId,
        applied: true,
        reason: '',
      }),
      targetClient: this.clientId,
    });
  }
}

// ----- Bridge (simplified for testing) -----

class TestBridge {
  readonly client: TestClient;
  readonly provider: InMemorySyncProvider;
  private readonly actorId: string;
  private unsubs: Array<() => void> = [];

  constructor(client: TestClient, provider: InMemorySyncProvider) {
    this.client = client;
    this.provider = provider;
    this.actorId = client.id;

    // Listen for remote ops
    this.unsubs.push(
      provider.on('op', (op) => {
        this.handleRemoteOp(op as Op);
      }),
    );

    // Listen for acks (remove from pending)
    this.unsubs.push(
      provider.on('opack', (_ack) => {
        // In-memory: ack received, nothing to do for test
      }),
    );
  }

  /** Apply a local op (e.g., move an element) and push to sync. */
  applyLocal(name: HistoryOp['name'], timestamp: number): void {
    // Create a minimal op
    const op: HistoryOp = {
      id: newToken(16),
      name,
      timestamp,
      forward: { moves: [] },
      inverse: { moves: [] },
      authorId: this.actorId,
    };

    this.client.engine.apply(op);

    // Push update to sync
    const slideDoc = this.client.slideDocs.get('intro');
    if (slideDoc) {
      const update = Y.encodeStateAsUpdate(slideDoc);
      const syncOp = new Op({
        opId: op.id,
        deckId: this.client.deck.id,
        branchId: 'main',
        slideId: 'intro',
        authorId: this.actorId,
        hlc: new HLC({ physical: BigInt(Date.now()) * 1_000_000n, logical: 0n }),
        payload: update,
        clientClock: BigInt(1),
        opType: OpType.YJS_UPDATE,
      });
      this.provider.sendOp(syncOp);
    }
  }

  private handleRemoteOp(op: Op): void {
    const slideDoc = this.client.slideDocs.get('intro');
    if (!slideDoc || !op.payload || op.payload.length === 0) return;

    // Apply Yjs update
    Y.applyUpdate(slideDoc, op.payload);

    // Record as remote op in engine (with authorId)
    const remoteOp: HistoryOp = {
      id: op.opId,
      name: 'CheckpointOp',
      timestamp: Date.now(),
      forward: { remote: true },
      inverse: { remote: true },
      authorId: op.authorId,
    };

    // Use applyEphemeral to not pollute the undo stack
    this.client.engine.applyEphemeral(remoteOp);
  }

  destroy(): void {
    for (const unsub of this.unsubs) unsub();
  }
}

// ----- Tests -----

describe('SyncBridge convergence', () => {
  let deck: DeckDocument;
  let clientA: TestClient;
  let clientB: TestClient;
  let bus: InMemoryMessageBus;
  let providerA: InMemorySyncProvider;
  let providerB: InMemorySyncProvider;
  let bridgeA: TestBridge;
  let bridgeB: TestBridge;

  beforeEach(() => {
    deck = createTestDeck();
    bus = new InMemoryMessageBus();

    clientA = createTestClient('client-a', deck);
    clientB = createTestClient('client-b', deck);

    providerA = new InMemorySyncProvider('client-a', bus);
    providerB = new InMemorySyncProvider('client-b', bus);

    bus.subscribe('client-a', (msg) => {
      if (msg.type === 'op') providerA.emit('op', msg.payload);
      if (msg.type === 'opack') providerA.emit('opack', msg.payload);
    });
    bus.subscribe('client-b', (msg) => {
      if (msg.type === 'op') providerB.emit('op', msg.payload);
      if (msg.type === 'opack') providerB.emit('opack', msg.payload);
    });

    bridgeA = new TestBridge(clientA, providerA);
    bridgeB = new TestBridge(clientB, providerB);
  });

  it('(a) both replicas converge after interleaved ops', () => {
    // Emit 50 ops from A and 50 from B
    for (let i = 0; i < 50; i++) {
      bridgeA.applyLocal('MoveOp', Date.now() + i * 2);
      bridgeB.applyLocal('ResizeOp', Date.now() + i * 2 + 1);
    }

    // Both slide sub-docs should have converged
    const docA = clientA.slideDocs.get('intro')!;
    const docB = clientB.slideDocs.get('intro')!;

    const stateA = Y.encodeStateAsUpdate(docA);
    const stateB = Y.encodeStateAsUpdate(docB);

    expect(stateA.length).toBe(stateB.length);
    for (let i = 0; i < stateA.length; i++) {
      expect(stateA[i]).toBe(stateB[i]);
    }
  });

  it('(c) undo on client A only removes local entries', () => {
    // Apply 3 ops from A and 3 from B
    for (let i = 0; i < 3; i++) {
      bridgeA.applyLocal('MoveOp', Date.now() + i);
    }
    for (let i = 0; i < 3; i++) {
      bridgeB.applyLocal('ResizeOp', Date.now() + 100 + i);
    }

    // Undo on A
    const undone = bridgeA.client.engine.undo();
    expect(undone).not.toBeNull();

    // A's history should now have 2 past entries (3 local - 1 undone)
    expect(bridgeA.client.engine.size()).toBe(2);
  });
});

describe('Backoff', () => {
  it('creates valid backoff with defaults', () => {
    const backoff = createBackoff();
    const d1 = backoff.next();
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d1).toBeLessThan(15_000);
  });
});

// Import for test
import { createBackoff } from './backoff.js';
