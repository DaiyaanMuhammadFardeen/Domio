/**
 * Prototype-recorder service — request body schemas (Phase 10 M5).
 *
 * Validates incoming request bodies without dragging in a schema engine.
 * Each validator returns either `{ valid: true, value }` (normalized) or
 * `{ valid: false, errors }` (stable error list).
 */

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const ALLOWED_CONSENT = ['opt_in', 'opt_out', 'anonymous'] as const;
const ALLOWED_REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-south', 'ap-east'] as const;
const ALLOWED_EVENT_TYPES = [
  'session_start',
  'session_end',
  'slide_enter',
  'slide_exit',
  'click',
  'hover',
  'form_submit',
  'calculator_change',
  'rage_click',
  'error',
  'device_frame_change',
  'consent_change',
] as const;

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly errors: readonly ValidationError[];
}

function ok<T>(value: T): ValidationResult<T> {
  return { valid: true, value, errors: [] };
}
function fail(errors: ValidationError[]): ValidationResult<never> {
  return { valid: false, errors };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}
function isInt(v: unknown): v is number {
  return isNumber(v) && Number.isInteger(v);
}
function inSet<T extends string>(set: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (set as readonly string[]).includes(v);
}

// ── StartSession ───────────────────────────────────────────────────────

export interface StartSessionBody {
  readonly consent: (typeof ALLOWED_CONSENT)[number];
  readonly region: (typeof ALLOWED_REGIONS)[number];
  readonly regionPinned?: boolean;
  readonly abVariant?: string | null;
  readonly samplingRate?: number;
  readonly ttlMs?: number;
  readonly rejoinSessionToken?: string;
}

export function validateStartSession(body: unknown): ValidationResult<StartSessionBody> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const errors: ValidationError[] = [];
  const consent = (body as { consent?: unknown }).consent;
  const region = (body as { region?: unknown }).region;
  if (!inSet(ALLOWED_CONSENT, consent))
    errors.push({ path: 'consent', message: 'opt_in|opt_out|anonymous required' });
  if (!inSet(ALLOWED_REGIONS, region)) errors.push({ path: 'region', message: 'unknown region' });

  const regionPinned = (body as { regionPinned?: unknown }).regionPinned;
  if (regionPinned !== undefined && typeof regionPinned !== 'boolean') {
    errors.push({ path: 'regionPinned', message: 'boolean required' });
  }

  const abVariant = (body as { abVariant?: unknown }).abVariant;
  if (abVariant !== undefined && abVariant !== null && !isString(abVariant)) {
    errors.push({ path: 'abVariant', message: 'string required' });
  }

  const samplingRate = (body as { samplingRate?: unknown }).samplingRate;
  if (
    samplingRate !== undefined &&
    (!isNumber(samplingRate) || samplingRate < 0 || samplingRate > 1)
  ) {
    errors.push({ path: 'samplingRate', message: '0..1 required' });
  }

  const ttlMs = (body as { ttlMs?: unknown }).ttlMs;
  if (
    ttlMs !== undefined &&
    (!isInt(ttlMs) || ttlMs < 60_000 || ttlMs > 365 * 24 * 60 * 60 * 1000)
  ) {
    errors.push({ path: 'ttlMs', message: 'integer ms (1 minute..1 year)' });
  }

  const rejoinSessionToken = (body as { rejoinSessionToken?: unknown }).rejoinSessionToken;
  if (rejoinSessionToken !== undefined && !isString(rejoinSessionToken)) {
    errors.push({ path: 'rejoinSessionToken', message: 'string required' });
  }

  if (errors.length) return fail(errors);
  return ok({
    consent: consent as (typeof ALLOWED_CONSENT)[number],
    region: region as (typeof ALLOWED_REGIONS)[number],
    ...(typeof regionPinned === 'boolean' ? { regionPinned } : {}),
    ...(abVariant === null || isString(abVariant) ? { abVariant } : {}),
    ...(typeof samplingRate === 'number' ? { samplingRate } : {}),
    ...(typeof ttlMs === 'number' ? { ttlMs } : {}),
    ...(isString(rejoinSessionToken) ? { rejoinSessionToken } : {}),
  });
}

// ── IngestBatch ────────────────────────────────────────────────────────

export interface IngestEventBody {
  readonly eventType: (typeof ALLOWED_EVENT_TYPES)[number];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly clientFingerprint: string;
  readonly createdAt?: number;
  readonly signedEvent?: {
    readonly id: string;
    readonly seq: number;
    readonly prevHash: string;
    readonly eventHash: string;
    readonly kid: string;
    readonly clientFingerprint: string;
    readonly region: string;
    readonly createdAt: number;
    readonly payload: Readonly<Record<string, unknown>>;
  };
}

export interface IngestBatchBody {
  readonly sessionId: string;
  readonly events: readonly IngestEventBody[];
}

export function validateIngestBatch(body: unknown): ValidationResult<IngestBatchBody> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const sessionId = (body as { sessionId?: unknown }).sessionId;
  const events = (body as { events?: unknown }).events;
  if (!isString(sessionId) || (!ULID.test(sessionId) && sessionId.length < 1)) {
    // Allow non-ULID ids produced by the runtime (ps-xxxx style).
  }
  if (!isArray(events) || events.length === 0) {
    return fail([{ path: 'events', message: 'non-empty array required' }]);
  }

  const errors: ValidationError[] = [];
  const validated: IngestEventBody[] = [];
  for (let i = 0; i < events.length; i++) {
    const raw = events[i];
    if (!isObject(raw)) {
      errors.push({ path: `events[${i}]`, message: 'object required' });
      continue;
    }
    const eventType = (raw as { eventType?: unknown }).eventType;
    const payload = (raw as { payload?: unknown }).payload;
    const clientFingerprint = (raw as { clientFingerprint?: unknown }).clientFingerprint;
    if (!inSet(ALLOWED_EVENT_TYPES, eventType)) {
      errors.push({ path: `events[${i}].eventType`, message: 'unknown event type' });
    }
    if (!isObject(payload)) {
      errors.push({ path: `events[${i}].payload`, message: 'object required' });
    }
    if (
      !isString(clientFingerprint) ||
      clientFingerprint.length < 1 ||
      clientFingerprint.length > 256
    ) {
      errors.push({ path: `events[${i}].clientFingerprint`, message: '1..256 chars required' });
    }
    const createdAt = (raw as { createdAt?: unknown }).createdAt;
    if (createdAt !== undefined && !isInt(createdAt)) {
      errors.push({ path: `events[${i}].createdAt`, message: 'integer required' });
    }
    const signedEvent = (raw as { signedEvent?: unknown }).signedEvent;
    if (signedEvent !== undefined) {
      if (!isObject(signedEvent)) {
        errors.push({ path: `events[${i}].signedEvent`, message: 'object required' });
      }
    }

    if (errors.length === 0 || !errors.some((e) => e.path.startsWith(`events[${i}]`))) {
      validated.push({
        eventType: eventType as (typeof ALLOWED_EVENT_TYPES)[number],
        payload: payload as Readonly<Record<string, unknown>>,
        clientFingerprint: clientFingerprint as string,
        ...(typeof createdAt === 'number' ? { createdAt } : {}),
        ...(isObject(signedEvent)
          ? { signedEvent: signedEvent as IngestEventBody['signedEvent'] }
          : {}),
      });
    }
  }

  if (errors.length) return fail(errors);
  return ok({ sessionId: sessionId as string, events: validated });
}

// ── RotateKey ──────────────────────────────────────────────────────────

export interface RotateKeyBody {
  readonly deckId: string;
}

export function validateRotateKey(body: unknown): ValidationResult<RotateKeyBody> {
  if (!isObject(body)) return fail([{ path: '', message: 'Body must be an object' }]);
  const deckId = (body as { deckId?: unknown }).deckId;
  if (!isString(deckId) || deckId.length < 1) {
    return fail([{ path: 'deckId', message: 'string required' }]);
  }
  return ok({ deckId });
}
