/**
 * CommandList — renders the deckctl subcommand reference.
 *
 * S10.4 — one card per subcommand (create, push, pull, diff, export,
 * patch, login, logout). Each card shows the synopsis, the supported
 * flags, and a short description.
 */

import type { JSX } from 'react';
import type { CliCommand } from '../../lib/cli-data';

export interface CommandListProps {
  readonly commands: ReadonlyArray<CliCommand>;
}

export function CommandList({ commands }: CommandListProps): JSX.Element {
  return (
    <section className="cli-commands" aria-labelledby="cli-commands-heading">
      <h2 id="cli-commands-heading" className="cli-section-heading">
        Commands
      </h2>
      <ul className="cli-command-list">
        {commands.map((cmd) => (
          <li key={cmd.name} className="cli-command-card">
            <div className="cli-command-card__head">
              <span className="cli-command-card__prompt">$</span>
              <code className="cli-command-card__name">deckctl {cmd.name}</code>
            </div>
            <p className="cli-command-card__synopsis">
              <code>{cmd.synopsis}</code>
            </p>
            <p className="cli-command-card__description">{cmd.description}</p>
            {cmd.flags.length > 0 && (
              <div className="cli-command-card__flags">
                <h3 className="cli-command-card__flags-heading">Flags</h3>
                <dl className="cli-flag-list">
                  {cmd.flags.map((flag) => (
                    <div key={flag.flag} className="cli-flag">
                      <dt className="cli-flag__name">
                        <code>{flag.flag}</code>
                      </dt>
                      <dd className="cli-flag__description">{flag.description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CommandList;
