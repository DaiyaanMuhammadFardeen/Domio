/**
 * Chapter support for video playback.
 *
 * Chapters are derived from title markers or a keyframe table.
 * Each chapter has a title and a start time in milliseconds.
 * The chapter list is sorted by start time.
 */

export interface Chapter {
  /** Chapter title. */
  title: string;
  /** Start time in milliseconds (inclusive). */
  startMs: number;
}

/**
 * A sorted chapter list for efficient lookup.
 */
export interface ChapterList {
  /** Chapters sorted by startMs ascending. */
  chapters: readonly Chapter[];
}

/**
 * Create a ChapterList from an array of chapters.
 * Chapters are sorted by startMs ascending.
 */
export function createChapterList(chapters: Chapter[]): ChapterList {
  const sorted = [...chapters].sort((a, b) => a.startMs - b.startMs);
  return { chapters: sorted };
}

/**
 * Get the chapter active at a given time.
 *
 * Boundary rules:
 * - A chapter is active if `timeMs >= chapter.startMs` (inclusive start).
 * - The chapter is exclusive at the next chapter's start (exclusive end).
 * - If timeMs is before the first chapter, returns undefined.
 * - If timeMs is after all chapters, returns the last chapter.
 */
export function getChapterAt(chapterList: ChapterList, timeMs: number): Chapter | undefined {
  const { chapters } = chapterList;
  if (chapters.length === 0) return undefined;

  // Binary search for the rightmost chapter whose startMs <= timeMs
  let lo = 0;
  let hi = chapters.length - 1;
  let result: Chapter | undefined;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const ch = chapters[mid]!;
    if (ch.startMs <= timeMs) {
      result = ch;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}
