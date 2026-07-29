import { describe, it, expect } from 'vitest';
import { emit, sha256, buildStatement, signPredicate } from '../src/emit.js';
import { verify } from '../src/verify.js';
import { canonicalize } from '../src/canonical.js';

const KEY = 'shhh-very-secret-32-byte-key-min!';
const KEY_ID = 'local-hmac';

describe('emit', () => {
  it('produces a signed envelope', () => {
    const env = emit(
      [{ uri: 'oci://ghcr.io/org/app:abc', digest: { sha256: 'abcd' } }],
      [{ uri: 'git+https://github.com/org/app', digest: { sha1: '1234' } }],
      {
        signingKey: KEY,
        keyId: KEY_ID,
        builderId: 'https://github.com/actions/runner',
        externalParameters: { workflow: '.github/workflows/build-provenance.yml' },
        invocationId: 'invocation-1',
      },
    );
    expect(env.payloadType).toBe('application/vnd.in-toto+json');
    expect(env.signatures).toHaveLength(1);
    expect(env.signatures[0].keyid).toBe(KEY_ID);

    const stmt = JSON.parse(Buffer.from(env.payload, 'base64').toString('utf8'));
    expect(stmt.predicateType).toBe('https://slsa.dev/provenance/v1');
    expect(stmt.subject).toHaveLength(1);
    expect(stmt.subject[0].digest.sha256).toBe('abcd');
    expect(stmt.predicate.buildDefinition.resolvedDependencies).toHaveLength(1);
    expect(stmt.predicate.runDetails.builder.id).toBe('https://github.com/actions/runner');
  });

  it('produces stable signed payload for identical inputs', () => {
    const opts = { signingKey: KEY, keyId: KEY_ID, builderId: 'test' };
    const a = emit(
      [{ uri: 'a', digest: { sha256: 'h1' } }],
      [],
      opts,
    );
    const b = emit(
      [{ uri: 'a', digest: { sha256: 'h1' } }],
      [],
      opts,
    );
    // canonicalize is key-order-insensitive; payload should be deterministic
    const stmt = JSON.parse(Buffer.from(a.payload, 'base64').toString('utf8'));
    const stmt2 = JSON.parse(Buffer.from(b.payload, 'base64').toString('utf8'));
    expect(canonicalize(stmt)).toBe(canonicalize(stmt2));
  });

  it('rejects empty subjects', () => {
    expect(() =>
      emit([], [], { signingKey: KEY, keyId: KEY_ID, builderId: 'test' }),
    ).toThrow();
  });

  it('rejects empty digest', () => {
    expect(() =>
      emit([{ uri: 'x', digest: {} }], [], { signingKey: KEY, keyId: KEY_ID, builderId: 'test' }),
    ).toThrow();
  });

  it('rejects missing builderId', () => {
    expect(() =>
      emit(
        [{ uri: 'x', digest: { sha256: 'a' } }],
        [],
        { signingKey: KEY, keyId: KEY_ID, builderId: '' },
      ),
    ).toThrow();
  });

  it('sha256 returns lowercase hex of correct length', () => {
    const h = sha256(Buffer.from('hello'));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('buildStatement surfaces externalParameters and runDetails metadata', () => {
    const stmt = buildStatement(
      [{ uri: 'a', digest: { sha256: 'h' } }],
      [],
      {
        signingKey: KEY,
        keyId: KEY_ID,
        builderId: 'b',
        externalParameters: { foo: 'bar' },
        environment: { node: 'v22' },
      },
    );
    expect(stmt.predicate.buildDefinition.externalParameters).toEqual({ foo: 'bar' });
    expect(stmt.predicate.runDetails.builder?.id).toBe('b');
  });

  it('signPredicate requires both key and keyId', () => {
    expect(() => signPredicate({}, '', 'k')).toThrow();
    expect(() => signPredicate({}, 'k', '')).toThrow();
  });
});

describe('verify', () => {
  function makeEnv(extra?: { builderId?: string }) {
    return emit(
      [{ uri: 'oci://x:y', digest: { sha256: 'deadbeef' } }],
      [{ uri: 'git+https://example.com', digest: { sha1: 'cafe' } }],
      {
        signingKey: KEY,
        keyId: KEY_ID,
        builderId: extra?.builderId ?? 'https://example.com/builder',
      },
    );
  }

  it('accepts a valid envelope', () => {
    const env = makeEnv();
    expect(verify(env, { keys: { [KEY_ID]: KEY } }).ok).toBe(true);
  });

  it('rejects a tampered payload (signature mismatch)', () => {
    const env = makeEnv();
    const tampered = { ...env, payload: Buffer.from('{"predicateType":"https://slsa.dev/provenance/v1","subject":[],"predicate":{}}').toString('base64') };
    const r = verify(tampered, { keys: { [KEY_ID]: KEY } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/signature mismatch|payload decode|keyid/);
  });

  it('rejects when keyid is unknown', () => {
    const env = makeEnv();
    const r = verify(env, { keys: { 'other-key': KEY } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no matching keyid/);
  });

  it('rejects wrong payloadType', () => {
    const env = makeEnv();
    const r = verify({ ...env, payloadType: 'wrong' }, { keys: { [KEY_ID]: KEY } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/payloadType/);
  });

  it('rejects malformed payload base64', () => {
    const env = makeEnv();
    const r = verify({ ...env, payload: '!!!notbase64!!!' }, { keys: { [KEY_ID]: KEY } });
    expect(r.ok).toBe(false);
  });

  it('rejects non-object envelope', () => {
    expect(verify(null, { keys: { [KEY_ID]: KEY } }).ok).toBe(false);
    expect(verify('string', { keys: { [KEY_ID]: KEY } }).ok).toBe(false);
  });

  it('rejects envelopes with no signatures', () => {
    const env = makeEnv();
    const r = verify({ ...env, signatures: [] }, { keys: { [KEY_ID]: KEY } });
    expect(r.ok).toBe(false);
  });

  it('enforces expected digests when provided', () => {
    const env = makeEnv();
    const good = verify(env, { keys: { [KEY_ID]: KEY }, expectedDigests: { sha256: 'deadbeef' } });
    expect(good.ok).toBe(true);

    const bad = verify(env, { keys: { [KEY_ID]: KEY }, expectedDigests: { sha256: 'wrong' } });
    expect(bad.ok).toBe(false);
  });

  it('rejects off-by-one canonical edits', () => {
    // Re-validate that canonicalization actually stabilizes payload — adding
    // a single character to the predicate must invalidate the signature.
    const env = makeEnv();
    const stmt = JSON.parse(Buffer.from(env.payload, 'base64').toString('utf8'));
    stmt.predicate.runDetails.builder!.id = 'https://attacker.example.com/';
    const tampered = {
      ...env,
      payload: Buffer.from(JSON.stringify(stmt), 'utf8').toString('base64'),
    };
    const r = verify(tampered, { keys: { [KEY_ID]: KEY } });
    expect(r.ok).toBe(false);
  });
});