/**
 * @domio/recording-extensions — barrel.
 *
 * Multi-track MediaRecorder pipeline + chunked uploads to @domio/object-store.
 * Browser-only (depends on MediaRecorder + getDisplayMedia + getUserMedia);
 * tests inject a fake MediaRecorder and source factory.
 */

export type {
  RecorderConfig,
  RecorderHandle,
  RecordedTrackSummary,
  RecordingSummary,
  TrackState,
  TrackStateEvent,
  ChunkProgressEvent,
  ChunkUploader,
} from './types.js';

export { startMultiTrackRecorder, BrowserMediaSourceFactory } from './multi-track.js';
export type { MediaSourceFactory, MultiTrackRecorderOptions } from './multi-track.js';

export { ObjectStoreUploader, InMemoryUploader } from './object-store-uploader.js';
export type { ObjectStoreUploaderOptions } from './object-store-uploader.js';
