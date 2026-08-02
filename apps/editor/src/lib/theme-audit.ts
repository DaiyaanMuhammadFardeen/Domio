/**
 * Theme audit types shared between the editor's ThemeBrandPanel and
 * the a11y worker / theme-service hookup.
 */

export type AuditSeverity = 'BLOCK' | 'WARN' | 'INFO';

export interface A11yAuditFinding {
  readonly severity: AuditSeverity;
  readonly tokenId: string;
  readonly issue: string;
  readonly suggestion?: string;
}

export interface A11yAuditReport {
  readonly themeId: string;
  readonly brandContextId: string;
  readonly findings: readonly A11yAuditFinding[];
  readonly prefersReducedMotionSafe: boolean;
}