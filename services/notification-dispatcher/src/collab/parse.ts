/**
 * Notification dispatcher — collaboration event parser.
 *
 * Parses a raw JSON string into a validated CollabEventEnvelope.
 * Throws on missing required fields so the caller can fail fast
 * and log the malformed message.
 */

import type { CollabEventEnvelope } from './types.js';

/**
 * parseCollabEvent parses + validates a raw JSON string into a
 * CollabEventEnvelope. Throws if required fields are missing or
 * the JSON is malformed.
 */
export function parseCollabEvent(raw: string): CollabEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('collab: malformed JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('collab: payload is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.event_type !== 'string' || !obj.event_type) {
    throw new Error('collab: missing or invalid event_type');
  }
  if (typeof obj.workspace_id !== 'string' || !obj.workspace_id) {
    throw new Error('collab: missing or invalid workspace_id');
  }
  if (typeof obj.timestamp !== 'number') {
    throw new Error('collab: missing or invalid timestamp');
  }
  if (typeof obj.payload !== 'object' || obj.payload === null) {
    throw new Error('collab: missing or invalid payload');
  }

  return {
    event_type: obj.event_type,
    workspace_id: obj.workspace_id,
    timestamp: obj.timestamp,
    payload: obj.payload as Record<string, unknown>,
  };
}
