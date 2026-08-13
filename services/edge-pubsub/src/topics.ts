/**
 * @domio/edge-pubsub — topic conventions.
 *
 * Phase 16 W1. Mirrors `services/realtime-gateway/internal/topics`
 * but for the audience side. Subjects are hierarchical and bound to
 * the shard so the WS gateway can subscribe to one shard without
 * pulling the others.
 *
 *   realtime.session.{session_id}.participant  — join/leave/rejoin
 *   realtime.session.{session_id}.poll         — poll_vote events
 *   realtime.session.{session_id}.word_cloud   — word-cloud submits
 *   realtime.session.{session_id}.qa           — qa_submit events
 *   realtime.session.{session_id}.quiz         — quiz_answer events
 *   realtime.session.{session_id}.reaction     — reaction emojis
 *   realtime.session.{session_id}.nav          — nav_vote
 *   realtime.session.{session_id}.sentiment    — sentiment_vote
 *   realtime.session.{session_id}.raise_hand   — raise-hand queue
 *   realtime.session.{session_id}.lifecycle    — started/idle/ended
 *   realtime.session.{session_id}.whisper      — presenter-only
 *
 * Sharded variants prepend `.shard.{N}` so the gateway can route.
 */

export type AudienceTopic =
  | 'participant'
  | 'poll'
  | 'word_cloud'
  | 'qa'
  | 'quiz'
  | 'reaction'
  | 'nav'
  | 'sentiment'
  | 'raise_hand'
  | 'lifecycle'
  | 'whisper';

export function topicFor(input: {
  session_id: string;
  topic: AudienceTopic;
  shard_index?: number;
}): string {
  const base = `realtime.session.${input.session_id}.${input.topic}`;
  if (typeof input.shard_index === 'number') {
    return `${base}.shard.${input.shard_index}`;
  }
  return base;
}

export function shardFromTopic(topic: string): number | null {
  const m = /\.shard\.(\d+)$/.exec(topic);
  if (!m || !m[1]) return null;
  return Number(m[1]);
}

export function sessionFromTopic(topic: string): string | null {
  const m = /^realtime\.session\.([^.]+)\./.exec(topic);
  if (!m || !m[1]) return null;
  return m[1];
}
