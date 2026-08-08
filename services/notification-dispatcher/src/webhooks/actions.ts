/**
 * Notification dispatcher — action buttons (idempotent).
 *
 * Builds Slack-style interactive action buttons for notifications
 * (approve / reject / open / resolve) and handles callback
 * payloads from the platform.
 *
 * Each action carries a composite `callback_id` containing the
 * notification ID, action type, and idempotency key. The handler
 * uses an injected `IdempotencyStore` to ensure the same
 * callback + action is only dispatched once within a 24-hour TTL.
 *
 * Unknown or duplicate actions return structured errors.
 */

// ─── Types ──────────────────────────────────────────────────────

export type ActionKind = 'approve' | 'reject' | 'open' | 'resolve';

export interface ActionButton {
  type: string;
  text: { type: string; text: string };
  action_id: string;
  value: string;
}

export interface CallbackPayload {
  /** Composite: "{notificationId}:{action}:{idempotencyKey}" */
  callback_id: string;
  action: { action_id: string; value: string };
  /** User who clicked (platform user ID). */
  user?: { id: string } | undefined;
  /** Raw response_url for the platform (Slack response_url pattern). */
  response_url?: string | undefined;
}

export interface ActionResult {
  ok: boolean;
  note?: string;
  error?: string;
}

// ─── Idempotency store ──────────────────────────────────────────

export interface IdempotencyStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

// ─── Action handler ─────────────────────────────────────────────

export interface ActionHandler {
  handleAction(action: ActionKind, context: ActionContext): Promise<ActionResult>;
}

export interface ActionContext {
  notificationId: string;
  action: ActionKind;
  idempotencyKey: string;
  userId?: string | undefined;
  responseUrl?: string | undefined;
}

/** NoopActionHandler returns success with a no-op note. */
export class NoopActionHandler implements ActionHandler {
  async handleAction(_action: ActionKind, _ctx: ActionContext): Promise<ActionResult> {
    return { ok: true, note: 'no-op' };
  }
}

// ─── Build buttons ──────────────────────────────────────────────

const ACTION_LABELS: Record<ActionKind, string> = {
  approve: 'Approve',
  reject: 'Reject',
  open: 'Open',
  resolve: 'Resolve',
};

/**
 * buildActionButtons returns Slack Block Kit action buttons for a
 * notification. Each button encodes the notificationId + action +
 * idempotencyKey in its `value` field.
 */
export function buildActionButtons(
  notificationId: string,
  idempotencyKey: string,
  actions: ActionKind[] = ['approve', 'reject', 'open', 'resolve'],
): ActionButton[] {
  return actions.map((action) => ({
    type: 'button',
    text: { type: 'plain_text', text: ACTION_LABELS[action] },
    action_id: `notif_${action}_${notificationId}`,
    value: JSON.stringify({ notificationId, action, idempotencyKey }),
  }));
}

/**
 * buildActionBlocks wraps action buttons in a Slack Block Kit
 * `actions` block, suitable for inclusion in a message payload.
 */
export function buildActionBlocks(
  notificationId: string,
  idempotencyKey: string,
  actions: ActionKind[] = ['approve', 'reject', 'open', 'resolve'],
): { type: string; elements: ActionButton[] } {
  return {
    type: 'actions',
    elements: buildActionButtons(notificationId, idempotencyKey, actions),
  };
}

// ─── Handle callback ────────────────────────────────────────────

/**
 * parseCallbackPayload extracts and validates the callback data
 * from a Slack/Teams interactive payload.
 */
export function parseCallbackPayload(raw: Record<string, unknown>): CallbackPayload | null {
  const callbackId = typeof raw.callback_id === 'string' ? raw.callback_id : undefined;
  const action = raw.action as Record<string, unknown> | undefined;
  if (!callbackId || !action) return null;

  const actionId = typeof action.action_id === 'string' ? action.action_id : undefined;
  const value = typeof action.value === 'string' ? action.value : undefined;
  if (!actionId || !value) return null;

  let parsed: { notificationId: string; action: string; idempotencyKey: string };
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed.notificationId || !parsed.action || !parsed.idempotencyKey) return null;

  const user = raw.user as Record<string, unknown> | undefined;

  return {
    callback_id: callbackId,
    action: { action_id: actionId, value },
    user: user && typeof user.id === 'string' ? { id: user.id } : undefined,
    response_url: typeof raw.response_url === 'string' ? raw.response_url : undefined,
  };
}

/**
 * handleAction processes an action callback with idempotency.
 *
 * 1. Parse + validate the callback payload.
 * 2. Check the idempotency store — if already seen, return cached.
 * 3. Delegate to the ActionHandler.
 * 4. Cache the result.
 */
export async function handleAction(
  callbackPayload: Record<string, unknown>,
  deps: {
    idempotencyStore: IdempotencyStore;
    actionHandler: ActionHandler;
    secret?: string;
  },
): Promise<{ status: number; body: ActionResult }> {
  const parsed = parseCallbackPayload(callbackPayload);
  if (!parsed) {
    return { status: 400, body: { ok: false, error: 'invalid callback payload' } };
  }

  const { notificationId, action, idempotencyKey } = JSON.parse(parsed.action.value) as {
    notificationId: string;
    action: string;
    idempotencyKey: string;
  };

  const validActions: string[] = ['approve', 'reject', 'open', 'resolve'];
  if (!validActions.includes(action)) {
    return { status: 404, body: { ok: false, error: `unknown action: ${action}` } };
  }

  const idempotencyKey_ = `${parsed.callback_id}:${action}:${idempotencyKey}`;
  const cached = await deps.idempotencyStore.get(idempotencyKey_);
  if (cached !== undefined) {
    return {
      status: 200,
      body: JSON.parse(cached) as ActionResult,
    };
  }

  const result = await deps.actionHandler.handleAction(action as ActionKind, {
    notificationId,
    action: action as ActionKind,
    idempotencyKey,
    userId: parsed.user?.id,
    responseUrl: parsed.response_url,
  });

  await deps.idempotencyStore.set(idempotencyKey_, JSON.stringify(result), DEFAULT_TTL_MS);

  return { status: result.ok ? 200 : 400, body: result };
}
