/**
 * SearchBar — local substring search input for the Help center index.
 *
 * Reuses the same "type-and-see-results" pattern as the docs sidebar
 * SearchBar. The parent passes the query down via props so the client
 * wrapper owns the state and the server page never gets a hydration
 * mismatch.
 */

'use client';

import type { JSX } from 'react';

export interface SearchBarProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder?: string;
  readonly resultCount: number;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search KB articles…',
  resultCount,
}: SearchBarProps): JSX.Element {
  return (
    <div className="help-search" data-testid="help-search">
      <label className="help-search__label" htmlFor="help-search-input">
        Search the help center
      </label>
      <input
        id="help-search-input"
        type="search"
        className="help-search__input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid="help-search-input"
        autoComplete="off"
        spellCheck={false}
      />
      <p className="help-search__count" data-testid="help-search-count">
        {value.trim().length === 0
          ? `${resultCount} articles across all categories`
          : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

export default SearchBar;
