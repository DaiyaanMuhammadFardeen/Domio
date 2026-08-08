/**
 * @domio/object-store — key builders.
 *
 * Centralizes the storage-key layout so all callers agree on the shape.
 * Changing a layout here is a breaking change — every consumer reads from
 * these helpers, never builds keys inline.
 *
 * Layout:
 *   recordings/<workspace_id>/<session_id>/<track_kind>/<sequence>.<ext>
 *   captions/<workspace_id>/<session_id>/<language>/<segment_index>.vtt
 *   clips/<workspace_id>/<clip_id>/segments/<sequence>.mp4
 *   clips/<workspace_id>/<clip_id>/captions/<language>.vtt
 *   scorm/<workspace_id>/<package_id>.zip
 *   replays/<workspace_id>/<recording_id>/<asset>.json
 *   thumbnails/<workspace_id>/<entity_id>/<sequence>.jpg
 */

export type TrackKind = 'screen' | 'camera' | 'microphone' | 'system_audio' | 'annotations' | 'slide_diff' | 'widget_events';
export type StorageBucket = 'recordings' | 'captions' | 'clips' | 'scorm' | 'replays' | 'thumbnails';

export function recordingChunkKey(args: {
  workspace_id: string;
  session_id: string;
  track_kind: TrackKind;
  sequence: number;
  extension: string;
}): string {
  const seq = String(args.sequence).padStart(5, '0');
  return `recordings/${args.workspace_id}/${args.session_id}/${args.track_kind}/${seq}.${args.extension}`;
}

export function captionKey(args: {
  workspace_id: string;
  session_id: string;
  language: string;
  segment_index: number;
}): string {
  return `captions/${args.workspace_id}/${args.session_id}/${args.language}/${args.segment_index}.vtt`;
}

export function captionManifestKey(args: { workspace_id: string; session_id: string; language: string }): string {
  return `captions/${args.workspace_id}/${args.session_id}/${args.language}/manifest.vtt`;
}

export function clipSegmentKey(args: {
  workspace_id: string;
  clip_id: string;
  sequence: number;
}): string {
  return `clips/${args.workspace_id}/${args.clip_id}/segments/${String(args.sequence).padStart(5, '0')}.mp4`;
}

export function clipCaptionKey(args: { workspace_id: string; clip_id: string; language: string }): string {
  return `clips/${args.workspace_id}/${args.clip_id}/captions/${args.language}.vtt`;
}

export function clipSpecKey(args: { workspace_id: string; clip_id: string }): string {
  return `clips/${args.workspace_id}/${args.clip_id}/spec.json`;
}

export function scormPackageKey(args: { workspace_id: string; package_id: string }): string {
  return `scorm/${args.workspace_id}/${args.package_id}.zip`;
}

export function replayAssetKey(args: {
  workspace_id: string;
  recording_id: string;
  asset: 'manifest' | 'engagement' | 'thumbnails';
}): string {
  return `replays/${args.workspace_id}/${args.recording_id}/${args.asset}.json`;
}

export function thumbnailKey(args: {
  workspace_id: string;
  entity_id: string;
  sequence: number;
}): string {
  return `thumbnails/${args.workspace_id}/${args.entity_id}/${String(args.sequence).padStart(5, '0')}.jpg`;
}

/**
 * Parse a key back into its parts. Returns null if the key doesn't match
 * any known layout. Used by the listing/cleanup tooling.
 */
export function parseKey(key: string): {
  bucket: StorageBucket;
  workspace_id: string;
  parts: readonly string[];
} | null {
  const segs = key.split('/');
  if (segs.length < 3) return null;
  const bucket = segs[0] as StorageBucket;
  if (!['recordings', 'captions', 'clips', 'scorm', 'replays', 'thumbnails'].includes(bucket)) return null;
  return {
    bucket,
    workspace_id: segs[1] ?? '',
    parts: segs.slice(2),
  };
}