/**
 * Encoder selection for screen recording.
 *
 * Given a support matrix (injected in tests) indicating which codecs are
 * available in the current browser, picks the best one with the following
 * priority:
 *
 * 1. H.264 / MP4 — best compatibility, plays everywhere
 * 2. VP9 / WebM — better quality when H.264 is absent
 * 3. AV1 / WebM — best compression, least compatible
 *
 * Returns `{ unsupported: true }` when no known codec is available.
 */

/** Browser support matrix — only the codecs we know about. */
export interface SupportMatrix {
  readonly h264?: boolean;
  readonly vp9?: boolean;
  readonly av1?: boolean;
}

/** A successfully chosen encoder. */
export interface EncoderChoice {
  readonly mimeType: string;
  readonly container: 'mp4' | 'webm';
}

/** Returned when no codec is supported. */
export interface Unsupported {
  readonly unsupported: true;
}

export type EncoderResult = EncoderChoice | Unsupported;

/** Check if the browser supports a given MIME type string. */
function mimeSupported(support: SupportMatrix | undefined, key: keyof SupportMatrix): boolean {
  return support?.[key] === true;
}

/**
 * Select the best encoder from a support matrix.
 */
export function selectEncoder(support: SupportMatrix): EncoderResult {
  // Priority: h264 → vp9 → av1
  if (mimeSupported(support, 'h264')) {
    return { mimeType: 'video/mp4;codecs=h264', container: 'mp4' };
  }
  if (mimeSupported(support, 'vp9')) {
    return { mimeType: 'video/webm;codecs=vp9', container: 'webm' };
  }
  if (mimeSupported(support, 'av1')) {
    return { mimeType: 'video/webm;codecs=av1', container: 'webm' };
  }
  return { unsupported: true };
}
