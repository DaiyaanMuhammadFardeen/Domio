export interface LintViolation {
  rule: string;
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
  hint?: string;
}

export interface LintMigration {
  /** Path of the migration file (relative to migrations root). */
  file: string;
  /** "up" or "down". */
  direction: 'up' | 'down';
  /** Migration numeric prefix (e.g. 0001). */
  sequence: string;
  /** Raw SQL statements already parsed. */
  statements: { sql: string; startLine: number }[];
  /** Annotation lines parsed from leading comments. */
  annotations: Record<string, string>;
}

export interface Rule {
  id: string;
  description: string;
  defaultSeverity: 'error' | 'warning';
  /** Human-friendly documentation. */
  docs?: string;
  check(migration: LintMigration, all: LintMigration[]): LintViolation[];
}
