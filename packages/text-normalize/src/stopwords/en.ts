/**
 * English stopwords — small, hand-curated set tuned for audience
 * submission text. We deliberately exclude content-bearing words
 * like "why" / "how" so question stems are preserved.
 */
export const EN_STOPWORDS = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do',
  'does', 'for', 'from', 'has', 'have', 'i', 'in', 'is', 'it', 'its',
  'just', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'so', 'some',
  'than', 'that', 'the', 'their', 'there', 'they', 'this', 'to', 'us',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'will', 'with', 'you', 'your',
]);