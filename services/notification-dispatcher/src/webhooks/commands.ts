/**
 * Notification dispatcher — slash commands.
 *
 * Parses incoming Slack/Teams slash command payloads and routes
 * them through a command registry. Each registered command
 * returns a response payload (Slack or Teams format).
 *
 * Built-in commands:
 *   /domio approve {id}   — approve a pending request
 *   /domio open {deck_id} — open a deck in the editor
 *   /domio help           — show available commands
 *
 * Unknown commands return a 404 ProblemDetail.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface SlashCommand {
  command: string;
  text: string;
  trigger_id: string;
  /** Platform user ID (Slack user_id, Teams from.id). */
  user_id?: string | undefined;
}

export interface CommandResponse {
  /** Text response (Slack: response_type ephemeral/in_channel). */
  text: string;
  /** Optional structured blocks (Slack Block Kit). */
  blocks?: unknown[] | undefined;
}

export interface CommandResult {
  status: number;
  body: CommandResponse | ProblemDetail;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
}

// ─── Command runner ─────────────────────────────────────────────

export interface CommandRunner {
  run(command: string, args: string, context: { trigger_id: string; user_id?: string | undefined }): Promise<CommandResult>;
}

/** NoopCommandRunner echoes the command back. */
export class NoopCommandRunner implements CommandRunner {
  async run(command: string, args: string): Promise<CommandResult> {
    return {
      status: 200,
      body: {
        text: `Command received: ${command} ${args}`.trim(),
      },
    };
  }
}

// ─── Parse ──────────────────────────────────────────────────────

/**
 * parseSlashCommand parses a URL-encoded form body from Slack/Teams
 * slash command invocation into a SlashCommand.
 *
 * Slack format: command=/domio+approve&text=abc123&trigger_id=xxx
 * Teams format: { text: '/domio approve abc123', triggerId: 'xxx' }
 */
export function parseSlashCommand(body: string | Record<string, unknown>): SlashCommand {
  if (typeof body === 'string') {
    return parseUrlEncoded(body);
  }
  return parseJsonBody(body);
}

function parseUrlEncoded(formBody: string): SlashCommand {
  const params = new URLSearchParams(formBody);
  const rawCommand = params.get('command') ?? '';
  const text = params.get('text') ?? '';
  const trigger_id = params.get('trigger_id') ?? '';
  const user_id = params.get('user_id') ?? undefined;

  // Normalize: strip leading slash and optional workspace prefix.
  const command = rawCommand.replace(/^\//, '').toLowerCase();

  return { command, text, trigger_id, user_id };
}

function parseJsonBody(body: Record<string, unknown>): SlashCommand {
  // Teams may send the full command with / prefix.
  const rawText = typeof body.text === 'string' ? body.text : '';
  const trigger_id = typeof body.triggerId === 'string'
    ? body.triggerId
    : typeof body.trigger_id === 'string'
      ? body.trigger_id
      : '';
  const user_id = typeof body.userId === 'string'
    ? body.userId
    : typeof body.user_id === 'string'
      ? body.user_id
      : undefined;

  // Extract command from text: "/domio approve abc" → command="domio", text="approve abc"
  const parts = rawText.trim().split(/\s+/);
  const command = (parts[0] ?? '').replace(/^\//, '').toLowerCase();
  const text = parts.slice(1).join(' ');

  return { command, text, trigger_id, user_id };
}

// ─── Command registry ───────────────────────────────────────────

export type CommandHandler = (args: string, context: { trigger_id: string; user_id?: string | undefined }) => Promise<CommandResult>;

const COMMAND_REGISTRY = new Map<string, CommandHandler>();

/** registerCommand adds a command handler to the global registry. */
export function registerCommand(name: string, handler: CommandHandler): void {
  COMMAND_REGISTRY.set(name.toLowerCase(), handler);
}

/** getCommand returns the handler for a command, or undefined. */
export function getCommand(name: string): CommandHandler | undefined {
  return COMMAND_REGISTRY.get(name.toLowerCase());
}

// ─── Built-in commands ─────────────────────────────────────────

const builtInApprove: CommandHandler = async (args: string) => {
  const id = args.trim();
  if (!id) {
    return {
      status: 400,
      body: {
        type: 'https://domio.dev/problems/missing-argument',
        title: 'Missing argument',
        status: 400,
        detail: 'Usage: /domio approve {id}',
      },
    };
  }
  return {
    status: 200,
    body: { text: `Approval request \`${id}\` has been noted. The actual approval action will be processed by the collab service.` },
  };
};

const builtInOpen: CommandHandler = async (args: string) => {
  const deckId = args.trim();
  if (!deckId) {
    return {
      status: 400,
      body: {
        type: 'https://domio.dev/problems/missing-argument',
        title: 'Missing argument',
        status: 400,
        detail: 'Usage: /domio open {deck_id}',
      },
    };
  }
  return {
    status: 200,
    body: { text: `Opening deck \`${deckId}\` — [open in Domio](https://app.domio.dev/decks/${deckId})` },
  };
};

const builtInHelp: CommandHandler = async (_args: string) => ({
  status: 200,
  body: {
    text: [
      '*Domio Commands*',
      '• `/domio approve {id}` — approve a pending request',
      '• `/domio open {deck_id}` — open a deck in the editor',
      '• `/domio help` — show this help message',
    ].join('\n'),
  },
});

/** Register built-in commands on module load. */
registerCommand('approve', builtInApprove);
registerCommand('open', builtInOpen);
registerCommand('help', builtInHelp);

// ─── Dispatch ───────────────────────────────────────────────────

/**
 * dispatchCommand parses a slash command body and routes it
 * through the registry. Handles the "domio" top-level command
 * by delegating to the sub-command (approve, open, help).
 */
export async function dispatchCommand(
  body: string | Record<string, unknown>,
): Promise<CommandResult> {
  const parsed = parseSlashCommand(body);

  // "/domio approve abc" → command="domio", text="approve abc"
  // Route to sub-command if the top-level is "domio"
  let commandName = parsed.command;
  let args = parsed.text;

  if (commandName === 'domio') {
    const subParts = parsed.text.split(/\s+/);
    const subCommand = (subParts[0] ?? '').toLowerCase();
    if (subCommand && COMMAND_REGISTRY.has(subCommand)) {
      commandName = subCommand;
      args = subParts.slice(1).join(' ');
    }
    // If no recognized sub-command, try "help"
    if (commandName === 'domio') {
      commandName = 'help';
      args = '';
    }
  }

  const handler = COMMAND_REGISTRY.get(commandName);
  if (!handler) {
    return {
      status: 404,
      body: {
        type: 'https://domio.dev/problems/unknown-command',
        title: 'Unknown command',
        status: 404,
        detail: `Unknown command: /${parsed.command} ${parsed.text}`.trim(),
      },
    };
  }

  return handler(args, { trigger_id: parsed.trigger_id, user_id: parsed.user_id });
}
