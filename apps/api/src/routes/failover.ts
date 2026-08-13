/**
 * Failover routes — primary/standby election + health watch.
 *
 * Phase 15 W12. Two surfaces:
 *   GET  /v1/election           — read current election state.
 *   POST /v1/election/claim     — try to claim primary (standby → primary).
 *   POST /v1/election/heartbeat — bump last_heartbeat_at_ms for self.
 *   POST /v1/election/step-down — voluntary primary step-down.
 *   POST /v1/election/replay    — drain the standby replay buffer.
 *
 * For now the underlying Election + ReplayBuffer are in-memory singletons
 * keyed by `(workspace_id, session_id)`. Production wires to Postgres
 * once the unified store lands in Phase 21.
 */

import { Hono } from 'hono';
import {
  Election,
  InMemoryElectionStore,
  ReplayBuffer,
  type FailoverRole,
} from '@domio/presenter-session';

type ElectionKey = string;

interface CandidateState {
  election: Election;
  buffer: ReplayBuffer<{ capturedAtMs: number; op_id: string; payload: unknown }>;
  role: FailoverRole;
}

const candidates = new Map<ElectionKey, CandidateState>();
const CANDIDATE_ID = process.env.CANDIDATE_ID ?? 'api-pod-local';

function keyFor(workspaceId: string, sessionId: string): ElectionKey {
  return `${workspaceId}::${sessionId}`;
}

function getOrCreate(key: ElectionKey, candidateId: string): CandidateState {
  let state = candidates.get(key);
  if (!state) {
    state = {
      election: new Election({ candidateId, store: new InMemoryElectionStore() }),
      buffer: new ReplayBuffer(),
      role: 'disabled',
    };
    candidates.set(key, state);
  }
  return state;
}

type HeaderRecord = Record<string, string | string[] | undefined>;
function pickHeader(headers: HeaderRecord, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

const failover = new Hono();

failover.get('/v1/election', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const election = await state.election.load();
  return c.json({
    ...election,
    candidate_id: CANDIDATE_ID,
    role: state.role,
    buffer_size: state.buffer.size(),
  });
});

failover.post('/v1/election/claim', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const res = await state.election.tryClaim();
  state.role = res.state.role;
  return c.json({
    claimed: res.claimed,
    state: res.state,
    role: state.role,
    buffer_size: state.buffer.size(),
  });
});

failover.post('/v1/election/heartbeat', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const election = await state.election.heartbeat();
  return c.json({ state: election, role: state.role });
});

failover.post('/v1/election/step-down', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const election = await state.election.stepDown();
  state.role = election.role;
  return c.json({ state: election, role: state.role });
});

failover.post('/v1/election/buffer', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const body = (await c.req.json().catch(() => ({}))) as { op_id?: string; payload?: unknown };
  if (!body.op_id) {
    return c.json({ error: 'VALIDATION', message: 'op_id is required' }, 400);
  }
  const size = state.buffer.push({
    capturedAtMs: Date.now(),
    op_id: body.op_id,
    payload: body.payload ?? null,
  });
  return c.json({ buffer_size: size, role: state.role });
});

failover.post('/v1/election/replay', async (c) => {
  const workspaceId = pickHeader(c.req.header(), 'x-workspace-id') ?? 'default';
  const sessionId = c.req.query('session_id') ?? 'default';
  const state = getOrCreate(keyFor(workspaceId, sessionId), CANDIDATE_ID);
  const drained = state.buffer.drain();
  return c.json({ replayed: drained, count: drained.length, role: state.role });
});

export { failover as failoverRoutes };
