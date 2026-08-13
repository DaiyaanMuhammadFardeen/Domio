/**
 * Quizzes module — Phase 10 M6.1.
 *
 * Public surface:
 *   - `QuizRuntime` — drives one attempt at a quiz.
 *   - `validateMultipleChoice` / `validateMultiSelect` /
 *     `validateTrueFalse` / `validateShortAnswer` /
 *     `validateFillBlank` / `validateDragToMatch` /
 *     `validateHotspotQuiz` / `validateFlashCard` /
 *     `validateShortAnswerLlm` — per-type validators.
 *   - `XapiEmitter` — emits xAPI 1.0.3 statements on quiz state
 *     transitions; replayable by Yet Analytics SCORM Cloud and other
 *     LRS implementations.
 */

export { QuizRuntime, DEFAULT_PASS_THRESHOLD } from './quiz-runtime.js';
export type { QuizRuntimeOptions, QuizAttemptSummary } from './quiz-runtime.js';
export { XapiEmitter, QUIZ_OBJECT_TYPE } from './xapi-emitter.js';
export type {
  XapiActor,
  XapiObject,
  XapiResult,
  XapiStatement,
  XapiVerbId,
  XapiEmitterOptions,
  XapiQuizContext,
} from './xapi-emitter.js';
export { validateMultipleChoice } from './question-types/multiple-choice.js';
export { validateMultiSelect } from './question-types/multi-select.js';
export { validateTrueFalse } from './question-types/true-false.js';
export {
  validateShortAnswer,
  validateFillBlank,
  levenshtein,
  similarity,
  DEFAULT_TYPO_TOLERANCE,
} from './question-types/short-answer.js';
export { validateDragToMatch } from './question-types/drag-to-match.js';
export {
  validateHotspotQuiz,
  hotspotCentroid,
  pointInPolygon,
  pointInRect,
  DEFAULT_HOTSPOT_TOLERANCE,
} from './question-types/hotspot-quiz.js';
export { validateFlashCard } from './question-types/flash-card.js';
export {
  validateShortAnswerLlm,
  DEFAULT_LLM_FALLBACK_THRESHOLD,
} from './question-types/short-answer-llm.js';
export type { LlmGrader, LlmGraderResult } from './question-types/short-answer-llm.js';
