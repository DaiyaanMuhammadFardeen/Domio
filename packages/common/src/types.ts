/**
 * Shared utility types.
 */

export type ISODateString = string;

/** Deep partial that recurses into arrays and objects. */
export type DeepPartial<T> = T extends Date
  ? T
  : T extends RegExp
    ? T
    : T extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>
        : T extends object
          ? { [K in keyof T]?: DeepPartial<T[K]> }
          : T;

/** Branded id type pattern. Reserved for future use. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** String literal union of tenant kinds. */
export type TenantKind = 'org' | 'workspace' | 'team';

/** String literal union of audit actor kinds (mirrors the proto). */
export type AuditActorKind = 'user' | 'agent' | 'system' | 'cron' | 'admin' | 'service';

export interface AuditActor {
  actor_kind: AuditActorKind;
  actor_id: string;
  display_name?: string;
  ip_address?: string;
  user_agent?: string;
}
