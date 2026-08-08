/**
 * License signer tests (Phase 19 Wave 2).
 *
 * Tests for SandboxLicenseSigner: token shape (3 parts),
 * HMAC verification, exp 365d.
 */

import { describe, it, expect } from 'vitest';
import { SandboxLicenseSigner, verifyLicenseToken } from './license.js';

describe('SandboxLicenseSigner', () => {
  const signer = new SandboxLicenseSigner();

  it('issues a token with 3 parts (header.payload.signature)', async () => {
    const token = await signer.issueLicenseGrant({
      listing_id: 'l1',
      buyer_id: 'b1',
      version: '1.0',
      scopes: ['use'],
      seats: 1,
    });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('token header decodes to {alg: "HS256", typ: "JWT"}', async () => {
    const token = await signer.issueLicenseGrant({
      listing_id: 'l1',
      buyer_id: 'b1',
      version: '1.0',
      scopes: ['use'],
      seats: 1,
    });
    const headerB64 = token.split('.')[0]!;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });

  it('token payload contains expected claims', async () => {
    const token = await signer.issueLicenseGrant({
      listing_id: 'l1',
      buyer_id: 'b1',
      version: '2.0',
      scopes: ['use', 'modify'],
      seats: 5,
    });
    const result = verifyLicenseToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.listing_id).toBe('l1');
    expect(result.payload?.buyer_id).toBe('b1');
    expect(result.payload?.version).toBe('2.0');
    expect(result.payload?.scopes).toEqual(['use', 'modify']);
    expect(result.payload?.seats).toBe(5);
  });

  it('token has iat and exp with ~365d difference', async () => {
    const token = await signer.issueLicenseGrant({
      listing_id: 'l1',
      buyer_id: 'b1',
      version: '1.0',
      scopes: ['use'],
      seats: 1,
    });
    const result = verifyLicenseToken(token);
    expect(result.valid).toBe(true);
    const iat = result.payload?.iat as number;
    const exp = result.payload?.exp as number;
    const diffDays = (exp - iat) / (24 * 60 * 60);
    expect(diffDays).toBeCloseTo(365, 0);
  });

  it('verifyLicenseToken returns false for invalid token', () => {
    const result = verifyLicenseToken('invalid.token.here');
    expect(result.valid).toBe(false);
  });

  it('verifyLicenseToken returns false for tampered payload', async () => {
    const token = await signer.issueLicenseGrant({
      listing_id: 'l1',
      buyer_id: 'b1',
      version: '1.0',
      scopes: ['use'],
      seats: 1,
    });
    const parts = token.split('.');
    // Tamper with payload
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    payload.buyer_id = 'attacker';
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = verifyLicenseToken(tamperedToken);
    expect(result.valid).toBe(false);
  });
});
