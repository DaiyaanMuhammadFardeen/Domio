/**
 * Notification dispatcher — inbound webhook handlers.
 *
 * HTTP handler functions for the 5 webhook endpoints:
 *   1. receiveSlackEvent       — POST /webhooks/slack/events
 *   2. receiveSlackInteraction — POST /webhooks/slack/interactions
 *   3. receiveSlackCommand     — POST /webhooks/slack/commands
 *   4. receiveTeamsAction      — POST /webhooks/teams/actions
 *   5. receiveTeamsCommand     — POST /webhooks/teams/commands
 *
 * Each handler:
 *   1. Verifies the inbound HMAC signature.
 *   2. Parses the body.
 *   3. Routes to the appropriate logic (actions, commands, events).
 *   4. Returns a structured response.
 *
 * All handlers are pure functions that accept their dependencies
 * via a `WebhookDeps` interface for testability.
 */

import { verifySignature } from './hmac.js';
import { handleAction, type IdempotencyStore, type ActionHandler } from './actions.js';
import { dispatchCommand } from './commands.js';

// ─── Types ──────────────────────────────────────────────────────

export interface WebhookResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string> | undefined;
}

export interface WebhookDeps {
  secret?: string | undefined;
  idempotencyStore: IdempotencyStore;
  actionHandler: ActionHandler;
}

// ─── Helpers ────────────────────────────────────────────────────

function parseBody(raw: string | Buffer): Record<string, unknown> | string {
  const str = typeof raw === 'string' ? raw : raw.toString('utf-8');
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    // Not JSON — return as-is (could be URL-encoded form data).
    return str;
  }
}

function unauthorized(msg: string): WebhookResponse {
  return {
    status: 401,
    body: {
      type: 'https://domio.dev/problems/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: msg,
    },
  };
}

function badRequest(msg: string): WebhookResponse {
  return {
    status: 400,
    body: {
      type: 'https://domio.dev/problems/bad-request',
      title: 'Bad Request',
      status: 400,
      detail: msg,
    },
  };
}

function verifyOrReject(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string | undefined,
  platform: string,
): WebhookResponse | null {
  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  if (signatureHeader && !verifySignature(secret, signatureHeader, bodyStr)) {
    return unauthorized(`Invalid ${platform} signature`);
  }
  return null;
}

// ─── 1. receiveSlackEvent ───────────────────────────────────────

/**
 * receiveSlackEvent handles Slack Event API payloads.
 * Verifies x-slack-signature against the raw body.
 */
export function receiveSlackEvent(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  deps: WebhookDeps,
): WebhookResponse {
  const reject = verifyOrReject(rawBody, signatureHeader, deps.secret, 'Slack');
  if (reject) return reject;

  const body = parseBody(rawBody);

  // Slack URL verification challenge.
  if (typeof body === 'object' && 'challenge' in body) {
    return { status: 200, body: { challenge: body.challenge } };
  }

  // Event callbacks — acknowledge immediately.
  if (typeof body === 'object' && 'event' in body) {
    return { status: 200, body: { ok: true } };
  }

  return badRequest('Unrecognized Slack event payload');
}

// ─── 2. receiveSlackInteraction ─────────────────────────────────

/**
 * receiveSlackInteraction handles Slack interactive component
 * payloads (button clicks, actions). Delegates to the action
 * handler with idempotency.
 */
export async function receiveSlackInteraction(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const reject = verifyOrReject(rawBody, signatureHeader, deps.secret, 'Slack');
  if (reject) return reject;

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  let payload: Record<string, unknown>;
  try {
    // Slack sends interactions as URL-encoded `payload=...` form data.
    if (bodyStr.startsWith('payload=')) {
      const decoded = decodeURIComponent(bodyStr.slice('payload='.length));
      payload = JSON.parse(decoded) as Record<string, unknown>;
    } else {
      payload = JSON.parse(bodyStr) as Record<string, unknown>;
    }
  } catch {
    return badRequest('Invalid JSON payload');
  }

  const result = await handleAction(payload, {
    idempotencyStore: deps.idempotencyStore,
    actionHandler: deps.actionHandler,
    ...(deps.secret !== undefined ? { secret: deps.secret } : {}),
  });

  return { status: result.status, body: result.body };
}

// ─── 3. receiveSlackCommand ─────────────────────────────────────

/**
 * receiveSlackCommand handles Slack slash command invocations.
 * Verifies x-slack-signature and dispatches the command.
 */
export async function receiveSlackCommand(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const reject = verifyOrReject(rawBody, signatureHeader, deps.secret, 'Slack');
  if (reject) return reject;

  const body = parseBody(rawBody);
  const result = await dispatchCommand(body);

  return { status: result.status, body: result.body };
}

// ─── 4. receiveTeamsAction ──────────────────────────────────────

/**
 * receiveTeamsAction handles Microsoft Teams adaptive card action
 * payloads. Verifies x-teams-signature and delegates to the
 * action handler.
 */
export async function receiveTeamsAction(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const reject = verifyOrReject(rawBody, signatureHeader, deps.secret, 'Teams');
  if (reject) return reject;

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyStr) as Record<string, unknown>;
  } catch {
    return badRequest('Invalid JSON payload');
  }

  // Teams adaptive card actions use different field names.
  // Normalize to the CallbackPayload shape the action handler expects.
  const action = payload.action as Record<string, unknown> | undefined;
  const actionData = action?.['data'] as Record<string, unknown> | undefined;
  const from = payload.user as Record<string, unknown> | undefined;
  const normalized: Record<string, unknown> = {
    callback_id: payload.callback_id ?? action?.['id'],
    action: {
      action_id: action?.['id'] ?? payload.actionId ?? '',
      value: typeof actionData === 'object' && actionData !== null
        ? JSON.stringify(actionData)
        : typeof payload === 'object'
          ? JSON.stringify(payload)
          : String(payload),
    },
    user: from ?? payload.from,
    response_url: payload.responseUrl ?? payload.response_url,
  };

  const result = await handleAction(normalized, {
    idempotencyStore: deps.idempotencyStore,
    actionHandler: deps.actionHandler,
    ...(deps.secret !== undefined ? { secret: deps.secret } : {}),
  });

  return { status: result.status, body: result.body };
}

// ─── 5. receiveTeamsCommand ─────────────────────────────────────

/**
 * receiveTeamsCommand handles Microsoft Teams messaging extension
 * or command payloads.
 */
export async function receiveTeamsCommand(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  const reject = verifyOrReject(rawBody, signatureHeader, deps.secret, 'Teams');
  if (reject) return reject;

  const body = parseBody(rawBody);
  const result = await dispatchCommand(body as Record<string, unknown>);

  return { status: result.status, body: result.body };
}
