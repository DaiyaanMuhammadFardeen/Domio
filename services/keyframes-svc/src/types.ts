/**
 * Phase 11 camera keyframe domain types.
 *
 * Mirrors contracts/schema/v1/camera-keyframe-v1.schema.json.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BezierEasing {
  readonly p1x: number;
  readonly p1y: number;
  readonly p2x: number;
  readonly p2y: number;
}

export type TriggerMode = 'auto' | 'click' | 'scroll' | 'data';

export interface CameraKeyframe {
  readonly id: string;
  readonly slideId: string;
  readonly sceneId: string | null;
  readonly orderIndex: number;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly roll: number;
  readonly easing: BezierEasing;
  readonly durationMs: number;
  readonly trigger: TriggerMode;
  readonly createdAt: string;
}

export interface CreateCameraKeyframeRequest {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly sceneId?: string;
  readonly orderIndex?: number;
  readonly roll?: number;
  readonly easing?: BezierEasing;
  readonly durationMs?: number;
  readonly trigger?: TriggerMode;
}

export interface PatchCameraKeyframeRequest {
  readonly position?: Partial<Vec3>;
  readonly target?: Partial<Vec3>;
  readonly fov?: number;
  readonly roll?: number;
  readonly easing?: Partial<BezierEasing>;
  readonly durationMs?: number;
  readonly trigger?: TriggerMode;
  readonly orderIndex?: number;
}

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly roll: number;
}

export interface InterpolateRequest {
  readonly keyframes: readonly CameraKeyframe[];
  readonly time_ms: number;
}

export interface InterpolateResponse {
  readonly pose: CameraPose;
  readonly crossfade?: boolean;
}

export interface BatchRequest {
  readonly keyframes: readonly CameraKeyframe[];
}

export interface LutEntry {
  readonly time_ms: number;
  readonly pose: CameraPose;
}

export interface BatchResponse {
  readonly lut: readonly LutEntry[];
  readonly total_duration_ms: number;
  readonly sample_rate_hz: number;
}

export interface CameraKeyframeListResponse {
  readonly items: readonly CameraKeyframe[];
}

export interface ErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly details?: unknown;
}

export const DEFAULT_EASING: BezierEasing = { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };
