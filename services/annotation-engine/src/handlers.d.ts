/**
 * @domio/annotation-engine — transport-agnostic HTTP handlers.
 *
 * Each handler reads `If-Match` for the optimistic-CC etag and
 * `Idempotency-Key` for replay safety. The runtime is expected to
 * inject `workspace_id` from the authenticated session.
 */
import type { AnnotationService } from './service.js';
import type { AnnotationCommitInput } from './types.js';
export interface HandlerRequest<B> {
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: B;
  actor: {
    id: string;
    workspace_id: string;
  };
  idempotencyKey?: string | undefined;
}
export interface HandlerResponse<T> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}
export interface AnnotationHandlerDeps {
  service: AnnotationService;
}
export interface AnnotationCommitBody {
  slide_id: string;
  layer_id?: string;
  kind: AnnotationCommitInput['kind'];
  geometry: AnnotationCommitInput['geometry'];
  style?: Record<string, unknown>;
  color?: string;
  stroke_width?: number;
  ephemeral?: boolean;
  drawn_by: string;
  drawn_by_display_name?: string;
  expected_version?: number;
}
export declare class AnnotationHandlers {
  private readonly deps;
  constructor(deps: AnnotationHandlerDeps);
  commit: (req: HandlerRequest<AnnotationCommitBody>) => Promise<HandlerResponse<unknown>>;
  rollback: (
    req: HandlerRequest<{
      annotation_id: string;
    }>,
  ) => Promise<HandlerResponse<unknown>>;
  promote: (
    req: HandlerRequest<{
      annotation_id: string;
    }>,
  ) => Promise<HandlerResponse<unknown>>;
  list: (
    req: HandlerRequest<
      | {
          ephemeral?: boolean;
        }
      | undefined
    >,
  ) => Promise<HandlerResponse<unknown>>;
}
//# sourceMappingURL=handlers.d.ts.map
