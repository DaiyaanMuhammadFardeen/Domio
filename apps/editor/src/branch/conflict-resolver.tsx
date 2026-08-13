import type { ReactElement } from 'react';
import type { DiffConflict } from './types.js';
import { conflictKey } from './merge-request-view.js';

export interface ConflictResolverProps {
  conflicts: DiffConflict[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function ConflictResolver({
  conflicts,
  values,
  onChange,
}: ConflictResolverProps): ReactElement {
  return (
    <section aria-label="Conflict resolver" className="conflict-resolver">
      <h3>Conflicts</h3>
      <ul>
        {conflicts.map((conflict) => {
          const key = conflictKey(conflict);
          const selected =
            values[key] === conflict.sourceValue
              ? 'theirs'
              : values[key] === conflict.targetValue
                ? 'ours'
                : '';
          return (
            <li key={key}>
              <code>{conflict.path}</code>
              <div className="conflict-resolver__choices">
                <button
                  type="button"
                  aria-pressed={selected === 'theirs'}
                  onClick={() => onChange({ ...values, [key]: conflict.sourceValue })}
                >
                  Theirs
                </button>
                <button
                  type="button"
                  aria-pressed={selected === 'ours'}
                  onClick={() => onChange({ ...values, [key]: conflict.targetValue })}
                >
                  Ours
                </button>
                <label>
                  Manual{' '}
                  <textarea
                    aria-label={`Manual value for ${conflict.path}`}
                    value={
                      typeof values[key] === 'string'
                        ? (values[key] as string)
                        : JSON.stringify(values[key] ?? conflict.baseValue)
                    }
                    onChange={(e) => {
                      let value: unknown = e.target.value;
                      try {
                        value = JSON.parse(e.target.value);
                      } catch {
                        /* retain text */
                      }
                      onChange({ ...values, [key]: value });
                    }}
                  />
                </label>
              </div>
              <details>
                <summary>Preview values</summary>
                <pre>
                  {JSON.stringify(
                    {
                      base: conflict.baseValue,
                      theirs: conflict.sourceValue,
                      ours: conflict.targetValue,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ConflictResolver;
