/**
 * @domio/annotation-engine — public types and errors.
 *
 * Phase 15 W4. The annotation engine persists overlay strokes for live
 * presenter sessions. Strokes can be ephemeral (cleared on session end)
 * or saved (promoted to the slide).
 *
 * Geometry formats per kind:
 *   - pen / highlighter: { strokes: Stroke[] }
 *     where Stroke = Array<{ x: number, y: number, pressure: number, t: number }>
 *   - spotlight: { x, y, radius, shape: 'circle' | 'rect' }
 *   - zoom:      { x, y, radius, magnification }
 *   - blur:      { x, y, width, height, radius }
 *
 * Replay determinism: each stroke is a typed point array with monotonically
 * increasing `t`. The renderer is expected to use a stable sample rate
 * (e.g. requestAnimationFrame timestamps in `t`). Two presenters viewing
 * the same stroke see identical output.
 */
// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class AnnotationValidationError extends Error {
    code = 'ANNOTATION_VALIDATION_ERROR';
    constructor(message) {
        super(message);
        this.name = 'AnnotationValidationError';
    }
}
export class AnnotationNotFoundError extends Error {
    code = 'ANNOTATION_NOT_FOUND';
    constructor(message) {
        super(message);
        this.name = 'AnnotationNotFoundError';
    }
}
export class AnnotationConflictError extends Error {
    code = 'ANNOTATION_CONFLICT';
    constructor(message) {
        super(message);
        this.name = 'AnnotationConflictError';
    }
}
const VALID_KINDS = ['pen', 'highlighter', 'spotlight', 'zoom', 'blur'];
export function validateCommitInput(input) {
    if (!input.session_id)
        throw new AnnotationValidationError('session_id is required');
    if (!input.workspace_id)
        throw new AnnotationValidationError('workspace_id is required');
    if (!input.slide_id)
        throw new AnnotationValidationError('slide_id is required');
    if (!input.drawn_by)
        throw new AnnotationValidationError('drawn_by is required');
    if (!VALID_KINDS.includes(input.kind)) {
        throw new AnnotationValidationError(`invalid kind: ${input.kind}`);
    }
    if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
        throw new AnnotationValidationError('expected_version must be a positive integer');
    }
    validateGeometry(input.kind, input.geometry);
}
function validateGeometry(kind, g) {
    switch (kind) {
        case 'pen':
        case 'highlighter': {
            const pen = g;
            if (!Array.isArray(pen.strokes) || pen.strokes.length === 0) {
                throw new AnnotationValidationError(`${kind}: strokes must be a non-empty array`);
            }
            for (const stroke of pen.strokes) {
                if (!Array.isArray(stroke) || stroke.length === 0) {
                    throw new AnnotationValidationError(`${kind}: each stroke must have at least one point`);
                }
                let prevT = -Infinity;
                for (const p of stroke) {
                    if (typeof p.x !== 'number' || typeof p.y !== 'number') {
                        throw new AnnotationValidationError(`${kind}: x/y must be numbers`);
                    }
                    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
                        throw new AnnotationValidationError(`${kind}: x/y must be normalized 0..1`);
                    }
                    if (typeof p.t !== 'number' || p.t < prevT) {
                        throw new AnnotationValidationError(`${kind}: t must be monotonically non-decreasing`);
                    }
                    prevT = p.t;
                }
            }
            break;
        }
        case 'spotlight': {
            const s = g;
            if (typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.radius !== 'number') {
                throw new AnnotationValidationError('spotlight: x/y/radius must be numbers');
            }
            if (s.radius <= 0)
                throw new AnnotationValidationError('spotlight: radius must be > 0');
            if (s.shape !== 'circle' && s.shape !== 'rect') {
                throw new AnnotationValidationError('spotlight: shape must be circle or rect');
            }
            break;
        }
        case 'zoom': {
            const z = g;
            if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.radius !== 'number') {
                throw new AnnotationValidationError('zoom: x/y/radius must be numbers');
            }
            if (z.magnification !== undefined && z.magnification <= 0) {
                throw new AnnotationValidationError('zoom: magnification must be > 0');
            }
            break;
        }
        case 'blur': {
            const b = g;
            if (typeof b.x !== 'number' || typeof b.y !== 'number') {
                throw new AnnotationValidationError('blur: x/y must be numbers');
            }
            if (b.width <= 0 || b.height <= 0) {
                throw new AnnotationValidationError('blur: width/height must be > 0');
            }
            if (b.radius < 0)
                throw new AnnotationValidationError('blur: radius must be >= 0');
            break;
        }
    }
}
//# sourceMappingURL=types.js.map