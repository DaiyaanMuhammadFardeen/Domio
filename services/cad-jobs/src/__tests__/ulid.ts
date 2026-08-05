/**
 * Tiny ULID-shaped helper reserved for future use when the
 * defaultIdGenerator needs to be replaced with a deterministic
 * monotonic generator. Exists today so the import in the test file
 * resolves and as a placeholder for that migration.
 */

export function ulid(): string {
  let id = '';
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (let i = 0; i < 26; i++) {
    id += chars[Math.floor(Math.random() * 32)]!;
  }
  return id;
}