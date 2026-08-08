import { describe, it, expect } from 'vitest';
import { parseCollabEvent } from './parse.js';

describe('parseCollabEvent', () => {
  it('parses a valid envelope', () => {
    const raw = JSON.stringify({
      event_type: 'comment.mentioned',
      workspace_id: 'w-1',
      timestamp: 1700000000000,
      payload: { comment_id: 'c-1', deck_id: 'd-1', body_md: 'hello', mentioned_type: 'user', mentioned_id: 'u-1' },
    });
    const env = parseCollabEvent(raw);
    expect(env.event_type).toBe('comment.mentioned');
    expect(env.workspace_id).toBe('w-1');
    expect(env.timestamp).toBe(1700000000000);
    expect(env.payload.comment_id).toBe('c-1');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseCollabEvent('not json')).toThrow('malformed JSON');
  });

  it('throws on non-object payload', () => {
    expect(() => parseCollabEvent('"string"')).toThrow('not an object');
  });

  it('throws when event_type is missing', () => {
    const raw = JSON.stringify({ workspace_id: 'w-1', timestamp: 1, payload: {} });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid event_type');
  });

  it('throws when event_type is empty', () => {
    const raw = JSON.stringify({ event_type: '', workspace_id: 'w-1', timestamp: 1, payload: {} });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid event_type');
  });

  it('throws when workspace_id is missing', () => {
    const raw = JSON.stringify({ event_type: 'x', timestamp: 1, payload: {} });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid workspace_id');
  });

  it('throws when timestamp is missing', () => {
    const raw = JSON.stringify({ event_type: 'x', workspace_id: 'w-1', payload: {} });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid timestamp');
  });

  it('throws when timestamp is not a number', () => {
    const raw = JSON.stringify({ event_type: 'x', workspace_id: 'w-1', timestamp: 'not-a-number', payload: {} });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid timestamp');
  });

  it('throws when payload is missing', () => {
    const raw = JSON.stringify({ event_type: 'x', workspace_id: 'w-1', timestamp: 1 });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid payload');
  });

  it('throws when payload is null', () => {
    const raw = JSON.stringify({ event_type: 'x', workspace_id: 'w-1', timestamp: 1, payload: null });
    expect(() => parseCollabEvent(raw)).toThrow('missing or invalid payload');
  });
});
