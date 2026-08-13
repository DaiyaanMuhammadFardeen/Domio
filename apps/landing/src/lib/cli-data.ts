/**
 * Hardcoded data backing the public CLI download page.
 *
 * S10.4 — CLI download page. These constants are the single source of truth
 * used by InstallInstructions, CommandList, and ExamplesGallery. They live in
 * /lib (not /components) so the data layer stays decoupled from the React
 * surface and can be imported by future docs sites or marketing experiments.
 */

export type CliOs = 'macos' | 'linux' | 'windows';
export type CliPackageManager = 'brew' | 'apt' | 'scoop' | 'curl' | 'choco';

export interface CliCommandFlag {
  readonly flag: string;
  readonly description: string;
}

export interface CliCommand {
  readonly name: string;
  readonly synopsis: string;
  readonly description: string;
  readonly flags: ReadonlyArray<CliCommandFlag>;
}

export interface InstallSnippet {
  readonly os: CliOs;
  readonly manager: CliPackageManager;
  readonly command: string;
}

export interface CliExample {
  readonly title: string;
  readonly description: string;
  readonly command: string;
}

/**
 * Subcommands exposed by the `deckctl` CLI. Order matches the man page.
 */
export const COMMANDS: ReadonlyArray<CliCommand> = [
  {
    name: 'create',
    synopsis: 'deckctl create [name] [--template <id>] [--from <file>]',
    description:
      'Scaffold a new deck in the current directory. Pulls a starter template by id, or imports an existing file.',
    flags: [
      { flag: '--template <id>', description: 'Use a public template by id.' },
      { flag: '--from <file>', description: 'Import from a local .ddeck or .json file.' },
      { flag: '--public', description: 'Mark the deck as publicly linkable on creation.' },
    ],
  },
  {
    name: 'push',
    synopsis: 'deckctl push [--message <msg>] [--force]',
    description:
      'Sync local edits to the remote workspace. Opens a draft if the deck is new; otherwise commits on top of HEAD.',
    flags: [
      { flag: '--message <msg>', description: 'Commit message; defaults to a generated summary.' },
      { flag: '--force', description: 'Overwrite a remote draft with the local working copy.' },
      { flag: '--dry-run', description: 'Show the diff that would be pushed without sending it.' },
    ],
  },
  {
    name: 'pull',
    synopsis: 'deckctl pull [--rebase]',
    description:
      'Fetch the latest remote state into the local working copy. Use --rebase to replay local commits on top.',
    flags: [
      { flag: '--rebase', description: 'Replay local commits on top of the fetched HEAD.' },
      { flag: '--quiet', description: 'Suppress per-file progress output.' },
    ],
  },
  {
    name: 'diff',
    synopsis: 'deckctl diff [--format text|json] [--color]',
    description:
      'Show structured differences between the local working copy and the remote HEAD. JSON output is stable for agents.',
    flags: [
      { flag: '--format <fmt>', description: 'Output format: text (default) or json.' },
      { flag: '--color', description: 'Force ANSI colour even when stdout is piped.' },
      { flag: '--slide <index>', description: 'Limit the diff to a single slide.' },
    ],
  },
  {
    name: 'export',
    synopsis: 'deckctl export <format> [--out <path>] [--watch]',
    description:
      'Render the deck to PDF, PPTX, or HTML. --watch re-runs on file change, useful for live previews.',
    flags: [
      { flag: '--out <path>', description: 'Destination file or directory.' },
      { flag: '--watch', description: 'Re-export whenever the source deck changes.' },
      { flag: '--include <glob>', description: 'Restrict exported slides by glob (e.g. "0-3,7").' },
    ],
  },
  {
    name: 'patch',
    synopsis: 'deckctl patch <slide-index> <json-patch>',
    description:
      'Apply a single JSON Patch document to one slide. The patch shape mirrors the deck-CRDT op format used by the editor.',
    flags: [
      {
        flag: '--dry-run',
        description: 'Validate the patch and print the resulting slide without writing.',
      },
      {
        flag: '--from-stdin',
        description: 'Read the patch document from stdin instead of an argument.',
      },
    ],
  },
  {
    name: 'login',
    synopsis: 'deckctl login [--device]',
    description:
      'Authenticate with the Domio API. --device prints a code + URL for headless machines and waits for completion.',
    flags: [
      { flag: '--device', description: 'Use the OAuth device-code flow.' },
      { flag: '--profile <name>', description: 'Store the token under a named profile.' },
    ],
  },
  {
    name: 'logout',
    synopsis: 'deckctl logout [--profile <name>]',
    description: 'Clear the locally cached credentials for the active profile (or a named one).',
    flags: [
      {
        flag: '--profile <name>',
        description: 'Clear a specific named profile instead of the active one.',
      },
      { flag: '--all', description: 'Clear every profile stored on this machine.' },
    ],
  },
];

/**
 * Install snippets grouped by OS then package manager.
 */
export const INSTALLS: ReadonlyArray<InstallSnippet> = [
  {
    os: 'macos',
    manager: 'brew',
    command: 'brew install domio/tap/deckctl',
  },
  {
    os: 'linux',
    manager: 'apt',
    command:
      'curl -fsSL https://pkg.domio.app/apt/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/domio.gpg && echo "deb [signed-by=/usr/share/keyrings/domio.gpg] https://pkg.domio.app/apt stable main" | sudo tee /etc/apt/sources.list.d/domio.list && sudo apt update && sudo apt install -y deckctl',
  },
  {
    os: 'linux',
    manager: 'curl',
    command: 'curl -fsSL https://get.domio.app/deckctl | sh',
  },
  {
    os: 'windows',
    manager: 'scoop',
    command:
      'scoop bucket add domio https://github.com/domio/scoop-bucket && scoop install deckctl',
  },
  {
    os: 'windows',
    manager: 'choco',
    command: 'choco install deckctl -y',
  },
];

/**
 * Worked examples shown in the gallery. Each snippet should be copy-paste runnable.
 */
export const EXAMPLES: ReadonlyArray<CliExample> = [
  {
    title: 'Create a new deck from a template',
    description:
      'Scaffold a fresh deck in the current directory using the "pitch-deck" template, ready to push.',
    command: 'deckctl create my-pitch --template pitch-deck && cd my-pitch && deckctl push',
  },
  {
    title: 'Push local changes to remote',
    description:
      'Commit the working copy with a human-readable message. The CLI auto-generates one if you skip --message.',
    command: 'deckctl push --message "Tighten intro slide + add pricing callout"',
  },
  {
    title: 'Diff local vs remote',
    description:
      'Render a structured diff as JSON. Useful for agents that want to reason about the change set.',
    command: "deckctl diff --format json | jq '.slides[].ops[]'",
  },
  {
    title: 'Export to PDF',
    description:
      'Render the deck to a single PDF next to the working copy. Pass --watch for live re-renders.',
    command: 'deckctl export pdf --out ./build/my-pitch.pdf',
  },
  {
    title: 'Patch a single slide',
    description:
      'Apply a JSON Patch document to slide index 2 (the closing slide). Useful for headless automation.',
    command: 'deckctl patch 2 --from-stdin < closing-slide.patch.json',
  },
];
