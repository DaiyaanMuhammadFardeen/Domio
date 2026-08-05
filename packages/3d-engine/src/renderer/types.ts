/**
 * @domio/3d-engine — renderer lane types.
 *
 * Re-exports the canonical contract types and adds renderer-lane–specific
 * helpers that are NOT part of the shared contract.
 */

export type {
  RendererKind,
  RendererCapabilities,
  RendererLike,
  RendererFactory,
  RendererFactoryContext,
  RenderPlan,
  DrawCallBudget,
  SceneTier,
  LODSelection,
  LODLevel,
  SceneLight,
  CameraPose,
  Vec3,
  Quat,
  Mat4,
} from '../contracts/renderer.v1.js';

export { DRAW_CALL_BUDGETS } from '../contracts/renderer.v1.js';
