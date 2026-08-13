import { describe, it, expect } from 'vitest';
import {
  redactString,
  redactPII,
  looksLikeSecretKey,
  luhnValid,
  isPublicIPv4,
} from '../src/index.js';

describe('redactString (positive matches)', () => {
  it('redacts a basic email', () => {
    expect(redactString('contact alice@example.com please')).toBe(
      'contact [redacted:email] please',
    );
  });

  it('redacts multiple emails in one string', () => {
    expect(redactString('alice@example.com, bob@example.co.uk')).toBe(
      '[redacted:email], [redacted:email]',
    );
  });

  it('redacts an international BD phone', () => {
    expect(redactString('Call +8801712345678 immediately')).toBe(
      'Call [redacted:phone-bd] immediately',
    );
  });

  it('redacts a local BD phone', () => {
    expect(redactString('Call 01712345678 right now')).toBe('Call [redacted:phone-bd] right now');
  });

  it('redacts a non-BD E.164 number', () => {
    expect(redactString('Call +14155552671 please')).toBe('Call [redacted:phone] please');
  });

  it('redacts a 10-digit NID-shaped number', () => {
    expect(redactString('NID 1234567890 here')).toBe('NID [redacted:nid-bd] here');
  });

  it('redacts a 13-digit NID-shaped number', () => {
    expect(redactString('Old NID 1234567890123 here')).toBe('Old NID [redacted:nid-bd] here');
  });

  it('redacts a valid Luhn credit card', () => {
    expect(redactString('Card 4111 1111 1111 1111 here')).toContain('[redacted:cc]');
  });

  it('does NOT redact credit-card-shaped string that fails Luhn', () => {
    expect(redactString('Number 4111 1111 1111 1112 here')).toContain('4111 1111 1111 1112');
  });

  it('redacts a JWT', () => {
    expect(
      redactString('Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x9X-t8c7z-7YhQy7pRk2wQ'),
    ).toContain('[redacted:jwt]');
  });

  it('redacts an AWS access key', () => {
    expect(redactString('Key AKIAIOSFODNN7EXAMPLE')).toContain('[redacted:aws-key]');
  });

  it('redacts a Stripe live key', () => {
    expect(redactString('Stripe sk_live_abcdefghijklmnopqrs')).toContain('[redacted:stripe-key]');
  });

  it('redacts an OpenAI key', () => {
    expect(redactString('OpenAI sk-proj-abcdefghijklmnopqrstuvwxyz')).toContain(
      '[redacted:openai-key]',
    );
  });

  it('redacts an Anthropic key', () => {
    expect(redactString('Claude sk-ant-api03-abc123def456ghi789jkl012mno345pqr678')).toContain(
      '[redacted:anthropic-key]',
    );
  });

  it('redacts a public IPv4 address', () => {
    expect(redactString('Server 8.8.8.8 reported')).toBe('Server [redacted:ip] reported');
  });

  it('does NOT redact a private IPv4 (RFC 1918)', () => {
    expect(redactString('Internal 10.0.0.1 reported')).toContain('10.0.0.1');
  });

  it('does NOT redact a loopback IPv4', () => {
    expect(redactString('Loopback 127.0.0.1 here')).toContain('127.0.0.1');
  });
});

describe('redactString (negative / no-match)', () => {
  it('returns input unchanged when nothing matches', () => {
    expect(redactString('hello world 2026')).toBe('hello world 2026');
  });

  it('returns empty string unchanged', () => {
    expect(redactString('')).toBe('');
  });

  it('returns short numbers unchanged', () => {
    expect(redactString('order 12345 placed')).toBe('order 12345 placed');
  });

  it('does not over-redact on a single digit NID-shaped string', () => {
    // 10-digit NID regex only matches exactly 10 digits as a token, but 123456789 is 9 digits
    expect(redactString('nid=123456789')).toBe('nid=123456789');
  });

  it('does not redact random hex strings under 40 chars', () => {
    expect(redactString('hash abc123def456')).toBe('hash abc123def456');
  });

  it('handles Unicode without crashing', () => {
    expect(redactString('নমস্কার alice@example.com')).toBe('নমস্কার [redacted:email]');
  });

  it('preserves punctuation around redacted text', () => {
    expect(redactString('Email: alice@example.com.')).toBe('Email: [redacted:email].');
  });

  it('is idempotent on already-redacted text', () => {
    const once = redactString('contact alice@example.com');
    const twice = redactString(once);
    expect(twice).toBe(once);
  });
});

describe('looksLikeSecretKey', () => {
  it.each([
    'apiKey',
    'api_key',
    'apikey',
    'password',
    'PASSWORD',
    'token',
    'access_token',
    'jwt',
    'bearer',
    'authorization',
    'cookie',
    'set-cookie',
    'secret',
    'client_secret',
  ])('flags %s as a secret-like key', (key) => {
    expect(looksLikeSecretKey(key)).toBe(true);
  });

  it.each(['name', 'email', 'count', 'id', 'value', 'data', 'enabled'])(
    'does NOT flag %s',
    (key) => {
      expect(looksLikeSecretKey(key)).toBe(false);
    },
  );
});

describe('luhnValid', () => {
  it('accepts 4111111111111111', () => expect(luhnValid('4111111111111111')).toBe(true));
  it('accepts 5555555555554444', () => expect(luhnValid('5555555555554444')).toBe(true));
  it('rejects 4111111111111112', () => expect(luhnValid('4111111111111112')).toBe(false));
  it('rejects empty string', () => expect(luhnValid('')).toBe(false));
  it('rejects too short', () => expect(luhnValid('1234567890')).toBe(false));
  it('rejects too long', () => expect(luhnValid('12345678901234567890')).toBe(false));
});

describe('isPublicIPv4', () => {
  it.each(['10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.0.1', '172.31.255.255', '127.0.0.1'])(
    'flags %s as a private IPv4 (returns false)',
    (ip) => expect(isPublicIPv4(ip)).toBe(false),
  );
  it.each(['8.8.8.8', '1.1.1.1', '4.4.4.4'])('flags %s as a public IPv4 (returns true)', (ip) =>
    expect(isPublicIPv4(ip)).toBe(true),
  );
  it('does not flag malformed input', () => expect(isPublicIPv4('999.999.999.999')).toBe(false));
  it('does not flag empty input', () => expect(isPublicIPv4('')).toBe(false));
  it('does not flag multicast / reserved', () => expect(isPublicIPv4('224.0.0.1')).toBe(false));
});

describe('redactPII (deep object)', () => {
  it('redacts PII nested in objects without mutation', () => {
    const input = {
      name: 'Alice',
      email: 'alice@example.com',
      profile: { phone: '+8801712345678' },
      notes: ['hello', 'bob@example.com'],
    };
    const redacted = redactPII(input);
    expect(redacted.email).toBe('[redacted:email]');
    expect(redacted.profile.phone).toBe('[redacted:phone-bd]');
    expect(redacted.notes[1]).toBe('[redacted:email]');
    // Original is unchanged.
    expect(input.email).toBe('alice@example.com');
    expect(input.profile.phone).toBe('+8801712345678');
  });

  it('redacts secret-named keys wholesale', () => {
    const input = { password: 'hunter2', apiKey: 'sk-abcdef12345', data: 'safe' };
    const redacted = redactPII(input) as typeof input;
    expect(redacted.password).toBe('[redacted:secret]');
    expect(redacted.apiKey).toBe('[redacted:secret]');
    expect(redacted.data).toBe('safe');
  });

  it('handles cycles', () => {
    const a: any = { name: 'alice@example.com' };
    a.self = a;
    const redacted = redactPII(a) as any;
    expect(redacted.name).toBe('[redacted:email]');
    expect(redacted.self).toBe('[redacted:cycle]');
  });

  it('does not recurse past MAX_DEPTH', () => {
    let obj: any = { v: 'safe' };
    for (let i = 0; i < 50; i++) obj = { nested: obj };
    const redacted = redactPII(obj) as any;
    // Depth-limited path returns [redacted:depth] sentinel somewhere along the way
    expect(JSON.stringify(redacted)).toContain('[redacted:depth]');
  });

  it('truncates oversized strings', () => {
    const huge = 'x'.repeat(200_000) + ' alice@example.com';
    const redacted = redactPII({ data: huge }) as { data: string };
    expect(redacted.data).toContain('[truncated]');
  });

  it('preserves Dates (does not call toString)', () => {
    const d = new Date('2026-07-29T00:00:00Z');
    const redacted = redactPII({ ts: d }) as { ts: Date };
    expect(redacted.ts).toBeInstanceOf(Date);
    expect(redacted.ts.getTime()).toBe(d.getTime());
  });

  it('redacts error messages', () => {
    const e = new Error('Failed for alice@example.com');
    const redacted = redactPII({ err: e }) as { err: Error };
    expect(redacted.err.message).toBe('Failed for [redacted:email]');
  });

  it('handles arrays of mixed types', () => {
    const input = [1, 'bob@example.com', { secret: 'shh' }, null];
    const r = redactPII(input);
    expect((r as any[])[1]).toBe('[redacted:email]');
    expect(((r as any[])[2] as any).secret).toBe('[redacted:secret]');
    expect((r as any[])[3]).toBeNull();
  });

  it('allIPs option forces redaction of loopback', () => {
    expect(redactString('Connect to 127.0.0.1', { allIPs: true })).toBe('Connect to [redacted:ip]');
    expect(redactString('Connect to 127.0.0.1')).toContain('127.0.0.1');
  });
});
