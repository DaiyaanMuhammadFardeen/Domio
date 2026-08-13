/**
 * @domio/object-store — key builder tests.
 */

import { describe, it, expect } from 'vitest';
import {
  recordingChunkKey,
  captionKey,
  captionManifestKey,
  clipSegmentKey,
  clipCaptionKey,
  clipSpecKey,
  scormPackageKey,
  replayAssetKey,
  thumbnailKey,
  parseKey,
} from './keys.js';

describe('key builders', () => {
  it('formats recording chunk keys with zero-padded sequence', () => {
    expect(
      recordingChunkKey({
        workspace_id: 'ws-abc',
        session_id: 'sess-001',
        track_kind: 'screen',
        sequence: 7,
        extension: 'mp4',
      }),
    ).toBe('recordings/ws-abc/sess-001/screen/00007.mp4');
  });

  it('formats caption keys by language + segment_index', () => {
    expect(
      captionKey({
        workspace_id: 'ws-abc',
        session_id: 'sess-001',
        language: 'en',
        segment_index: 12,
      }),
    ).toBe('captions/ws-abc/sess-001/en/12.vtt');
  });

  it('formats caption manifest key', () => {
    expect(
      captionManifestKey({ workspace_id: 'ws-abc', session_id: 'sess-001', language: 'bn' }),
    ).toBe('captions/ws-abc/sess-001/bn/manifest.vtt');
  });

  it('formats clip segment + caption keys', () => {
    expect(clipSegmentKey({ workspace_id: 'ws-abc', clip_id: 'clip-001', sequence: 42 })).toBe(
      'clips/ws-abc/clip-001/segments/00042.mp4',
    );
    expect(clipCaptionKey({ workspace_id: 'ws-abc', clip_id: 'clip-001', language: 'en' })).toBe(
      'clips/ws-abc/clip-001/captions/en.vtt',
    );
    expect(clipSpecKey({ workspace_id: 'ws-abc', clip_id: 'clip-001' })).toBe(
      'clips/ws-abc/clip-001/spec.json',
    );
  });

  it('formats scorm + replay + thumbnail keys', () => {
    expect(scormPackageKey({ workspace_id: 'ws-abc', package_id: 'pkg-001' })).toBe(
      'scorm/ws-abc/pkg-001.zip',
    );
    expect(
      replayAssetKey({ workspace_id: 'ws-abc', recording_id: 'rec-001', asset: 'manifest' }),
    ).toBe('replays/ws-abc/rec-001/manifest.json');
    expect(thumbnailKey({ workspace_id: 'ws-abc', entity_id: 'ent-001', sequence: 3 })).toBe(
      'thumbnails/ws-abc/ent-001/00003.jpg',
    );
  });

  it('parseKey round-trips well-formed keys', () => {
    const parsed = parseKey('recordings/ws-abc/sess-001/screen/00007.mp4');
    expect(parsed).toEqual({
      bucket: 'recordings',
      workspace_id: 'ws-abc',
      parts: ['sess-001', 'screen', '00007.mp4'],
    });
  });

  it('parseKey rejects unknown buckets', () => {
    expect(parseKey('garbage/ws-abc/whatever')).toBeNull();
    expect(parseKey('a')).toBeNull();
  });
});
