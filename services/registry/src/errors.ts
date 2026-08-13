/** Registry-service error codes (mirrored in contracts + MCP error mapping). */
export type RegistryErrorCode =
  | 'ERR_NOT_FOUND'
  | 'ERR_ALREADY_EXISTS'
  | 'ERR_CONFLICT'
  | 'ERR_GONE'
  | 'ERR_VALIDATION'
  | 'ERR_TAMPERED_PACKAGE'
  | 'ERR_LICENSE_MISSING'
  | 'ERR_LICENSE_EXPIRED'
  | 'ERR_LICENSE_REVOKED'
  | 'ERR_SEAT_LIMIT'
  | 'ERR_BRAND_LOCK'
  | 'ERR_PIN_UNAVAILABLE'
  | 'ERR_POLICY_MISMATCH'
  | 'ERR_TRANSITION_INVALID'
  | 'ERR_DEPRECATED'
  | 'ERR_UNAUTHORIZED'
  | 'ERR_OFFLINE_EXPIRED'
  | 'ERR_MODERATION_QUEUED'
  | 'ERR_RATE_LIMITED';

export class RegistryError extends Error {
  constructor(
    public readonly code: RegistryErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export const Errors = {
  notFound(what: string): RegistryError {
    return new RegistryError('ERR_NOT_FOUND', `${what} not found`, 404);
  },
  alreadyExists(what: string): RegistryError {
    return new RegistryError('ERR_ALREADY_EXISTS', `${what} already exists`, 409);
  },
  conflict(what = 'Resource state conflict'): RegistryError {
    return new RegistryError('ERR_CONFLICT', what, 409);
  },
  gone(what = 'Resource is gone'): RegistryError {
    return new RegistryError('ERR_GONE', what, 410);
  },
  validation(message: string, detail?: unknown): RegistryError {
    return new RegistryError('ERR_VALIDATION', message, 400, detail);
  },
  tampered(message = 'Package integrity check failed'): RegistryError {
    return new RegistryError('ERR_TAMPERED_PACKAGE', message, 409);
  },
  licenseMissing(what = 'A valid license is required'): RegistryError {
    return new RegistryError('ERR_LICENSE_MISSING', what, 403);
  },
  licenseExpired(what = 'License has expired'): RegistryError {
    return new RegistryError('ERR_LICENSE_EXPIRED', what, 403);
  },
  licenseRevoked(what = 'License has been revoked'): RegistryError {
    return new RegistryError('ERR_LICENSE_REVOKED', what, 403);
  },
  seatLimit(what = 'License seat limit reached'): RegistryError {
    return new RegistryError('ERR_SEAT_LIMIT', what, 403);
  },
  brandLock(what = 'Region is protected by a brand lock'): RegistryError {
    return new RegistryError('ERR_BRAND_LOCK', what, 403);
  },
  pinUnavailable(what = 'Requested version is not available'): RegistryError {
    return new RegistryError('ERR_PIN_UNAVAILABLE', what, 409);
  },
  policyMismatch(what = 'Change conflicts with the library policy'): RegistryError {
    return new RegistryError('ERR_POLICY_MISMATCH', what, 409);
  },
  transition(what = 'Invalid listing status transition'): RegistryError {
    return new RegistryError('ERR_TRANSITION_INVALID', what, 409);
  },
  deprecated(what = 'Component is deprecated'): RegistryError {
    return new RegistryError('ERR_DEPRECATED', what, 410);
  },
  unauthorized(what = 'Unauthorized'): RegistryError {
    return new RegistryError('ERR_UNAUTHORIZED', what, 401);
  },
  offlineExpired(what = 'Offline grace period expired'): RegistryError {
    return new RegistryError('ERR_OFFLINE_EXPIRED', what, 403);
  },
  moderationQueued(what = 'Review queued for moderation'): RegistryError {
    return new RegistryError('ERR_MODERATION_QUEUED', what, 202);
  },
};

/** Map a thrown unknown to a RegistryError (unknown → 500). */
export function toRegistryError(err: unknown): RegistryError {
  if (err instanceof RegistryError) return err;
  return new RegistryError(
    'ERR_VALIDATION',
    err instanceof Error ? err.message : 'Unknown error',
    500,
  );
}
