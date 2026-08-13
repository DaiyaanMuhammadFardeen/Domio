/**
 * @domio/quiz-engine — observability.
 */

export interface CounterLike {
  inc(by?: number, attrs?: Record<string, string>): void;
}
export interface HistogramLike {
  observe(value_ms: number, attrs?: Record<string, string>): void;
}
export interface QuizEngineMetrics {
  quizzes_created: CounterLike;
  answers: CounterLike;
  answer_latency_ms: HistogramLike;
}
export class NullQuizEngineMetrics implements QuizEngineMetrics {
  quizzes_created = makeCounter();
  answers = makeCounter();
  answer_latency_ms = makeHistogram();
}
function makeCounter(): CounterLike {
  return { inc: () => undefined };
}
function makeHistogram(): HistogramLike {
  return { observe: () => undefined };
}
