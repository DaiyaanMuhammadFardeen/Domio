/**
 * @domio/recording-extensions — object-store uploader.
 *
 * Concrete ChunkUploader that writes to @domio/object-store. Used in prod;
 * tests inject the InMemoryUploader instead.
 */

import { createHash } from 'node:crypto';
import { recordingChunkKey, type ObjectStore, type TrackKind } from '@domio/object-store';
import type { ChunkUploader } from './types.js';

export interface ObjectStoreUploaderOptions {
  readonly store: ObjectStore;
  readonly extension?: Partial<Record<TrackKind, string>>;
}

const DEFAULT_EXT: Record<TrackKind, string> = {
  screen: 'webm',
  camera: 'webm',
  microphone: 'webm',
  system_audio: 'webm',
  annotations: 'json',
  slide_diff: 'json',
  widget_events: 'json',
};

export class ObjectStoreUploader implements ChunkUploader {
  constructor(private readonly opts: ObjectStoreUploaderOptions) {}

  async upload(args: {
    workspace_id: string;
    recording_session_id: string;
    track_kind: TrackKind;
    sequence: number;
    extension?: string;
    body: Uint8Array;
  }): Promise<{ storage_key: string; sha256: string; byte_size: number }> {
    const extension = args.extension ?? this.opts.extension?.[args.track_kind] ?? DEFAULT_EXT[args.track_kind];
    const storage_key = recordingChunkKey({
      workspace_id: args.workspace_id,
      session_id: args.recording_session_id,
      track_kind: args.track_kind,
      sequence: args.sequence,
      extension,
    });
    const sha256 = createHash('sha256').update(args.body).digest('hex');
    const mime = mimeFor(args.track_kind, extension);
    await this.opts.store.put(storage_key, args.body, { contentType: mime, sha256 });
    return { storage_key, sha256, byte_size: args.body.byteLength };
  }
}

function mimeFor(_track: TrackKind, ext: string): string {
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'json') return 'application/json';
  if (ext === 'vtt') return 'text/vtt';
  return 'application/octet-stream';
}

/** In-memory uploader for tests. Mirrors ObjectStoreUploader but skips the
 *  disk round-trip and pre-computes the sha256 inline. */
export class InMemoryUploader implements ChunkUploader {
  readonly uploads: Array<{
    storage_key: string;
    track_kind: TrackKind;
    sequence: number;
    body: Uint8Array;
    sha256: string;
  }> = [];

  async upload(args: {
    workspace_id: string;
    recording_session_id: string;
    track_kind: TrackKind;
    sequence: number;
    body: Uint8Array;
  }): Promise<{ storage_key: string; sha256: string; byte_size: number }> {
    const sha256 = createHash('sha256').update(args.body).digest('hex');
    const storage_key = recordingChunkKey({
      workspace_id: args.workspace_id,
      session_id: args.recording_session_id,
      track_kind: args.track_kind,
      sequence: args.sequence,
      extension: 'webm',
    });
    this.uploads.push({
      storage_key,
      track_kind: args.track_kind,
      sequence: args.sequence,
      body: args.body,
      sha256,
    });
    return { storage_key, sha256, byte_size: args.body.byteLength };
  }
}