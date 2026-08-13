/**
 * ValuesList — company values rendered as a 2- or 3-column grid.
 *
 * S12.11 — pure presentational server component. Driven by the
 * VALUES array in careers-data.ts.
 */

import type { JSX } from 'react';

export interface ValuesListProps {
  readonly values: ReadonlyArray<{
    readonly title: string;
    readonly description: string;
  }>;
}

export function ValuesList({ values }: ValuesListProps): JSX.Element {
  return (
    <section
      className="careers-values"
      aria-labelledby="careers-values-heading"
    >
      <h2 id="careers-values-heading" className="careers-section-heading">
        How we work
      </h2>
      <ul className="careers-values__list" data-testid="values-list">
        {values.map((v) => (
          <li key={v.title} className="careers-values__item">
            <h3 className="careers-values__title">{v.title}</h3>
            <p className="careers-values__description">{v.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ValuesList;