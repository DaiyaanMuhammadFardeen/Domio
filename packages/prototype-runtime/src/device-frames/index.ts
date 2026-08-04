/**
 * Device-frame runtime — Phase 10 M4.
 *
 * The device-frame registry lets the editor preview and the web
 * viewer render a deck inside a hardware-shaped frame
 * (iPhone, iPad, Desktop). The runtime is intentionally minimal:
 * the actual rendering is in the viewer; this module exposes the
 * geometry so the preview iframe can size itself.
 */

export interface DeviceFrameSpec {
  readonly id: string;
  readonly label: string;
  /** Viewport width in CSS px. */
  readonly width: number;
  /** Viewport height in CSS px. */
  readonly height: number;
  /** Device pixel ratio; defaults to 1. */
  readonly dpr: number;
  /** Optional user-agent override. */
  readonly userAgent?: string;
}

export interface DeviceFrameRegistration {
  readonly id: string;
  readonly spec: DeviceFrameSpec;
  readonly createdAt: number;
}

export const DEFAULT_DEVICE_FRAMES: readonly DeviceFrameSpec[] = [
  { id: 'iphone-15', label: 'iPhone 15', width: 393, height: 852, dpr: 3 },
  { id: 'iphone-15-pro-max', label: 'iPhone 15 Pro Max', width: 430, height: 932, dpr: 3 },
  { id: 'ipad-11', label: 'iPad 11"', width: 820, height: 1180, dpr: 2 },
  { id: 'desktop-1280', label: 'Desktop 1280', width: 1280, height: 800, dpr: 1 },
  { id: 'desktop-1920', label: 'Desktop 1920', width: 1920, height: 1080, dpr: 1 },
];

export class DeviceFrameRegistry {
  private readonly frames = new Map<string, DeviceFrameRegistration>();

  register(spec: DeviceFrameSpec, clock: () => number = Date.now): void {
    this.frames.set(spec.id, { id: spec.id, spec, createdAt: clock() });
  }

  resolve(id: string): DeviceFrameRegistration | null {
    return this.frames.get(id) ?? null;
  }

  list(): readonly DeviceFrameRegistration[] {
    return Array.from(this.frames.values());
  }

  unregister(id: string): void {
    this.frames.delete(id);
  }
}

export function findDefaultFrame(
  registry: DeviceFrameRegistry,
  id?: string,
): DeviceFrameRegistration {
  if (id) {
    const found = registry.resolve(id);
    if (found) return found;
  }
  const fallback = registry.list()[0];
  if (fallback) return fallback;
  throw new Error('DeviceFrameRegistry: no frames registered');
}