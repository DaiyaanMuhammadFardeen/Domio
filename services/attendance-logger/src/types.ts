/**
 * @domio/attendance-logger — domain types.
 *
 * Phase 16 W9. Each `AttendanceRecord` is hash-chained within its
 * (workspace, session) partition. SCORM 2004 4th Ed attendance requires
 * `joined_at_ms` + `duration_ms`, plus the chain integrity proof.
 */

export interface AttendanceRecord {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly participant_id: string;
  readonly joined_at_ms: number;
  readonly left_at_ms: number | null;
  readonly duration_ms: number | null;
  readonly scorm_4ed_compliant: boolean;
  readonly prev_hash: string | null;
  readonly hash: string;
  readonly recorded_at_ms: number;
}

export interface AttendanceSummary {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly unique_participants: number;
  readonly total_duration_ms: number;
  readonly avg_duration_ms: number;
  readonly chain_intact: boolean;
  readonly broken_at_seq: number | null;
}

export class AttendanceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AttendanceError';
  }
}
